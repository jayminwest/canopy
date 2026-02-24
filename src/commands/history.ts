import { join } from "node:path";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { dedupById, getVersions, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";

export default async function history(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn history <name> [options]

Options:
  --limit <n>    Max versions to show (default: 20)
  --json         Output as JSON`);
		return;
	}

	const name = args.filter((a) => !a.startsWith("--"))[0];
	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "history", error: "Prompt name required" });
		} else {
			errorOut("Usage: cn history <name> [--limit <n>]");
		}
		throw new ExitError(1);
	}

	let limit = 20;
	const limitIdx = args.indexOf("--limit");
	if (limitIdx !== -1 && args[limitIdx + 1]) {
		limit = Number.parseInt(args[limitIdx + 1] ?? "20", 10);
	}

	const allRecords = await readJsonl<Prompt>(promptsPath);

	// Find the ID for this prompt name
	const current = dedupById(allRecords);
	const prompt = current.find((p) => p.name === name);
	if (!prompt) {
		if (json) {
			jsonOut({ success: false, command: "history", error: `Prompt '${name}' not found` });
		} else {
			errorOut(`Prompt '${name}' not found`);
		}
		throw new ExitError(1);
	}

	const versions = getVersions(allRecords, prompt.id).reverse().slice(0, limit);

	if (json) {
		jsonOut({ success: true, command: "history", name, versions });
		return;
	}

	humanOut(`${c.bold(name)} — version history (${versions.length} versions)`);
	humanOut("");

	for (const v of versions) {
		const isCurrent = v.version === prompt.version;
		const marker = isCurrent ? c.green(" ◀ current") : "";
		const pinned = v.pinned !== undefined ? c.yellow(` (pinned @${v.pinned})`) : "";
		humanOut(`  ${c.bold(`v${v.version}`)}${marker}${pinned}  ${c.dim(v.updatedAt)}`);
		humanOut(`    sections: ${v.sections.map((s) => s.name).join(", ") || c.dim("(none)")}`);
	}
}
