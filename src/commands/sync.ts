import { c, errorOut, humanOut, jsonOut } from "../output.ts";

export default async function sync(args: string[], json: boolean): Promise<void> {
	const statusOnly = args.includes("--status");
	const cwd = process.cwd();

	// Check git status of .canopy/
	const statusResult = Bun.spawnSync(["git", "status", "--porcelain", ".canopy/"], { cwd });

	if (statusResult.exitCode !== 0) {
		const stderr = statusResult.stderr.toString();
		if (json) {
			jsonOut({ success: false, command: "sync", error: stderr });
		} else {
			errorOut(`git error: ${stderr}`);
		}
		process.exit(1);
	}

	const statusOutput = statusResult.stdout.toString().trim();
	const changedFiles = statusOutput
		? statusOutput.split("\n").map((line) => line.trim().split(" ").pop() ?? "")
		: [];

	if (statusOnly) {
		if (json) {
			jsonOut({
				success: true,
				command: "sync",
				uncommitted: changedFiles.length > 0,
				files: changedFiles,
			});
		} else {
			if (changedFiles.length === 0) {
				humanOut(c.green("✓ .canopy/ is clean (no uncommitted changes)"));
			} else {
				humanOut(c.yellow(`${changedFiles.length} uncommitted file(s):`));
				for (const f of changedFiles) {
					humanOut(`  ${f}`);
				}
			}
		}
		return;
	}

	if (changedFiles.length === 0) {
		if (json) {
			jsonOut({ success: true, command: "sync", committed: false, message: "Nothing to commit" });
		} else {
			humanOut(c.dim("Nothing to commit in .canopy/"));
		}
		return;
	}

	// Stage .canopy/ changes
	const addResult = Bun.spawnSync(["git", "add", ".canopy/"], { cwd });
	if (addResult.exitCode !== 0) {
		const err = addResult.stderr.toString();
		if (json) {
			jsonOut({ success: false, command: "sync", error: err });
		} else {
			errorOut(`git add failed: ${err}`);
		}
		process.exit(1);
	}

	// Commit
	const msg = `canopy: sync ${new Date().toISOString().slice(0, 10)}`;
	const commitResult = Bun.spawnSync(["git", "commit", "-m", msg], { cwd });

	if (commitResult.exitCode !== 0) {
		const err = commitResult.stderr.toString();
		if (json) {
			jsonOut({ success: false, command: "sync", error: err });
		} else {
			errorOut(`git commit failed: ${err}`);
		}
		process.exit(1);
	}

	if (json) {
		jsonOut({ success: true, command: "sync", committed: true, files: changedFiles, message: msg });
	} else {
		humanOut(`${c.green("✓")} Committed ${changedFiles.length} file(s): ${msg}`);
	}
}
