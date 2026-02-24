import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { closeSync, constants, existsSync, mkdirSync, openSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { run } from "./doctor.ts";
import init from "./init.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-doctor");

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

beforeEach(async () => {
	mkdirSync(tmpDir, { recursive: true });
	const origCwd = process.cwd();
	process.chdir(tmpDir);
	await captureOutput(() => init([], false));
	process.chdir(origCwd);
});

afterEach(() => {
	if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
	process.exitCode = 0;
});

describe("cn doctor", () => {
	it("all checks pass on a valid .canopy/ directory", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => run(false, true, false));
			expect(stdout).toContain("Config is valid");
			expect(stdout).toContain("passed");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("config check fails when config is missing", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			rmSync(join(tmpDir, ".canopy", "config.yaml"));
			const { stdout } = await captureOutput(() => run(false, true, false));
			expect(stdout).toContain("config.yaml is missing");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("prompts-integrity catches bad lines", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			await Bun.write(
				promptsPath,
				'{"id":"canopy-0001","name":"test","version":1,"sections":[],"status":"active","createdAt":"2024-01-01","updatedAt":"2024-01-01"}\nBAD LINE\n',
			);
			const { stdout } = await captureOutput(() => run(false, true, false));
			expect(stdout).toContain("malformed line");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("stale-locks --fix removes old lock files", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const lockPath = join(tmpDir, ".canopy", "prompts.jsonl.lock");
			const fd = openSync(lockPath, constants.O_CREAT | constants.O_WRONLY);
			closeSync(fd);
			// Make it appear old (60 seconds ago)
			const past = new Date(Date.now() - 60000);
			utimesSync(lockPath, past, past);
			expect(existsSync(lockPath)).toBe(true);

			const { stdout } = await captureOutput(() => run(true, true, false));
			expect(stdout).toContain("Fixed:");
			expect(stdout).toContain("Removed stale");
			expect(existsSync(lockPath)).toBe(false);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("version-sync reports on version match", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => run(false, true, false));
			// version-sync reads the real package.json and index.ts — should pass when in sync
			expect(stdout).toContain("version-sync");
			expect(stdout).toContain("matches package.json");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--json output has correct shape", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => run(false, false, true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.command).toBe("doctor");
			expect(typeof parsed.success).toBe("boolean");
			expect(Array.isArray(parsed.checks)).toBe(true);
			expect(parsed.summary).toBeDefined();
			expect(typeof parsed.summary.pass).toBe("number");
			expect(typeof parsed.summary.warn).toBe("number");
			expect(typeof parsed.summary.fail).toBe("number");
			// Each check should have expected fields
			for (const check of parsed.checks) {
				expect(typeof check.name).toBe("string");
				expect(["pass", "warn", "fail"]).toContain(check.status);
				expect(typeof check.message).toBe("string");
				expect(Array.isArray(check.details)).toBe(true);
				expect(typeof check.fixable).toBe("boolean");
			}
		} finally {
			process.chdir(origCwd);
		}
	});

	it("schemas-integrity catches bad lines", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const schemasPath = join(tmpDir, ".canopy", "schemas.jsonl");
			await Bun.write(schemasPath, "NOT JSON\n");
			const { stdout } = await captureOutput(() => run(false, true, false));
			expect(stdout).toContain("malformed line");
			expect(stdout).toContain("schemas");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("inheritance detects broken extends", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const record = {
				id: "canopy-0001",
				name: "child",
				version: 1,
				sections: [],
				extends: "nonexistent-parent",
				status: "active",
				createdAt: "2024-01-01",
				updatedAt: "2024-01-01",
			};
			await Bun.write(promptsPath, `${JSON.stringify(record)}\n`);
			const { stdout } = await captureOutput(() => run(false, true, false));
			expect(stdout).toContain("broken inheritance");
		} finally {
			process.chdir(origCwd);
		}
	});
});
