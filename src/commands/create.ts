import { join } from "node:path";
import { loadConfig } from "../config.ts";
import { generateId } from "../id.ts";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { acquireLock, appendJsonl, dedupById, readJsonl, releaseLock } from "../store.ts";
import type { Prompt, Section } from "../types.ts";

export default async function create(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	// Parse flags
	let name = "";
	let extendsName: string | undefined;
	const tags: string[] = [];
	let schema: string | undefined;
	let emitAs: string | undefined;
	let status: "draft" | "active" = "active";

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--name" && args[i + 1]) {
			name = args[++i] ?? "";
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
		}
	}

	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "create", error: "--name is required" });
		} else {
			errorOut("--name is required");
		}
		process.exit(1);
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
			process.exit(1);
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
				process.exit(1);
			}
		}

		const id = generateId(
			config.project,
			current.map((p) => p.id),
		);
		const now = new Date().toISOString();

		const sections: Section[] = [];

		const prompt: Prompt = {
			id,
			name,
			version: 1,
			sections,
			status,
			createdAt: now,
			updatedAt: now,
		};

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
