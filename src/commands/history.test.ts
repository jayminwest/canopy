import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";
import create from "./create.ts";
import history from "./history.ts";
import init from "./init.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-history");

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
});

describe("cn history", () => {
	it("shows help with --help flag", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => history(["--help"], false));
			expect(stdout).toContain("cn history");
			expect(stdout).toContain("--limit");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors when no name provided", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => history([], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON error when no name provided in json mode", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => history(["--json"], true));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors when prompt not found", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => history(["nonexistent-prompt"], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON error when prompt not found", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => history(["nonexistent-prompt", "--json"], true));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("lists versions of a prompt", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));

			const { stdout } = await captureOutput(() => history(["my-prompt"], false));
			expect(stdout).toContain("my-prompt");
			expect(stdout).toContain("v1");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON with versions array", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "json-prompt"], false));

			const { stdout } = await captureOutput(() => history(["json-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("history");
			expect(parsed.name).toBe("json-prompt");
			expect(Array.isArray(parsed.versions)).toBe(true);
			expect(parsed.versions.length).toBeGreaterThan(0);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("shows multiple versions when prompt has been updated", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "versioned-prompt"], false));

			// Manually append additional versions to simulate updates
			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const { readJsonl, dedupById } = await import("../store.ts");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const prompt = current.find((p) => p.name === "versioned-prompt");

			if (prompt) {
				const v2: Prompt = {
					...prompt,
					version: 2,
					sections: [{ name: "role", body: "Updated role" }],
					updatedAt: new Date().toISOString(),
				};
				const v3: Prompt = {
					...prompt,
					version: 3,
					sections: [{ name: "role", body: "Final role" }],
					updatedAt: new Date().toISOString(),
				};
				await appendJsonl(promptsPath, v2);
				await appendJsonl(promptsPath, v3);
			}

			const { stdout } = await captureOutput(() => history(["versioned-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.versions.length).toBe(3);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("respects --limit flag", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "limit-prompt"], false));

			// Add multiple versions
			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const { readJsonl, dedupById } = await import("../store.ts");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const prompt = current.find((p) => p.name === "limit-prompt");

			if (prompt) {
				for (let i = 2; i <= 5; i++) {
					const vn: Prompt = {
						...prompt,
						version: i,
						sections: [{ name: "role", body: `Role v${i}` }],
						updatedAt: new Date().toISOString(),
					};
					await appendJsonl(promptsPath, vn);
				}
			}

			const { stdout } = await captureOutput(() =>
				history(["limit-prompt", "--limit", "2", "--json"], true),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.versions.length).toBe(2);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("versions are returned in descending order (newest first)", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "ordered-prompt"], false));

			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const { readJsonl, dedupById } = await import("../store.ts");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const prompt = current.find((p) => p.name === "ordered-prompt");

			if (prompt) {
				const v2: Prompt = {
					...prompt,
					version: 2,
					sections: [{ name: "role", body: "Role v2" }],
					updatedAt: new Date().toISOString(),
				};
				const v3: Prompt = {
					...prompt,
					version: 3,
					sections: [{ name: "role", body: "Role v3" }],
					updatedAt: new Date().toISOString(),
				};
				await appendJsonl(promptsPath, v2);
				await appendJsonl(promptsPath, v3);
			}

			const { stdout } = await captureOutput(() => history(["ordered-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			// Versions should be newest first (descending)
			const versions = parsed.versions as Array<{ version: number }>;
			expect(versions.length).toBeGreaterThan(1);
			const versionNums: number[] = versions.map((v) => v.version);
			const first = versionNums.at(0) ?? 0;
			const last = versionNums.at(-1) ?? 0;
			expect(first).toBeGreaterThan(last);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("human output includes version count", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "count-prompt"], false));

			const { stdout } = await captureOutput(() => history(["count-prompt"], false));
			expect(stdout).toContain("1 versions");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("marks current version in human output", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "current-prompt"], false));

			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const { readJsonl, dedupById } = await import("../store.ts");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const prompt = current.find((p) => p.name === "current-prompt");

			if (prompt) {
				const v2: Prompt = {
					...prompt,
					version: 2,
					sections: [],
					updatedAt: new Date().toISOString(),
				};
				await appendJsonl(promptsPath, v2);
			}

			const { stdout } = await captureOutput(() => history(["current-prompt"], false));
			// Output should indicate current version
			expect(stdout).toContain("current");
		} finally {
			process.chdir(origCwd);
		}
	});
});
