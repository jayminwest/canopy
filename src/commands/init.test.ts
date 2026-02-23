import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import init from "./init.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-init");

// Capture stdout/stderr
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

beforeEach(() => {
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	if (existsSync(tmpDir)) {
		rmSync(tmpDir, { recursive: true });
	}
});

describe("cn init", () => {
	it("creates .canopy/ directory and files", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);

		try {
			const { stdout } = await captureOutput(() => init([], false));
			expect(stdout).toContain("Initialized");
			expect(existsSync(join(tmpDir, ".canopy"))).toBe(true);
			expect(existsSync(join(tmpDir, ".canopy", "config.yaml"))).toBe(true);
			expect(existsSync(join(tmpDir, ".canopy", "prompts.jsonl"))).toBe(true);
			expect(existsSync(join(tmpDir, ".canopy", "schemas.jsonl"))).toBe(true);
			expect(existsSync(join(tmpDir, ".canopy", ".gitignore"))).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON on --json flag", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);

		try {
			const { stdout } = await captureOutput(() => init(["--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("init");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("appends merge=union to .gitattributes", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);

		try {
			await captureOutput(() => init([], false));
			const gitattrs = await Bun.file(join(tmpDir, ".gitattributes")).text();
			expect(gitattrs).toContain("merge=union");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("fails if .canopy/ already exists", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);

		try {
			await captureOutput(() => init([], false));

			// Second init should fail
			let exitCalled = false;
			const origExit = process.exit.bind(process);
			(process as { exit: (code?: number) => never }).exit = () => {
				exitCalled = true;
				throw new Error("process.exit called");
			};

			try {
				await captureOutput(() => init([], false));
			} catch {
				// expected
			}

			(process as { exit: (code?: number) => never }).exit = origExit;
			expect(exitCalled).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});
});
