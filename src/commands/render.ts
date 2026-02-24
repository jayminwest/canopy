import { join } from "node:path";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { resolvePrompt } from "../render.ts";
import { dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";

export default async function renderCmd(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn render <name>[@version] [options]

Options:
  --format md|json    Output format (default: md)
  --json              Output as JSON`);
		return;
	}

	const nameArg = args.filter((a) => !a.startsWith("--"))[0];
	if (!nameArg) {
		if (json) {
			jsonOut({ success: false, command: "render", error: "Prompt name required" });
		} else {
			errorOut("Usage: cn render <name>[@version] [--format md|json]");
		}
		throw new ExitError(1);
	}

	// Parse name@version
	let name = nameArg;
	let version: number | undefined;
	const atIdx = nameArg.lastIndexOf("@");
	if (atIdx !== -1) {
		name = nameArg.slice(0, atIdx);
		version = Number.parseInt(nameArg.slice(atIdx + 1), 10);
	}

	// Parse format
	let format = "md";
	const fmtIdx = args.indexOf("--format");
	if (fmtIdx !== -1 && args[fmtIdx + 1]) {
		format = args[fmtIdx + 1] ?? "md";
	}

	const allRecords = await readJsonl<Prompt>(promptsPath);
	const current = dedupById(allRecords);

	try {
		const result = resolvePrompt(name, current, version);

		if (json) {
			jsonOut({
				success: true,
				command: "render",
				name,
				version: result.version,
				sections: result.sections,
				resolvedFrom: result.resolvedFrom,
			});
		} else if (format === "json") {
			jsonOut({
				name,
				version: result.version,
				sections: result.sections,
				resolvedFrom: result.resolvedFrom,
			});
		} else {
			// Markdown format
			humanOut(c.bold(`# ${name}`) + c.dim(` (v${result.version})`));
			humanOut(c.dim(`Resolved from: ${result.resolvedFrom.join(" → ")}`));
			humanOut("");

			for (const section of result.sections) {
				humanOut(`## ${section.name}`);
				humanOut("");
				humanOut(section.body);
				humanOut("");
			}
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		if (json) {
			jsonOut({ success: false, command: "render", error: msg });
		} else {
			errorOut(`Error: ${msg}`);
		}
		throw new ExitError(1);
	}
}
