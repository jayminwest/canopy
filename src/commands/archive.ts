import { join } from "node:path";
import type { Command } from "commander";
import { c, errorOut, fmt, humanOut, jsonOut } from "../output.ts";
import { acquireLock, appendJsonl, dedupById, readJsonl, releaseLock } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";

export default async function archive(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn archive <name> [options]

Options:
  --json    Output as JSON`);
		return;
	}

	const name = args.filter((a) => !a.startsWith("--"))[0];
	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "archive", error: "Prompt name required" });
		} else {
			errorOut("Usage: cn archive <name>");
		}
		throw new ExitError(1);
	}

	await acquireLock(promptsPath);
	try {
		const allRecords = await readJsonl<Prompt>(promptsPath);
		const current = dedupById(allRecords);

		const prompt = current.find((p) => p.name === name);
		if (!prompt) {
			if (json) {
				jsonOut({ success: false, command: "archive", error: `Prompt '${name}' not found` });
			} else {
				errorOut(`Prompt '${name}' not found`);
			}
			throw new ExitError(1);
		}

		if (prompt.status === "archived") {
			if (json) {
				jsonOut({
					success: false,
					command: "archive",
					error: `Prompt '${name}' is already archived`,
				});
			} else {
				errorOut(`Prompt '${name}' is already archived`);
			}
			throw new ExitError(1);
		}

		const updated: Prompt = {
			...prompt,
			status: "archived",
			version: prompt.version + 1,
			updatedAt: new Date().toISOString(),
		};

		await appendJsonl(promptsPath, updated);

		if (json) {
			jsonOut({ success: true, command: "archive", id: updated.id, name: updated.name });
		} else {
			humanOut(`${fmt.success("Archived prompt")} ${c.bold(name)}`);
		}
	} finally {
		releaseLock(promptsPath);
	}
}

export function register(program: Command): void {
	program
		.command("archive")
		.description("Archive a prompt")
		.argument("<name>", "Prompt name")
		.option("--json", "Output as JSON")
		.action(async (name: string, options: { json?: boolean }) => {
			const args = [name, ...(options.json ? ["--json"] : [])];
			await archive(args, options.json ?? false);
		});
}
