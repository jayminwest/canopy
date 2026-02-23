import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { saveConfig } from "../config.ts";
import { errorOut, humanOut, jsonOut } from "../output.ts";

export default async function init(_args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const canopyDir = join(cwd, ".canopy");

	if (existsSync(canopyDir)) {
		if (json) {
			jsonOut({ success: false, command: "init", error: ".canopy/ already exists" });
		} else {
			errorOut(".canopy/ already exists");
		}
		process.exit(1);
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

	if (!existing.includes("merge=union")) {
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
