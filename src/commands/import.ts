import { join } from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../config.ts";
import { generateId } from "../id.ts";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { acquireLock, appendJsonl, dedupById, readJsonl, releaseLock } from "../store.ts";
import type { Prompt, Section } from "../types.ts";
import { ExitError } from "../types.ts";

function splitMarkdown(content: string): Section[] {
	const sections: Section[] = [];
	const lines = content.split("\n");
	let currentName = "intro";
	let currentLines: string[] = [];

	function flush() {
		const body = currentLines.join("\n").trim();
		if (body || currentName !== "intro") {
			sections.push({ name: currentName, body });
		}
		currentLines = [];
	}

	for (const line of lines) {
		// Match ## headings
		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch) {
			flush();
			const heading = headingMatch[1] ?? "";
			currentName = heading;
		} else {
			currentLines.push(line);
		}
	}

	flush();

	return sections.filter((s) => s.body !== "");
}

export default async function importCmd(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn import <path> --name <name> [options]

Options:
  --name <name>    Prompt name (required)
  --no-split       Import as single body section (default: split on ## headings)
  --tag <tag>      Add tag (repeatable)
  --json           Output as JSON`);
		return;
	}

	const pathArg = args.filter((a) => !a.startsWith("--"))[0];
	if (!pathArg) {
		if (json) {
			jsonOut({ success: false, command: "import", error: "File path required" });
		} else {
			errorOut("Usage: cn import <path> --name <name> [--no-split] [--tag <tag>]");
		}
		throw new ExitError(1);
	}

	let name = "";
	let noSplit = false;
	const tags: string[] = [];

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--name" && args[i + 1]) {
			name = args[++i] ?? "";
		} else if (args[i] === "--no-split") {
			noSplit = true;
		} else if (args[i] === "--tag" && args[i + 1]) {
			tags.push(args[++i] ?? "");
		}
	}

	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "import", error: "--name is required" });
		} else {
			errorOut("--name is required");
		}
		throw new ExitError(1);
	}

	// Read input file
	let content: string;
	try {
		content = await Bun.file(pathArg).text();
	} catch {
		if (json) {
			jsonOut({ success: false, command: "import", error: `Cannot read file: ${pathArg}` });
		} else {
			errorOut(`Cannot read file: ${pathArg}`);
		}
		throw new ExitError(1);
	}

	const sections: Section[] = noSplit
		? [{ name: "body", body: content.trim() }]
		: splitMarkdown(content);

	const config = await loadConfig(cwd);

	await acquireLock(promptsPath);
	try {
		const allRecords = await readJsonl<Prompt>(promptsPath);
		const current = dedupById(allRecords);

		// Check for name collision
		if (current.find((p) => p.name === name && p.status !== "archived")) {
			if (json) {
				jsonOut({
					success: false,
					command: "import",
					error: `Prompt name '${name}' already exists`,
				});
			} else {
				errorOut(`Prompt name '${name}' already exists`);
			}
			throw new ExitError(1);
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
			status: "active",
			createdAt: now,
			updatedAt: now,
		};

		if (tags.length > 0) prompt.tags = tags;

		await appendJsonl(promptsPath, prompt);

		if (json) {
			jsonOut({
				success: true,
				command: "import",
				id,
				name,
				sections: sections.length,
			});
		} else {
			humanOut(
				`${c.green("✓")} Imported ${c.bold(name)} (${id}) with ${sections.length} section(s)`,
			);
		}
	} finally {
		releaseLock(promptsPath);
	}
}

export function register(program: Command): void {
	program
		.command("import")
		.description("Import an existing .md file as a prompt")
		.argument("<path>", "Path to the markdown file")
		.requiredOption("--name <name>", "Prompt name")
		.option("--no-split", "Import as single body section (default: split on ## headings)")
		.option(
			"--tag <tag>",
			"Add tag (repeatable)",
			(v: string, a: string[]) => a.concat([v]),
			[] as string[],
		)
		.action(async (filePath: string, opts: Record<string, unknown>) => {
			const json: boolean = program.opts().json ?? false;
			const args: string[] = [filePath, "--name", opts.name as string];
			if (!opts.split) args.push("--no-split");
			for (const tag of opts.tag as string[]) args.push("--tag", tag);
			await importCmd(args, json);
		});
}
