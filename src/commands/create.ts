import { join } from "node:path";
import { loadConfig } from "../config.ts";
import { generateId } from "../id.ts";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { acquireLock, appendJsonl, dedupById, readJsonl, releaseLock } from "../store.ts";
import type { Prompt, Section } from "../types.ts";
import { ExitError } from "../types.ts";

export default async function create(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn create --name <name> [options]

Options:
  --name <name>           Prompt name (required)
  --description <text>    Short description
  --extends <name>        Inherit from parent prompt
  --tag <tag>             Add tag (repeatable)
  --schema <name>         Assign validation schema
  --emit-as <filename>    Custom emit filename
  --status draft|active   Initial status (default: active)
  --section <name> --body <text>  Add section
  --section <name>=<text>         Add section (shorthand)
  --json                  Output as JSON`);
		return;
	}

	// Parse flags
	let name = "";
	let description: string | undefined;
	let extendsName: string | undefined;
	const tags: string[] = [];
	let schema: string | undefined;
	let emitAs: string | undefined;
	let status: "draft" | "active" = "active";
	const sections: Section[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--name" && args[i + 1]) {
			name = args[++i] ?? "";
		} else if (arg === "--description" && args[i + 1]) {
			description = args[++i];
		} else if (arg === "--extends" && args[i + 1]) {
			extendsName = args[++i];
		} else if (arg === "--tag" && args[i + 1]) {
			tags.push(args[++i] ?? "");
		} else if (arg === "--schema" && args[i + 1]) {
			schema = args[++i];
		} else if (arg === "--emit-as" && args[i + 1]) {
			emitAs = args[++i];
		} else if (arg === "--status" && args[i + 1]) {
			const s = args[++i];
			if (s === "draft" || s === "active") {
				status = s;
			}
		} else if (arg === "--section" && args[i + 1]) {
			const next = args[++i] ?? "";
			const eqIdx = next.indexOf("=");
			if (eqIdx !== -1) {
				// --section name=body
				const sName = next.slice(0, eqIdx);
				const sBody = next.slice(eqIdx + 1);
				if (sName) sections.push({ name: sName, body: sBody });
			} else {
				// --section name --body value
				const sName = next;
				if (args[i + 1] === "--body" && args[i + 2] !== undefined) {
					i++; // skip --body
					const sBody = args[++i] ?? "";
					sections.push({ name: sName, body: sBody });
				} else {
					sections.push({ name: sName, body: "" });
				}
			}
		}
	}

	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "create", error: "--name is required" });
		} else {
			errorOut("--name is required");
		}
		throw new ExitError(1);
	}

	const config = await loadConfig(cwd);

	await acquireLock(promptsPath);
	try {
		const allRecords = await readJsonl<Prompt>(promptsPath);
		const current = dedupById(allRecords);

		// Check for name collision
		const exists = current.find((p) => p.name === name && p.status !== "archived");
		if (exists) {
			if (json) {
				jsonOut({
					success: false,
					command: "create",
					error: `Prompt name '${name}' already exists`,
				});
			} else {
				errorOut(`Prompt name '${name}' already exists`);
			}
			throw new ExitError(1);
		}

		// Validate parent if specified
		if (extendsName) {
			const parent = current.find((p) => p.name === extendsName);
			if (!parent) {
				if (json) {
					jsonOut({
						success: false,
						command: "create",
						error: `Parent prompt '${extendsName}' not found`,
					});
				} else {
					errorOut(`Parent prompt '${extendsName}' not found`);
				}
				throw new ExitError(1);
			}
		}

		const id = generateId(
			config.project,
			current.map((p) => p.id),
		);
		const now = new Date().toISOString();

		const prompt: Prompt = {
			id,
			name,
			version: 1,
			sections,
			status,
			createdAt: now,
			updatedAt: now,
		};

		if (description) prompt.description = description;
		if (extendsName) prompt.extends = extendsName;
		if (tags.length > 0) prompt.tags = tags;
		if (schema) prompt.schema = schema;
		if (emitAs) prompt.emitAs = emitAs;

		await appendJsonl(promptsPath, prompt);

		if (json) {
			jsonOut({ success: true, command: "create", id, name });
		} else {
			humanOut(`${c.green("✓")} Created prompt ${c.bold(name)} (${id})`);
		}
	} finally {
		releaseLock(promptsPath);
	}
}
