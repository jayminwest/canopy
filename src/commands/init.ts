import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { saveConfig } from "../config.ts";
import { errorOut, humanOut, jsonOut } from "../output.ts";
import { ExitError } from "../types.ts";

export default async function init(_args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const canopyDir = join(cwd, ".canopy");

	if (_args.includes("--help") || _args.includes("-h")) {
		humanOut(`Usage: cn init

Initializes .canopy/ in the current directory with config and empty JSONL stores.`);
		return;
	}

	if (existsSync(canopyDir)) {
		if (json) {
			jsonOut({ success: false, command: "init", error: ".canopy/ already exists" });
		} else {
			errorOut(".canopy/ already exists");
		}
		throw new ExitError(1);
	}

	mkdirSync(canopyDir, { recursive: true });

	// Write default config
	await saveConfig(cwd, {
		project: "canopy",
		version: "1",
		emitDir: "agents",
	});

	// Write .gitignore for .canopy/
	await Bun.write(join(canopyDir, ".gitignore"), "*.lock\n");

	// Create empty JSONL files
	await Bun.write(join(canopyDir, "prompts.jsonl"), "");
	await Bun.write(join(canopyDir, "schemas.jsonl"), "");

	// Append .gitattributes to project root
	const gitattrsPath = join(cwd, ".gitattributes");
	const gitattrsEntry = ".canopy/prompts.jsonl merge=union\n.canopy/schemas.jsonl merge=union\n";

	let existing = "";
	try {
		existing = await Bun.file(gitattrsPath).text();
	} catch {
		existing = "";
	}

	if (!existing.includes(".canopy/prompts.jsonl")) {
		await Bun.write(gitattrsPath, existing + gitattrsEntry);
	}

	if (json) {
		jsonOut({ success: true, command: "init", dir: canopyDir });
	} else {
		humanOut(`Initialized .canopy/ in ${cwd}`);
		humanOut("  config.yaml: project=canopy, emitDir=agents");
		humanOut("  prompts.jsonl created");
		humanOut("  schemas.jsonl created");
		humanOut("  .gitattributes updated with merge=union");
	}
}

export function register(program: Command): void {
	program
		.command("init")
		.description("Initialize .canopy/ in current directory")
		.option("--json", "Output as JSON")
		.action(async (options: { json?: boolean }) => {
			const args = options.json ? ["--json"] : [];
			await init(args, options.json ?? false);
		});
}
