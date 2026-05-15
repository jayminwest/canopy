import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv";
import { configSchema } from "../config-schema.ts";

const CLI = join(import.meta.dir, "../../src/index.ts");

let tmpDir: string;

interface ProcResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

async function run(args: string[], cwd: string): Promise<ProcResult> {
	const proc = Bun.spawn(["bun", "run", CLI, ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, NO_COLOR: "1" },
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

async function runJson<T = unknown>(args: string[], cwd: string): Promise<T> {
	const { stdout } = await run([...args, "--json"], cwd);
	return JSON.parse(stdout) as T;
}

beforeEach(async () => {
	tmpDir = await mkdtemp(join(tmpdir(), "canopy-config-test-"));
	const init = await run(["init"], tmpDir);
	expect(init.exitCode).toBe(0);
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("cn config --help", () => {
	test("lists schema, show, set, unset as subcommands", async () => {
		const { stdout, exitCode } = await run(["config", "--help"], tmpDir);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("schema");
		expect(stdout).toContain("show");
		expect(stdout).toContain("set");
		expect(stdout).toContain("unset");
	});
});

describe("cn config schema", () => {
	test("CLI emits valid JSON to stdout with --json", async () => {
		const { stdout, exitCode } = await run(["config", "schema", "--json"], tmpDir);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout) as Record<string, unknown>;
		expect(parsed.title).toBe("Canopy project config");
		expect(parsed.$id).toBe("https://github.com/jayminwest/canopy/config.schema.json");
		expect(parsed.required).toEqual(["project", "version"]);
		expect(parsed.additionalProperties).toBe(false);
	});

	test("schema CLI output matches in-process configSchema() (golden)", async () => {
		const { stdout } = await run(["config", "schema", "--json"], tmpDir);
		const fromCli = JSON.parse(stdout);
		expect(fromCli).toEqual(configSchema());
	});

	test("schema compiles via AJV after stripping $schema URI", async () => {
		const { stdout } = await run(["config", "schema", "--json"], tmpDir);
		const { $schema: _meta, ...schema } = JSON.parse(stdout) as Record<string, unknown>;
		const ajv = new Ajv({ allErrors: true, strict: false });
		expect(() => ajv.compile(schema)).not.toThrow();
	});

	test("default (no --json) is pretty-printed multi-line JSON", async () => {
		const { stdout, exitCode } = await run(["config", "schema"], tmpDir);
		expect(exitCode).toBe(0);
		expect(stdout.split("\n").length).toBeGreaterThan(5);
		const parsed = JSON.parse(stdout);
		expect(parsed.title).toBe("Canopy project config");
	});
});

describe("cn config show", () => {
	test("shows full config as YAML by default", async () => {
		const { stdout, exitCode } = await run(["config", "show"], tmpDir);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("project: canopy");
		expect(stdout).toContain("version:");
		expect(stdout).toContain("targets:");
	});

	test("shows full config as JSON with --json", async () => {
		const result = await runJson<{
			success: boolean;
			command: string;
			config: Record<string, unknown>;
		}>(["config", "show"], tmpDir);
		expect(result.success).toBe(true);
		expect(result.command).toBe("config show");
		expect(result.config.project).toBe("canopy");
		expect(result.config.version).toBe("1");
	});

	test("shows scalar at --path without quotes", async () => {
		const { stdout, exitCode } = await run(["config", "show", "--path", "project"], tmpDir);
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe("canopy");
	});

	test("shows nested scalar at --path", async () => {
		const { stdout, exitCode } = await run(
			["config", "show", "--path", "targets.default.dir"],
			tmpDir,
		);
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe("agents");
	});

	test("shows scalar via JSON envelope with --json", async () => {
		const result = await runJson<{ value: unknown; path: string; success: boolean }>(
			["config", "show", "--path", "project"],
			tmpDir,
		);
		expect(result.success).toBe(true);
		expect(result.path).toBe("project");
		expect(result.value).toBe("canopy");
	});

	test("--path on a nested map prints YAML", async () => {
		const { stdout, exitCode } = await run(["config", "show", "--path", "targets.default"], tmpDir);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("dir: agents");
	});

	test("errors on missing path", async () => {
		const { stderr, exitCode } = await run(["config", "show", "--path", "nope.gone"], tmpDir);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Path not found");
	});
});

describe("cn config set", () => {
	test("sets project name and persists atomically to disk", async () => {
		const { exitCode } = await run(["config", "set", "project", "renamed"], tmpDir);
		expect(exitCode).toBe(0);
		const onDisk = await readFile(join(tmpDir, ".canopy", "config.yaml"), "utf8");
		expect(onDisk).toContain("project: renamed");
	});

	test("leaves no .tmp.* files behind after success", async () => {
		await run(["config", "set", "project", "newname"], tmpDir);
		const files = await readdir(join(tmpDir, ".canopy"));
		expect(files.filter((f) => f.includes(".tmp."))).toEqual([]);
	});

	test("leaves no .tmp.* files behind after validation failure", async () => {
		const { exitCode } = await run(["config", "set", "bogus_key", "1"], tmpDir);
		expect(exitCode).toBe(1);
		const files = await readdir(join(tmpDir, ".canopy"));
		expect(files.filter((f) => f.includes(".tmp."))).toEqual([]);
	});

	test("releases the lock on validation failure (no stale .lock file)", async () => {
		await run(["config", "set", "bogus_key", "1"], tmpDir);
		const files = await readdir(join(tmpDir, ".canopy"));
		expect(files.filter((f) => f.endsWith(".lock"))).toEqual([]);
	});

	test("rejects unknown root keys (additionalProperties: false)", async () => {
		const { stderr, exitCode } = await run(["config", "set", "bogus_key", "1"], tmpDir);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Config validation failed");
	});

	test("rejects wrong type at project (string expected)", async () => {
		const { stderr, exitCode } = await run(["config", "set", "project", "[]"], tmpDir);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Config validation failed");
	});

	test("rejects empty-string project (violates minLength: 1)", async () => {
		// Quoted empty string passes through parseScalarOrFlow as "".
		const { stderr, exitCode } = await run(["config", "set", "project", '""'], tmpDir);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Config validation failed");
	});

	test("rejects malformed YAML flow value", async () => {
		const { stderr, exitCode } = await run(
			["config", "set", "targets.broken", "{unclosed"],
			tmpDir,
		);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Unclosed flow mapping");
	});

	test("rejects target missing required dir", async () => {
		const { stderr, exitCode } = await run(
			["config", "set", "targets.docs", "{tags: [doc]}"],
			tmpDir,
		);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Config validation failed");
	});

	test("rejects unknown property inside an EmitTarget", async () => {
		const { stderr, exitCode } = await run(
			["config", "set", "targets.docs", "{dir: docs/prompts, bogus: 1}"],
			tmpDir,
		);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Config validation failed");
	});

	test("creates a nested target via flow map", async () => {
		const { exitCode } = await run(
			["config", "set", "targets.docs", "{dir: docs/prompts, tags: [doc]}"],
			tmpDir,
		);
		expect(exitCode).toBe(0);
		const result = await runJson<{ value: { dir: string; tags: string[] } }>(
			["config", "show", "--path", "targets.docs"],
			tmpDir,
		);
		expect(result.value.dir).toBe("docs/prompts");
		expect(result.value.tags).toEqual(["doc"]);
	});

	test("updates an existing leaf field on a nested target", async () => {
		const { exitCode } = await run(
			["config", "set", "targets.default.dir", "other-agents"],
			tmpDir,
		);
		expect(exitCode).toBe(0);
		const result = await runJson<{ value: unknown }>(
			["config", "show", "--path", "targets.default.dir"],
			tmpDir,
		);
		expect(result.value).toBe("other-agents");
	});

	test("--json envelopes the set response", async () => {
		const result = await runJson<{
			success: boolean;
			command: string;
			path: string;
			value: unknown;
		}>(["config", "set", "project", "renamed"], tmpDir);
		expect(result.success).toBe(true);
		expect(result.command).toBe("config set");
		expect(result.path).toBe("project");
		expect(result.value).toBe("renamed");
	});
});

describe("cn config unset", () => {
	test("removes a present nested target", async () => {
		await run(["config", "set", "targets.docs", "{dir: docs/prompts}"], tmpDir);
		const { exitCode } = await run(["config", "unset", "targets.docs"], tmpDir);
		expect(exitCode).toBe(0);
		const onDisk = await readFile(join(tmpDir, ".canopy", "config.yaml"), "utf8");
		expect(onDisk).not.toContain("docs/prompts");
	});

	test("is idempotent (noop) on absent paths with removed: false", async () => {
		const result = await runJson<{ removed: boolean; success: boolean }>(
			["config", "unset", "missing.path"],
			tmpDir,
		);
		expect(result.success).toBe(true);
		expect(result.removed).toBe(false);
	});

	test("rejects unset of required project", async () => {
		const { stderr, exitCode } = await run(["config", "unset", "project"], tmpDir);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Config validation failed");
	});

	test("rejects unset of required version", async () => {
		const { stderr, exitCode } = await run(["config", "unset", "version"], tmpDir);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Config validation failed");
	});

	test("leaves no stale .lock file after a rejected unset", async () => {
		await run(["config", "unset", "project"], tmpDir);
		const files = await readdir(join(tmpDir, ".canopy"));
		expect(files.filter((f) => f.endsWith(".lock"))).toEqual([]);
	});
});

describe("cn config concurrency", () => {
	test("5 concurrent sets on disjoint paths all succeed; final file is schema-valid", async () => {
		const writes = [
			run(["config", "set", "targets.t1", "{dir: d1}"], tmpDir),
			run(["config", "set", "targets.t2", "{dir: d2}"], tmpDir),
			run(["config", "set", "targets.t3", "{dir: d3}"], tmpDir),
			run(["config", "set", "targets.t4", "{dir: d4}"], tmpDir),
			run(["config", "set", "targets.t5", "{dir: d5}"], tmpDir),
		];
		const results = await Promise.all(writes);
		for (const r of results) {
			expect(r.exitCode).toBe(0);
		}

		// Every target must be present in the final file (no writes lost)
		const final = await runJson<{ config: Record<string, unknown> }>(["config", "show"], tmpDir);
		const targets = final.config.targets as Record<string, unknown>;
		for (const name of ["t1", "t2", "t3", "t4", "t5"]) {
			expect(targets[name]).toBeDefined();
		}

		// And the final file validates against the canonical schema
		const { $schema: _meta, ...schema } = configSchema();
		const ajv = new Ajv({ allErrors: true, strict: false });
		const validate = ajv.compile(schema);
		expect(validate(final.config)).toBe(true);

		// No stale .lock or .tmp.* files
		const files = await readdir(join(tmpDir, ".canopy"));
		expect(files.filter((f) => f.endsWith(".lock"))).toEqual([]);
		expect(files.filter((f) => f.includes(".tmp."))).toEqual([]);
	});
});
