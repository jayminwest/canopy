import { join } from "node:path";
import type { Command } from "commander";
import { generateId } from "../id.ts";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { acquireLock, appendJsonl, dedupByIdLast, readJsonl, releaseLock } from "../store.ts";
import type { Schema, ValidationRule } from "../types.ts";
import { ExitError } from "../types.ts";

export default async function schema(args: string[], json: boolean): Promise<void> {
	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn schema <subcommand> [options]

Subcommands:
  create --name <name> --required <sections> [--optional <sections>]
  show <name>
  list
  rule add <schema> --section <name> --pattern <regex> --message <text>

Options:
  --json    Output as JSON`);
		return;
	}

	const subcommand = args[0];

	switch (subcommand) {
		case "create":
			await schemaCreate(args.slice(1), json);
			break;
		case "show":
			await schemaShow(args.slice(1), json);
			break;
		case "list":
			await schemaList(args.slice(1), json);
			break;
		case "rule":
			if (args[1] === "add") {
				await schemaRuleAdd(args.slice(2), json);
			} else {
				errorOut(`Unknown schema rule subcommand: ${args[1]}`);
				throw new ExitError(1);
			}
			break;
		default:
			if (json) {
				jsonOut({ success: false, command: "schema", error: `Unknown subcommand: ${subcommand}` });
			} else {
				errorOut(
					`Unknown schema subcommand: ${subcommand}\nUsage: cn schema create|show|list|rule`,
				);
			}
			throw new ExitError(1);
	}
}

async function schemaCreate(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const schemasPath = join(cwd, ".canopy", "schemas.jsonl");

	let name = "";
	const requiredSections: string[] = [];
	const optionalSections: string[] = [];

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--name" && args[i + 1]) {
			name = args[++i] ?? "";
		} else if (args[i] === "--required" && args[i + 1]) {
			const parsed = (args[++i] ?? "")
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			requiredSections.push(...parsed);
		} else if (args[i] === "--optional" && args[i + 1]) {
			const parsed = (args[++i] ?? "")
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			optionalSections.push(...parsed);
		}
	}

	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "schema create", error: "--name is required" });
		} else {
			errorOut("--name is required");
		}
		throw new ExitError(1);
	}

	await acquireLock(schemasPath);
	try {
		const allRecords = await readJsonl<Schema>(schemasPath);
		const current = dedupByIdLast(allRecords);

		if (current.find((s) => s.name === name)) {
			if (json) {
				jsonOut({
					success: false,
					command: "schema create",
					error: `Schema '${name}' already exists`,
				});
			} else {
				errorOut(`Schema '${name}' already exists`);
			}
			throw new ExitError(1);
		}

		const id = generateId(
			"schema",
			current.map((s) => s.id),
		);
		const now = new Date().toISOString();

		const schemaRecord: Schema = {
			id,
			name,
			requiredSections,
			optionalSections: optionalSections.length > 0 ? optionalSections : undefined,
			createdAt: now,
			updatedAt: now,
		};

		await appendJsonl(schemasPath, schemaRecord);

		if (json) {
			jsonOut({ success: true, command: "schema create", id, name });
		} else {
			humanOut(`${c.green("✓")} Created schema ${c.bold(name)} (${id})`);
		}
	} finally {
		releaseLock(schemasPath);
	}
}

async function schemaShow(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const schemasPath = join(cwd, ".canopy", "schemas.jsonl");

	const name = args.filter((a) => !a.startsWith("--"))[0];
	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "schema show", error: "Schema name required" });
		} else {
			errorOut("Usage: cn schema show <name>");
		}
		throw new ExitError(1);
	}

	const allRecords = await readJsonl<Schema>(schemasPath);
	const current = dedupByIdLast(allRecords);
	const schemaRecord = current.find((s) => s.name === name);

	if (!schemaRecord) {
		if (json) {
			jsonOut({ success: false, command: "schema show", error: `Schema '${name}' not found` });
		} else {
			errorOut(`Schema '${name}' not found`);
		}
		throw new ExitError(1);
	}

	if (json) {
		jsonOut({ success: true, command: "schema show", schema: schemaRecord });
	} else {
		humanOut(`${c.bold(schemaRecord.name)} (${schemaRecord.id})`);
		humanOut(`Required: ${schemaRecord.requiredSections.join(", ") || c.dim("(none)")}`);
		if (schemaRecord.optionalSections?.length) {
			humanOut(`Optional: ${schemaRecord.optionalSections.join(", ")}`);
		}
		if (schemaRecord.rules?.length) {
			humanOut("\nRules:");
			for (const rule of schemaRecord.rules) {
				humanOut(`  ${c.cyan(rule.section)}: /${rule.pattern}/ → "${rule.message}"`);
			}
		}
	}
}

async function schemaList(_args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const schemasPath = join(cwd, ".canopy", "schemas.jsonl");

	const allRecords = await readJsonl<Schema>(schemasPath);
	const schemas = dedupByIdLast(allRecords);

	if (json) {
		jsonOut({ success: true, command: "schema list", schemas, count: schemas.length });
	} else {
		if (schemas.length === 0) {
			humanOut("No schemas found.");
			return;
		}
		for (const s of schemas) {
			const required = s.requiredSections.join(", ") || c.dim("(none)");
			humanOut(`${c.bold(s.name)}  required: ${required}  ${c.dim(s.id)}`);
		}
	}
}

async function schemaRuleAdd(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const schemasPath = join(cwd, ".canopy", "schemas.jsonl");

	const schemaName = args.filter((a) => !a.startsWith("--"))[0];
	if (!schemaName) {
		if (json) {
			jsonOut({ success: false, command: "schema rule add", error: "Schema name required" });
		} else {
			errorOut(
				"Usage: cn schema rule add <schema-name> --section <name> --pattern <regex> --message <text>",
			);
		}
		throw new ExitError(1);
	}

	let section = "";
	let pattern = "";
	let message = "";

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--section" && args[i + 1]) {
			section = args[++i] ?? "";
		} else if (args[i] === "--pattern" && args[i + 1]) {
			pattern = args[++i] ?? "";
		} else if (args[i] === "--message" && args[i + 1]) {
			message = args[++i] ?? "";
		}
	}

	if (!section || !pattern || !message) {
		if (json) {
			jsonOut({
				success: false,
				command: "schema rule add",
				error: "--section, --pattern, and --message are required",
			});
		} else {
			errorOut("--section, --pattern, and --message are required");
		}
		throw new ExitError(1);
	}

	await acquireLock(schemasPath);
	try {
		const allRecords = await readJsonl<Schema>(schemasPath);
		const current = dedupByIdLast(allRecords);

		const schemaRecord = current.find((s) => s.name === schemaName);
		if (!schemaRecord) {
			if (json) {
				jsonOut({
					success: false,
					command: "schema rule add",
					error: `Schema '${schemaName}' not found`,
				});
			} else {
				errorOut(`Schema '${schemaName}' not found`);
			}
			throw new ExitError(1);
		}

		const rule: ValidationRule = { section, pattern, message };
		const updated: Schema = {
			...schemaRecord,
			rules: [...(schemaRecord.rules ?? []), rule],
			updatedAt: new Date().toISOString(),
		};

		// Append updated schema (dedup on read handles version management for schemas)
		await appendJsonl(schemasPath, updated);

		if (json) {
			jsonOut({ success: true, command: "schema rule add", schema: schemaName, rule });
		} else {
			humanOut(`${c.green("✓")} Added rule to ${c.bold(schemaName)}: /${pattern}/ on "${section}"`);
		}
	} finally {
		releaseLock(schemasPath);
	}
}

export function register(program: Command): void {
	const schemaCmd = program
		.command("schema")
		.description("Schema management (create, show, list, rule add)");

	schemaCmd
		.command("create")
		.description("Create a validation schema")
		.requiredOption("--name <name>", "Schema name")
		.option(
			"--required <sections>",
			"Required sections (comma-separated, repeatable)",
			(v: string, a: string[]) => a.concat([v]),
			[] as string[],
		)
		.option(
			"--optional <sections>",
			"Optional sections (comma-separated, repeatable)",
			(v: string, a: string[]) => a.concat([v]),
			[] as string[],
		)
		.action(async (opts) => {
			const json: boolean = program.opts().json ?? false;
			const args: string[] = ["--name", opts.name as string];
			for (const r of opts.required as string[]) args.push("--required", r);
			for (const o of opts.optional as string[]) args.push("--optional", o);
			await schemaCreate(args, json);
		});

	schemaCmd
		.command("show")
		.description("Show schema details")
		.argument("<name>", "Schema name")
		.action(async (name: string) => {
			const json: boolean = program.opts().json ?? false;
			await schemaShow([name], json);
		});

	schemaCmd
		.command("list")
		.description("List all schemas")
		.action(async () => {
			const json: boolean = program.opts().json ?? false;
			await schemaList([], json);
		});

	const ruleCmd = schemaCmd.command("rule").description("Schema rule management");

	ruleCmd
		.command("add")
		.description("Add a validation rule to a schema")
		.argument("<schema>", "Schema name")
		.requiredOption("--section <name>", "Section to validate")
		.requiredOption("--pattern <regex>", "Regex pattern that must match")
		.requiredOption("--message <text>", "Error message if validation fails")
		.action(async (schemaName: string, opts) => {
			const json: boolean = program.opts().json ?? false;
			await schemaRuleAdd(
				[
					schemaName,
					"--section",
					opts.section as string,
					"--pattern",
					opts.pattern as string,
					"--message",
					opts.message as string,
				],
				json,
			);
		});
}
