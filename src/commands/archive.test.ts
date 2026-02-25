import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";
import archive from "./archive.ts";
import create from "./create.ts";
import init from "./init.ts";
import update from "./update.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-archive");

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

describe("cn archive", () => {
	it("archives an active prompt", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			const { stdout } = await captureOutput(() => archive(["my-prompt"], false));
			expect(stdout).toContain("my-prompt");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON on success", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "json-prompt"], false));
			const { stdout } = await captureOutput(() => archive(["json-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("archive");
			expect(parsed.name).toBe("json-prompt");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors if prompt not found", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => archive(["nonexistent"], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors if prompt is already archived", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "dup-archive"], false));
			await captureOutput(() => archive(["dup-archive"], false));

			let threw = false;
			try {
				await captureOutput(() => archive(["dup-archive"], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("verifies JSONL state after archive", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "state-check"], false));
			await captureOutput(() => archive(["state-check"], false));

			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const allRecords = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(allRecords);
			const prompt = current.find((p) => p.name === "state-check");

			expect(prompt).toBeDefined();
			expect(prompt?.status).toBe("archived");
			expect(prompt?.version).toBeGreaterThan(1);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("unarchives a prompt via update --status active", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "unarchive-me"], false));
			await captureOutput(() => archive(["unarchive-me"], false));
			await captureOutput(() => update(["unarchive-me", "--status", "active"], false));

			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const allRecords = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(allRecords);
			const prompt = current.find((p) => p.name === "unarchive-me");

			expect(prompt).toBeDefined();
			expect(prompt?.status).toBe("active");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON error when prompt not found with --json", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => archive(["missing-prompt", "--json"], true));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});
});
