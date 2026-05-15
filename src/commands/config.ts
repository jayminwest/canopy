// `cn config` — schema-driven read/write surface for `.canopy/config.yaml`.
//
// Designed as warren V2's wire contract (warren ROADMAP R-10):
//   - `cn config schema --json` emits the JSON Schema (warren auto-renders a form)
//   - `cn config show [--path <p>]` reads the current value
//   - `cn config set <path> <value>` validates + writes atomically (YAML-parsed)
//   - `cn config unset <path>` removes a value
//
// Writes hold the config.yaml advisory lock; mutations validate the entire
// post-write file against configSchema() before persisting. Errors are thrown
// (never process.exit) so the lock's finally block runs and no stale .lock
// file is left behind (failure mx-4a480a, convention mx-301cd1).

import { randomBytes } from "node:crypto";
import { renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import Ajv, { type ErrorObject } from "ajv";
import type { Command } from "commander";
import { configSchema } from "../config-schema.ts";
import { errorOut, fmt, humanOut, jsonOut, palette } from "../output.ts";
import { acquireLock, releaseLock } from "../store.ts";
import { ExitError } from "../types.ts";
import {
	parseScalarOrFlow,
	parseYaml,
	serializeYaml,
	type YamlMap,
	type YamlScalar,
} from "../yaml.ts";

function configPath(cwd: string): string {
	return join(cwd, ".canopy", "config.yaml");
}

function pathParts(path: string): string[] {
	const parts = path.split(".").filter((p) => p.length > 0);
	if (parts.length === 0) throw new Error("Config path must be non-empty");
	return parts;
}

function describeType(v: unknown): string {
	if (v === null) return "null";
	if (Array.isArray(v)) return "array";
	return typeof v;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Coerce the canopy string-only YamlMap into a typed view for schema validation.
// canopy's parseYaml returns strings for all scalars; the schema expects a
// boolean for `targets.<name>.default`, so map "true"/"false" → boolean here.
// Other fields stay as strings (project, version, dir) which matches the schema.
function toTypedView(raw: YamlMap): Record<string, YamlScalar> {
	const out: Record<string, YamlScalar> = {};
	for (const [k, v] of Object.entries(raw)) {
		if (k === "targets" && isPlainObject(v)) {
			out.targets = coerceTargetsBlock(v as YamlMap);
		} else {
			out[k] = v as YamlScalar;
		}
	}
	return out;
}

function coerceTargetsBlock(targets: YamlMap): Record<string, YamlScalar> {
	const out: Record<string, YamlScalar> = {};
	for (const [name, target] of Object.entries(targets)) {
		if (!isPlainObject(target)) {
			out[name] = target as YamlScalar;
			continue;
		}
		const t: Record<string, YamlScalar> = {};
		for (const [tk, tv] of Object.entries(target as YamlMap)) {
			if (tk === "default" && (tv === "true" || tv === "false")) {
				t[tk] = tv === "true";
			} else {
				t[tk] = tv as YamlScalar;
			}
		}
		out[name] = t;
	}
	return out;
}

// Convert the typed view back to canopy's string-only YamlMap for serialization.
// Booleans/numbers stringify (matches existing canopy convention: `default: "true"`
// stored in saveConfig). Arrays of non-strings get String()-coerced; the schema
// only allows string arrays (targets.<name>.tags), so this is lossless in practice.
function toYamlMap(data: Record<string, YamlScalar>): YamlMap {
	const out: YamlMap = {};
	for (const [k, v] of Object.entries(data)) {
		out[k] = scalarToYamlValue(v);
	}
	return out;
}

function scalarToYamlValue(v: YamlScalar): YamlMap[string] {
	if (v === null) return "";
	if (typeof v === "boolean") return v ? "true" : "false";
	if (typeof v === "number") return String(v);
	if (typeof v === "string") return v;
	if (Array.isArray(v)) return v.map((item) => String(item));
	return toYamlMap(v as Record<string, YamlScalar>);
}

function getAtPath(data: YamlScalar, parts: string[]): YamlScalar | undefined {
	let cur: YamlScalar = data;
	for (const p of parts) {
		if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
		cur = (cur as Record<string, YamlScalar>)[p] as YamlScalar;
		if (cur === undefined) return undefined;
	}
	return cur;
}

function setAtPath(data: Record<string, YamlScalar>, parts: string[], value: YamlScalar): void {
	let cur: Record<string, YamlScalar> = data;
	for (let i = 0; i < parts.length - 1; i++) {
		const p = parts[i];
		if (p === undefined) continue;
		const nxt = cur[p];
		if (nxt === undefined || nxt === null) {
			const empty: Record<string, YamlScalar> = {};
			cur[p] = empty;
			cur = empty;
		} else if (typeof nxt === "object" && !Array.isArray(nxt)) {
			cur = nxt as Record<string, YamlScalar>;
		} else {
			const soFar = parts.slice(0, i + 1).join(".");
			throw new Error(`Cannot set: '${soFar}' is not an object (got: ${describeType(nxt)})`);
		}
	}
	const last = parts[parts.length - 1];
	if (last !== undefined) cur[last] = value;
}

function unsetAtPath(data: Record<string, YamlScalar>, parts: string[]): boolean {
	let cur: Record<string, YamlScalar> = data;
	for (let i = 0; i < parts.length - 1; i++) {
		const p = parts[i];
		if (p === undefined) continue;
		const nxt = cur[p];
		if (nxt === null || typeof nxt !== "object" || Array.isArray(nxt)) return false;
		cur = nxt as Record<string, YamlScalar>;
	}
	const last = parts[parts.length - 1];
	if (last === undefined) return false;
	if (!(last in cur)) return false;
	delete cur[last];
	return true;
}

function validateConfig(data: unknown): void {
	// Strip the meta-schema URI: configSchema() advertises draft 2020-12 for
	// downstream consumers (warren's UI), but AJV runs default draft-07 mode and
	// rejects unknown $schema URIs under strict mode.
	const { $schema: _meta, ...schema } = configSchema();
	const ajv = new Ajv({ allErrors: true, strict: false });
	const validate = ajv.compile(schema);
	if (!validate(data)) {
		const lines = (validate.errors ?? []).map(formatAjvError);
		throw new Error(`Config validation failed:\n${lines.join("\n")}`);
	}
}

function formatAjvError(e: ErrorObject): string {
	const base = e.instancePath.replace(/^\//, "").replace(/\//g, ".");
	let path = base;
	if (e.keyword === "required") {
		const prop = (e.params as { missingProperty?: string }).missingProperty;
		if (prop) path = base ? `${base}.${prop}` : prop;
	}
	return `  ${path || "(root)"}: ${e.message ?? e.keyword}`;
}

async function readRawConfig(cwd: string): Promise<Record<string, YamlScalar>> {
	const path = configPath(cwd);
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new Error(`Config not found at ${path}`);
	}
	const content = await file.text();
	return toTypedView(parseYaml(content));
}

async function writeRawConfig(cwd: string, data: Record<string, YamlScalar>): Promise<void> {
	const path = configPath(cwd);
	const tmpPath = `${path}.tmp.${randomBytes(4).toString("hex")}`;
	try {
		await Bun.write(tmpPath, serializeYaml(toYamlMap(data)));
		renameSync(tmpPath, path);
	} catch (err) {
		try {
			unlinkSync(tmpPath);
		} catch {
			// best-effort tmp cleanup
		}
		throw err;
	}
}

function displayValue(v: YamlScalar): string {
	if (typeof v === "string") return v;
	return JSON.stringify(v);
}

async function runSchema(jsonMode: boolean): Promise<void> {
	const schema = configSchema();
	if (jsonMode) {
		console.log(JSON.stringify(schema));
		return;
	}
	console.log(JSON.stringify(schema, null, 2));
}

async function runShow(pathArg: string | undefined, jsonMode: boolean): Promise<void> {
	const cwd = process.cwd();
	let raw: Record<string, YamlScalar>;
	try {
		raw = await readRawConfig(cwd);
	} catch (err) {
		emitError("config show", err, jsonMode);
		throw new ExitError(1);
	}

	if (pathArg) {
		const parts = pathParts(pathArg);
		const value = getAtPath(raw as YamlScalar, parts);
		if (value === undefined) {
			emitError("config show", new Error(`Path not found: ${pathArg}`), jsonMode);
			throw new ExitError(1);
		}
		if (jsonMode) {
			jsonOut({ success: true, command: "config show", path: pathArg, value });
		} else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
			process.stdout.write(serializeYaml(toYamlMap(value as Record<string, YamlScalar>)));
		} else if (typeof value === "string") {
			console.log(value);
		} else {
			console.log(JSON.stringify(value));
		}
		return;
	}

	if (jsonMode) {
		jsonOut({ success: true, command: "config show", config: raw });
	} else {
		process.stdout.write(serializeYaml(toYamlMap(raw)));
	}
}

async function runSet(pathArg: string, valueArg: string, jsonMode: boolean): Promise<void> {
	const cwd = process.cwd();
	const path = configPath(cwd);

	let parts: string[];
	let value: YamlScalar;
	try {
		parts = pathParts(pathArg);
		value = parseScalarOrFlow(valueArg);
	} catch (err) {
		emitError("config set", err, jsonMode);
		throw new ExitError(1);
	}

	await acquireLock(path);
	try {
		let raw: Record<string, YamlScalar>;
		try {
			raw = await readRawConfig(cwd);
			setAtPath(raw, parts, value);
			validateConfig(raw);
			await writeRawConfig(cwd, raw);
		} catch (err) {
			emitError("config set", err, jsonMode);
			throw new ExitError(1);
		}
	} finally {
		releaseLock(path);
	}

	if (jsonMode) {
		jsonOut({ success: true, command: "config set", path: pathArg, value });
	} else {
		humanOut(
			`${fmt.success("Set")} ${palette.accent(pathArg)} ${palette.muted("=")} ${displayValue(value)}`,
		);
	}
}

async function runUnset(pathArg: string, jsonMode: boolean): Promise<void> {
	const cwd = process.cwd();
	const path = configPath(cwd);

	let parts: string[];
	try {
		parts = pathParts(pathArg);
	} catch (err) {
		emitError("config unset", err, jsonMode);
		throw new ExitError(1);
	}

	let removed = false;
	await acquireLock(path);
	try {
		try {
			const raw = await readRawConfig(cwd);
			removed = unsetAtPath(raw, parts);
			if (removed) {
				validateConfig(raw);
				await writeRawConfig(cwd, raw);
			}
		} catch (err) {
			emitError("config unset", err, jsonMode);
			throw new ExitError(1);
		}
	} finally {
		releaseLock(path);
	}

	if (jsonMode) {
		jsonOut({ success: true, command: "config unset", path: pathArg, removed });
	} else if (removed) {
		humanOut(`${fmt.success("Unset")} ${palette.accent(pathArg)}`);
	} else {
		humanOut(palette.muted(`No such path: ${pathArg}`));
	}
}

function emitError(command: string, err: unknown, jsonMode: boolean): void {
	const msg = err instanceof Error ? err.message : String(err);
	if (jsonMode) {
		jsonOut({ success: false, command, error: msg });
	} else {
		errorOut(`Error: ${msg}`);
	}
}

export function registerConfigCommand(program: Command): void {
	const config = program
		.command("config")
		.description("Read, write, and inspect .canopy/config.yaml");

	config
		.command("schema")
		.description("Emit the JSON Schema for .canopy/config.yaml")
		.option("--json", "Compact single-line JSON (default is pretty-printed)")
		.action(async (opts: Record<string, unknown>) => {
			const jsonMode = opts.json === true || program.opts().json === true;
			await runSchema(jsonMode);
		});

	config
		.command("show")
		.description("Print the current config (or a value at --path)")
		.option("--path <path>", "Dot-path to read (e.g. targets.default.dir)")
		.option("--json", "Output as JSON")
		.action(async (opts: Record<string, unknown>) => {
			const jsonMode = opts.json === true || program.opts().json === true;
			await runShow(opts.path as string | undefined, jsonMode);
		});

	config
		.command("set <path> <value>")
		.description("Set a config value at <path>; <value> is YAML-parsed")
		.option("--json", "Output as JSON")
		.action(async (path: string, value: string, opts: Record<string, unknown>) => {
			const jsonMode = opts.json === true || program.opts().json === true;
			await runSet(path, value, jsonMode);
		});

	config
		.command("unset <path>")
		.description("Remove the config value at <path>")
		.option("--json", "Output as JSON")
		.action(async (path: string, opts: Record<string, unknown>) => {
			const jsonMode = opts.json === true || program.opts().json === true;
			await runUnset(path, jsonMode);
		});
}
