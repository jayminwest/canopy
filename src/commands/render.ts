import { join } from "node:path";
import type { Command } from "commander";
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
				frontmatter: result.frontmatter,
			});
		} else if (format === "json") {
			jsonOut({
				name,
				version: result.version,
				sections: result.sections,
				resolvedFrom: result.resolvedFrom,
				frontmatter: result.frontmatter,
			});
		} else {
			// Markdown format
			humanOut(c.bold(`# ${name}`) + c.dim(` (v${result.version})`));
			humanOut(c.dim(`Resolved from: ${result.resolvedFrom.join(" → ")}`));
			humanOut("");

			if (Object.keys(result.frontmatter).length > 0) {
				humanOut("---");
				for (const [key, value] of Object.entries(result.frontmatter)) {
					humanOut(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
				}
				humanOut("---");
				humanOut("");
			}

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

export function register(program: Command): void {
	program
		.command("render")
		.description("Render full prompt (resolve inheritance)")
		.argument("<name>", "Prompt name (name[@version])")
		.option("--format <format>", "Output format: md or json (default: md)")
		.option("--json", "Output as JSON")
		.action(async (name: string, options: { format?: string; json?: boolean }) => {
			const args = [name];
			if (options.format) args.push("--format", options.format);
			if (options.json) args.push("--json");
			await renderCmd(args, options.json ?? false);
		});
}
