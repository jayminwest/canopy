import { join } from "node:path";
import type { Command } from "commander";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { acquireLock, appendJsonl, dedupById, readJsonl, releaseLock } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";

export default async function update(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn update <name> [options]

Options:
  --name <name>              Rename prompt
  --description <text>       Update description
  --section <name> --body <text>  Update section body
  --section <name>=<text>         Update section (shorthand)
  --add-section <name> --body <text>  Add new section with body (repeatable)
  --add-section <name>=<text>        Add new section (shorthand, repeatable)
  --remove-section <name>    Remove section (empty body, repeatable)
  --tag <tag>                Add tag (repeatable)
  --untag <tag>              Remove tag (repeatable)
  --schema <name>            Assign schema
  --extends <name>           Change parent
  --emit-as <filename>       Custom emit filename
  --status draft|active|archived  Change status
  --json                     Output as JSON`);
		return;
	}

	const nameArg = args.filter((a) => !a.startsWith("--"))[0];
	if (!nameArg) {
		if (json) {
			jsonOut({ success: false, command: "update", error: "Prompt name required" });
		} else {
			errorOut("Usage: cn update <name> [options]");
		}
		throw new ExitError(1);
	}

	// Parse flags
	let sectionName: string | undefined;
	let sectionBody: string | undefined;
	const addSections: Array<{ name: string; body: string }> = [];
	const removeSections: string[] = [];
	const addTags: string[] = [];
	const removeTags: string[] = [];
	let newDescription: string | undefined;
	let newSchema: string | undefined;
	let newExtends: string | undefined;
	let newEmitAs: string | undefined;
	let newStatus: string | undefined;
	let newName: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--section" && args[i + 1]) {
			const next = args[++i] ?? "";
			const eqIdx = next.indexOf("=");
			if (eqIdx !== -1) {
				// --section name=body shorthand
				sectionName = next.slice(0, eqIdx);
				sectionBody = next.slice(eqIdx + 1);
			} else {
				sectionName = next;
			}
		} else if (arg === "--body" && args[i + 1] !== undefined) {
			// body may be empty string
			sectionBody = args[++i];
		} else if (arg === "--add-section" && args[i + 1]) {
			const next = args[++i] ?? "";
			const eqIdx = next.indexOf("=");
			if (eqIdx !== -1) {
				// --add-section name=body shorthand
				addSections.push({ name: next.slice(0, eqIdx), body: next.slice(eqIdx + 1) });
			} else {
				let body = "";
				// lookahead for --body
				if (args[i + 1] === "--body" && args[i + 2] !== undefined) {
					i++; // skip --body
					body = args[++i] ?? "";
				}
				addSections.push({ name: next, body });
			}
		} else if (arg === "--remove-section" && args[i + 1]) {
			removeSections.push(args[++i] ?? "");
		} else if (arg === "--tag" && args[i + 1]) {
			addTags.push(args[++i] ?? "");
		} else if (arg === "--untag" && args[i + 1]) {
			removeTags.push(args[++i] ?? "");
		} else if (arg === "--description" && args[i + 1]) {
			newDescription = args[++i];
		} else if (arg === "--schema" && args[i + 1]) {
			newSchema = args[++i];
		} else if (arg === "--extends" && args[i + 1]) {
			newExtends = args[++i];
		} else if (arg === "--emit-as" && args[i + 1]) {
			newEmitAs = args[++i];
		} else if (arg === "--status" && args[i + 1]) {
			newStatus = args[++i];
		} else if (arg === "--name" && args[i + 1]) {
			newName = args[++i];
		}
	}

	await acquireLock(promptsPath);
	try {
		const allRecords = await readJsonl<Prompt>(promptsPath);
		const current = dedupById(allRecords);

		const prompt = current.find((p) => p.name === nameArg);
		if (!prompt) {
			if (json) {
				jsonOut({ success: false, command: "update", error: `Prompt '${nameArg}' not found` });
			} else {
				errorOut(`Prompt '${nameArg}' not found`);
			}
			throw new ExitError(1);
		}

		// Clone and apply mutations
		const updated: Prompt = {
			...prompt,
			sections: [...prompt.sections.map((s) => ({ ...s }))],
			version: prompt.version + 1,
			updatedAt: new Date().toISOString(),
		};

		// Update section body
		if (sectionName !== undefined && sectionBody !== undefined) {
			const idx = updated.sections.findIndex((s) => s.name === sectionName);
			if (idx !== -1) {
				const existing = updated.sections[idx];
				if (existing) updated.sections[idx] = { ...existing, body: sectionBody };
			} else {
				updated.sections.push({ name: sectionName, body: sectionBody });
			}
		}

		// Add new sections
		for (const { name: addName, body: addBody } of addSections) {
			const existingIdx = updated.sections.findIndex((s) => s.name === addName);
			if (existingIdx !== -1) {
				const existingSec = updated.sections[existingIdx];
				if (existingSec) updated.sections[existingIdx] = { ...existingSec, body: addBody };
			} else {
				updated.sections.push({ name: addName, body: addBody });
			}
		}

		// Remove sections (empty body override)
		for (const removeName of removeSections) {
			const idx = updated.sections.findIndex((s) => s.name === removeName);
			if (idx !== -1) {
				const existing = updated.sections[idx];
				if (existing) updated.sections[idx] = { ...existing, body: "" };
			} else {
				updated.sections.push({ name: removeName, body: "" });
			}
		}

		// Tags
		const currentTags = new Set(updated.tags ?? []);
		for (const t of addTags) currentTags.add(t);
		for (const t of removeTags) currentTags.delete(t);
		updated.tags = currentTags.size > 0 ? Array.from(currentTags) : undefined;

		if (newDescription !== undefined) updated.description = newDescription;
		if (newSchema !== undefined) updated.schema = newSchema;
		if (newExtends !== undefined) updated.extends = newExtends;
		if (newEmitAs !== undefined) updated.emitAs = newEmitAs;
		if (newStatus === "draft" || newStatus === "active" || newStatus === "archived") {
			updated.status = newStatus;
		}
		if (newName !== undefined) updated.name = newName;

		await appendJsonl(promptsPath, updated);

		if (json) {
			jsonOut({
				success: true,
				command: "update",
				id: updated.id,
				name: updated.name,
				version: updated.version,
			});
		} else {
			humanOut(`${c.green("✓")} Updated ${c.bold(updated.name)} → v${updated.version}`);
		}
	} finally {
		releaseLock(promptsPath);
	}
}

export function register(program: Command): void {
	program
		.command("update")
		.description("Update a prompt (creates new version)")
		.argument("<name>", "Prompt name")
		.option("--name <name>", "Rename prompt")
		.option("--description <text>", "Update description")
		.option("--section <name>", "Section to update (use with --body or name=body shorthand)")
		.option("--body <text>", "New body for the section specified by --section")
		.option(
			"--add-section <name>",
			"Add a new section (use name=body shorthand, repeatable)",
			(v: string, a: string[]) => a.concat([v]),
			[] as string[],
		)
		.option(
			"--remove-section <name>",
			"Remove a section (sets body to empty, repeatable)",
			(v: string, a: string[]) => a.concat([v]),
			[] as string[],
		)
		.option(
			"--tag <tag>",
			"Add tag (repeatable)",
			(v: string, a: string[]) => a.concat([v]),
			[] as string[],
		)
		.option(
			"--untag <tag>",
			"Remove tag (repeatable)",
			(v: string, a: string[]) => a.concat([v]),
			[] as string[],
		)
		.option("--schema <name>", "Assign schema")
		.option("--extends <name>", "Change parent prompt")
		.option("--emit-as <filename>", "Custom emit filename")
		.option("--status <status>", "Change status (draft|active|archived)")
		.action(async (nameArg: string, opts: Record<string, unknown>) => {
			const json: boolean = program.opts().json ?? false;
			const args: string[] = [nameArg];
			if (opts.name) args.push("--name", opts.name as string);
			if (opts.description) args.push("--description", opts.description as string);
			if (opts.section) {
				args.push("--section", opts.section as string);
				if (opts.body !== undefined) args.push("--body", opts.body as string);
			}
			for (const sec of opts.addSection as string[]) args.push("--add-section", sec);
			for (const sec of opts.removeSection as string[]) args.push("--remove-section", sec);
			for (const tag of opts.tag as string[]) args.push("--tag", tag);
			for (const tag of opts.untag as string[]) args.push("--untag", tag);
			if (opts.schema) args.push("--schema", opts.schema as string);
			if (opts.extends) args.push("--extends", opts.extends as string);
			if (opts.emitAs) args.push("--emit-as", opts.emitAs as string);
			if (opts.status) args.push("--status", opts.status as string);
			await update(args, json);
		});
}
