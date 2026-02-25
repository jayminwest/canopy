import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sync from "./sync.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-sync");

function captureOutput(fn: () => Promise<void>): Promise<{ stdout: string; stderr: string }> {
	const origLog = console.log;
	const origError = console.error;
	let stdout = "";
	let stderr = "";
	console.log = (...args: unknown[]) => {
		stdout += `${args.join(" ")}\n`;
	};
	console.error = (...args: unknown[]) => {
		stderr += `${args.join(" ")}\n`;
	};
	return fn()
		.then(() => {
			console.log = origLog;
			console.error = origError;
			return { stdout, stderr };
		})
		.catch((err) => {
			console.log = origLog;
			console.error = origError;
			throw err;
		});
}

function git(args: string[], cwd: string): void {
	const result = Bun.spawnSync(["git", ...args], { cwd });
	if (result.exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
	}
}

function initGitRepo(dir: string): void {
	mkdirSync(dir, { recursive: true });
	git(["init"], dir);
	git(["config", "user.email", "test@example.com"], dir);
	git(["config", "user.name", "Test"], dir);
	// Create .canopy/ dir so git tracks it
	mkdirSync(join(dir, ".canopy"), { recursive: true });
	writeFileSync(join(dir, ".canopy", "config.yaml"), "version: 1\n");
	git(["add", ".canopy/"], dir);
	git(["commit", "-m", "initial"], dir);
}

beforeEach(() => {
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	if (existsSync(tmpDir)) {
		rmSync(tmpDir, { recursive: true });
	}
});

describe("cn sync", () => {
	it("reports nothing to commit when .canopy/ is clean", async () => {
		initGitRepo(tmpDir);
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => sync([], false));
			expect(stdout).toContain("Nothing to commit");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("stages and commits changed files", async () => {
		initGitRepo(tmpDir);
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			// Add a new file to .canopy/
			writeFileSync(join(tmpDir, ".canopy", "prompts.jsonl"), '{"id":"p1"}\n');

			const { stdout } = await captureOutput(() => sync([], false));
			expect(stdout).toContain("Committed");
			expect(stdout).toContain("file(s)");

			// Verify it was committed
			const logResult = Bun.spawnSync(["git", "log", "--oneline"], { cwd: tmpDir });
			const log = logResult.stdout.toString();
			expect(log).toContain("canopy: sync");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("commit message includes today's date", async () => {
		initGitRepo(tmpDir);
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			writeFileSync(join(tmpDir, ".canopy", "prompts.jsonl"), '{"id":"p1"}\n');

			await captureOutput(() => sync([], false));

			const logResult = Bun.spawnSync(["git", "log", "--oneline"], { cwd: tmpDir });
			const log = logResult.stdout.toString();
			const today = new Date().toISOString().slice(0, 10);
			expect(log).toContain(`canopy: sync ${today}`);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--status reports clean state", async () => {
		initGitRepo(tmpDir);
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => sync(["--status"], false));
			expect(stdout).toContain("clean");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--status reports uncommitted files without committing", async () => {
		initGitRepo(tmpDir);
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			writeFileSync(join(tmpDir, ".canopy", "prompts.jsonl"), '{"id":"p1"}\n');

			const { stdout } = await captureOutput(() => sync(["--status"], false));
			expect(stdout).toContain("uncommitted");

			// Verify nothing was committed (only 1 commit — the initial one)
			const logResult = Bun.spawnSync(["git", "log", "--oneline"], { cwd: tmpDir });
			const lines = logResult.stdout.toString().trim().split("\n");
			expect(lines).toHaveLength(1);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON on --json flag when nothing to commit", async () => {
		initGitRepo(tmpDir);
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => sync(["--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("sync");
			expect(parsed.committed).toBe(false);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON on --json flag after successful commit", async () => {
		initGitRepo(tmpDir);
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			writeFileSync(join(tmpDir, ".canopy", "prompts.jsonl"), '{"id":"p1"}\n');

			const { stdout } = await captureOutput(() => sync(["--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("sync");
			expect(parsed.committed).toBe(true);
			expect(parsed.files.length).toBeGreaterThan(0);
			expect(parsed.message).toContain("canopy: sync");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--status --json returns uncommitted file list", async () => {
		initGitRepo(tmpDir);
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			writeFileSync(join(tmpDir, ".canopy", "prompts.jsonl"), '{"id":"p1"}\n');

			const { stdout } = await captureOutput(() => sync(["--status", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.uncommitted).toBe(true);
			expect(parsed.files.length).toBeGreaterThan(0);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("throws ExitError when not in a git repo", async () => {
		// Use a directory outside of any git repo (in system tmp)
		const noGitDir = `/tmp/cn-test-no-git-${Date.now()}`;
		mkdirSync(noGitDir, { recursive: true });
		const origCwd = process.cwd();
		process.chdir(noGitDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => sync([], false));
			} catch {
				threw = true;
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
			rmSync(noGitDir, { recursive: true });
		}
	});
});
