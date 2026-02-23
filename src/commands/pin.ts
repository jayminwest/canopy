import { join } from "node:path";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { acquireLock, appendJsonl, dedupById, readJsonl, releaseLock } from "../store.ts";
import type { Prompt } from "../types.ts";

export default async function pin(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	const nameArg = args.filter((a) => !a.startsWith("--"))[0];
	if (!nameArg) {
		if (json) {
			jsonOut({ success: false, command: "pin", error: "Usage: cn pin <name>@<version>" });
		} else {
			errorOut("Usage: cn pin <name>@<version>");
		}
		process.exit(1);
	}

	// Parse name@version
	const atIdx = nameArg.lastIndexOf("@");
	if (atIdx === -1) {
		if (json) {
			jsonOut({ success: false, command: "pin", error: "Usage: cn pin <name>@<version>" });
		} else {
			errorOut("Usage: cn pin <name>@<version>");
		}
		process.exit(1);
	}

	const name = nameArg.slice(0, atIdx);
	const version = Number.parseInt(nameArg.slice(atIdx + 1), 10);

	if (Number.isNaN(version)) {
		errorOut("Version must be an integer");
		process.exit(1);
	}

	await acquireLock(promptsPath);
	try {
		const allRecords = await readJsonl<Prompt>(promptsPath);
		const current = dedupById(allRecords);

		const prompt = current.find((p) => p.name === name);
		if (!prompt) {
			if (json) {
				jsonOut({ success: false, command: "pin", error: `Prompt '${name}' not found` });
			} else {
				errorOut(`Prompt '${name}' not found`);
			}
			process.exit(1);
		}

		// Verify the target version exists
		const targetVersion = allRecords.find((p) => p.id === prompt.id && p.version === version);
		if (!targetVersion) {
			if (json) {
				jsonOut({
					success: false,
					command: "pin",
					error: `Version ${version} of '${name}' not found`,
				});
			} else {
				errorOut(`Version ${version} of '${name}' not found`);
			}
			process.exit(1);
		}

		const updated: Prompt = {
			...prompt,
			pinned: version,
			version: prompt.version + 1,
			updatedAt: new Date().toISOString(),
		};

		await appendJsonl(promptsPath, updated);

		if (json) {
			jsonOut({ success: true, command: "pin", name, pinned: version });
		} else {
			humanOut(`${c.green("✓")} Pinned ${c.bold(name)} to v${version}`);
		}
	} finally {
		releaseLock(promptsPath);
	}
}

export async function defaultUnpin(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	const name = args.filter((a) => !a.startsWith("--"))[0];
	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "unpin", error: "Prompt name required" });
		} else {
			errorOut("Usage: cn unpin <name>");
		}
		process.exit(1);
	}

	await acquireLock(promptsPath);
	try {
		const allRecords = await readJsonl<Prompt>(promptsPath);
		const current = dedupById(allRecords);

		const prompt = current.find((p) => p.name === name);
		if (!prompt) {
			if (json) {
				jsonOut({ success: false, command: "unpin", error: `Prompt '${name}' not found` });
			} else {
				errorOut(`Prompt '${name}' not found`);
			}
			process.exit(1);
		}

		const updated: Prompt = {
			...prompt,
			version: prompt.version + 1,
			updatedAt: new Date().toISOString(),
		};
		updated.pinned = undefined;

		await appendJsonl(promptsPath, updated);

		if (json) {
			jsonOut({ success: true, command: "unpin", name });
		} else {
			humanOut(`${c.green("✓")} Unpinned ${c.bold(name)}`);
		}
	} finally {
		releaseLock(promptsPath);
	}
}
