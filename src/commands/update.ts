import { join } from "node:path";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { acquireLock, appendJsonl, dedupById, readJsonl, releaseLock } from "../store.ts";
import type { Prompt, Section } from "../types.ts";

export default async function update(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	const nameArg = args.filter((a) => !a.startsWith("--"))[0];
	if (!nameArg) {
		if (json) {
			jsonOut({ success: false, command: "update", error: "Prompt name required" });
		} else {
			errorOut("Usage: cn update <name> [options]");
		}
		process.exit(1);
	}

	// Parse flags
	let sectionName: string | undefined;
	let sectionBody: string | undefined;
	let addSectionName: string | undefined;
	let addSectionBody: string | undefined;
	let removeSectionName: string | undefined;
	const addTags: string[] = [];
	const removeTags: string[] = [];
	let newSchema: string | undefined;
	let newExtends: string | undefined;
	let newEmitAs: string | undefined;
	let newStatus: string | undefined;
	let newName: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--section" && args[i + 1]) {
			sectionName = args[++i];
		} else if (arg === "--body" && args[i + 1] !== undefined) {
			// body may be empty string
			sectionBody = args[++i];
		} else if (arg === "--add-section" && args[i + 1]) {
			addSectionName = args[++i];
		} else if (arg === "--remove-section" && args[i + 1]) {
			removeSectionName = args[++i];
		} else if (arg === "--tag" && args[i + 1]) {
			addTags.push(args[++i] ?? "");
		} else if (arg === "--untag" && args[i + 1]) {
			removeTags.push(args[++i] ?? "");
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
			process.exit(1);
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

		// Add new section
		if (addSectionName !== undefined) {
			const body = addSectionBody ?? sectionBody ?? "";
			const existingIdx = updated.sections.findIndex((s) => s.name === addSectionName);
			if (existingIdx !== -1) {
				const existingSec = updated.sections[existingIdx];
				if (existingSec) updated.sections[existingIdx] = { ...existingSec, body };
			} else {
				updated.sections.push({ name: addSectionName, body });
			}
		}

		// Remove section (empty body override)
		if (removeSectionName !== undefined) {
			const idx = updated.sections.findIndex((s) => s.name === removeSectionName);
			if (idx !== -1) {
				const existing = updated.sections[idx];
				if (existing) updated.sections[idx] = { ...existing, body: "" };
			} else {
				updated.sections.push({ name: removeSectionName, body: "" });
			}
		}

		// Tags
		const currentTags = new Set(updated.tags ?? []);
		for (const t of addTags) currentTags.add(t);
		for (const t of removeTags) currentTags.delete(t);
		updated.tags = currentTags.size > 0 ? Array.from(currentTags) : undefined;

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
