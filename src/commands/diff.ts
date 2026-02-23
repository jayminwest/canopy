import { join } from "node:path";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { dedupById, readJsonl } from "../store.ts";
import type { Prompt, Section } from "../types.ts";

export interface SectionChange {
	section: string;
	type: "added" | "removed" | "modified" | "unchanged";
}

export function diffSections(fromSections: Section[], toSections: Section[]): SectionChange[] {
	const changes: SectionChange[] = [];
	const fromMap = new Map(fromSections.map((s) => [s.name, s.body]));
	const toMap = new Map(toSections.map((s) => [s.name, s.body]));

	// Check all names in both versions
	const allNames = new Set([...fromMap.keys(), ...toMap.keys()]);

	for (const name of allNames) {
		const fromBody = fromMap.get(name);
		const toBody = toMap.get(name);

		if (fromBody === undefined && toBody !== undefined) {
			changes.push({ section: name, type: "added" });
		} else if (fromBody !== undefined && toBody === undefined) {
			changes.push({ section: name, type: "removed" });
		} else if (fromBody !== toBody) {
			changes.push({ section: name, type: "modified" });
		} else {
			changes.push({ section: name, type: "unchanged" });
		}
	}

	return changes;
}

export default async function diff(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	const positional = args.filter((a) => !a.startsWith("--"));
	if (positional.length < 3) {
		if (json) {
			jsonOut({ success: false, command: "diff", error: "Usage: cn diff <name> <v1> <v2>" });
		} else {
			errorOut("Usage: cn diff <name> <v1> <v2>");
		}
		process.exit(1);
	}

	const [name, v1Str, v2Str] = positional as [string, string, string];
	const v1 = Number.parseInt(v1Str, 10);
	const v2 = Number.parseInt(v2Str, 10);

	if (Number.isNaN(v1) || Number.isNaN(v2)) {
		errorOut("Versions must be integers");
		process.exit(1);
	}

	const allRecords = await readJsonl<Prompt>(promptsPath);

	// Find by name and version
	const from = allRecords.find((p) => p.name === name && p.version === v1);
	const to = allRecords.find((p) => p.name === name && p.version === v2);

	if (!from) {
		if (json) {
			jsonOut({ success: false, command: "diff", error: `Prompt '${name}@${v1}' not found` });
		} else {
			errorOut(`Prompt '${name}@${v1}' not found`);
		}
		process.exit(1);
	}

	if (!to) {
		if (json) {
			jsonOut({ success: false, command: "diff", error: `Prompt '${name}@${v2}' not found` });
		} else {
			errorOut(`Prompt '${name}@${v2}' not found`);
		}
		process.exit(1);
	}

	const changes = diffSections(from.sections, to.sections);
	const nonTrivial = changes.filter((ch) => ch.type !== "unchanged");

	if (json) {
		jsonOut({
			success: true,
			command: "diff",
			name,
			from: v1,
			to: v2,
			changes: nonTrivial,
		});
		return;
	}

	humanOut(`${c.bold(name)}: v${v1} → v${v2}`);
	humanOut("");

	if (nonTrivial.length === 0) {
		humanOut(c.dim("No section changes."));
		return;
	}

	for (const change of changes) {
		if (change.type === "unchanged") continue;

		const icon =
			change.type === "added"
				? c.green("+")
				: change.type === "removed"
					? c.red("-")
					: c.yellow("~");
		humanOut(`  ${icon} ${change.section} (${change.type})`);

		if (change.type === "modified") {
			const fromBody = from.sections.find((s) => s.name === change.section)?.body ?? "";
			const toBody = to.sections.find((s) => s.name === change.section)?.body ?? "";
			const fromLines = fromBody.split("\n").length;
			const toLines = toBody.split("\n").length;
			humanOut(c.dim(`    ${fromLines} → ${toLines} lines`));
		}
	}
}
