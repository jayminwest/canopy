import { join } from "node:path";
import type { Command } from "commander";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { dedupById, dedupByIdLast, readJsonl } from "../store.ts";
import type { Prompt, Schema } from "../types.ts";
import { ExitError } from "../types.ts";
import { validatePrompt } from "../validate.ts";

export default async function validate(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");
	const schemasPath = join(cwd, ".canopy", "schemas.jsonl");

	const allMode = args.includes("--all");

	const allPromptRecords = await readJsonl<Prompt>(promptsPath);
	const allSchemaRecords = await readJsonl<Schema>(schemasPath);
	const currentPrompts = dedupById(allPromptRecords);
	const currentSchemas = dedupByIdLast(allSchemaRecords);

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn validate <name> [options]
       cn validate --all

Options:
  --all     Validate all prompts with schemas
  --json    Output as JSON`);
		return;
	}

	if (allMode) {
		const promptsWithSchema = currentPrompts.filter((p) => p.schema && p.status !== "archived");
		const results = [];
		let allValid = true;

		for (const prompt of promptsWithSchema) {
			const schemaRecord = currentSchemas.find((s) => s.name === prompt.schema);
			if (!schemaRecord) {
				results.push({
					name: prompt.name,
					valid: false,
					errors: [{ section: "", rule: "", message: `Schema '${prompt.schema}' not found` }],
					warnings: [],
				});
				allValid = false;
				continue;
			}

			const result = validatePrompt(prompt, schemaRecord, currentPrompts);
			results.push({ name: prompt.name, ...result });
			if (!result.valid) allValid = false;
		}

		if (json) {
			jsonOut({ success: allValid, command: "validate", results, count: results.length });
		} else {
			for (const r of results) {
				const icon = r.valid ? c.green("✓") : c.red("✗");
				humanOut(`${icon} ${r.name}`);
				for (const err of r.errors) {
					humanOut(`    ${c.red("error")}: [${err.section}] ${err.message}`);
				}
				for (const w of r.warnings) {
					humanOut(`    ${c.yellow("warn")}: ${w}`);
				}
			}
			if (results.length === 0) {
				humanOut(c.dim("No prompts with schemas to validate."));
			}
		}

		if (!allValid) throw new ExitError(1);
		return;
	}

	// Single prompt validation
	const name = args.filter((a) => !a.startsWith("--"))[0];
	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "validate", error: "Prompt name or --all required" });
		} else {
			errorOut("Usage: cn validate <name> or cn validate --all");
		}
		throw new ExitError(1);
	}

	const prompt = currentPrompts.find((p) => p.name === name);
	if (!prompt) {
		if (json) {
			jsonOut({ success: false, command: "validate", error: `Prompt '${name}' not found` });
		} else {
			errorOut(`Prompt '${name}' not found`);
		}
		throw new ExitError(1);
	}

	if (!prompt.schema) {
		if (json) {
			jsonOut({
				success: false,
				command: "validate",
				error: `Prompt '${name}' has no schema assigned`,
			});
		} else {
			errorOut(`Prompt '${name}' has no schema assigned`);
		}
		throw new ExitError(1);
	}

	const schemaRecord = currentSchemas.find((s) => s.name === prompt.schema);
	if (!schemaRecord) {
		if (json) {
			jsonOut({
				success: false,
				command: "validate",
				error: `Schema '${prompt.schema}' not found`,
			});
		} else {
			errorOut(`Schema '${prompt.schema}' not found`);
		}
		throw new ExitError(1);
	}

	const result = validatePrompt(prompt, schemaRecord, currentPrompts);

	if (json) {
		jsonOut({
			success: result.valid,
			command: "validate",
			name,
			valid: result.valid,
			errors: result.errors,
			warnings: result.warnings,
		});
	} else {
		if (result.valid) {
			humanOut(`${c.green("✓")} ${name} is valid`);
			if (result.warnings.length > 0) {
				for (const w of result.warnings) {
					humanOut(`  ${c.yellow("warn")}: ${w}`);
				}
			}
		} else {
			humanOut(`${c.red("✗")} ${name} is invalid`);
			for (const err of result.errors) {
				humanOut(`  ${c.red("error")}: [${err.section}] ${err.message}`);
			}
		}
	}

	if (!result.valid) throw new ExitError(1);
}

export function register(program: Command): void {
	program
		.command("validate [name]")
		.description("Validate a prompt against its schema")
		.option("--all", "Validate all prompts with schemas")
		.action(async (name: string | undefined, opts) => {
			const json: boolean = program.opts().json ?? false;
			const args: string[] = [];
			if (name) args.push(name);
			if (opts.all) args.push("--all");
			await validate(args, json);
		});
}
