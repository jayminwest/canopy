import { join } from "node:path";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { dedupById, getVersions, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";

export default async function show(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn show <name>[@version] [options]

Options:
  --json    Output as JSON`);
		return;
	}

	// Parse name@version syntax
	const nameArg = args.filter((a) => !a.startsWith("--"))[0];
	if (!nameArg) {
		if (json) {
			jsonOut({ success: false, command: "show", error: "Prompt name required" });
		} else {
			errorOut("Usage: cn show <name>[@version]");
		}
		throw new ExitError(1);
	}

	let name = nameArg;
	let version: number | undefined;

	const atIdx = nameArg.lastIndexOf("@");
	if (atIdx !== -1) {
		name = nameArg.slice(0, atIdx);
		version = Number.parseInt(nameArg.slice(atIdx + 1), 10);
		if (Number.isNaN(version)) {
			errorOut(`Invalid version: ${nameArg.slice(atIdx + 1)}`);
			throw new ExitError(1);
		}
	}

	const allRecords = await readJsonl<Prompt>(promptsPath);

	let prompt: Prompt | undefined;
	if (version !== undefined) {
		const _versions = getVersions(allRecords, "");
		// Find by name + version
		prompt = allRecords.find((p) => p.name === name && p.version === version);
		if (!prompt) {
			// Try to find by looking at all records with that name
			const withName = allRecords.filter((p) => p.name === name);
			prompt = withName.find((p) => p.version === version);
		}
	} else {
		const current = dedupById(allRecords);
		prompt = current.find((p) => p.name === name);
	}

	if (!prompt) {
		const versionStr = version !== undefined ? `@${version}` : "";
		if (json) {
			jsonOut({
				success: false,
				command: "show",
				error: `Prompt '${name}${versionStr}' not found`,
			});
		} else {
			errorOut(`Prompt '${name}${versionStr}' not found`);
		}
		throw new ExitError(1);
	}

	if (json) {
		jsonOut({ success: true, command: "show", prompt });
	} else {
		humanOut(`${c.bold(prompt.name)} (${prompt.id}) v${prompt.version}`);
		if (prompt.description) humanOut(c.dim(prompt.description));
		humanOut(
			`Status: ${prompt.status}  Created: ${prompt.createdAt}  Updated: ${prompt.updatedAt}`,
		);
		if (prompt.extends) humanOut(`Extends: ${prompt.extends}`);
		if (prompt.tags?.length) humanOut(`Tags: ${prompt.tags.join(", ")}`);
		if (prompt.schema) humanOut(`Schema: ${prompt.schema}`);
		if (prompt.pinned !== undefined) humanOut(`Pinned: v${prompt.pinned}`);
		humanOut("");

		for (const section of prompt.sections) {
			humanOut(`${c.cyan(`## ${section.name}`)}${section.required ? " (required)" : ""}`);
			humanOut(section.body || c.dim("(empty — removed from render)"));
			humanOut("");
		}
	}
}
