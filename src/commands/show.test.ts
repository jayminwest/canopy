import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl, dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";
import create from "./create.ts";
import init from "./init.ts";
import show from "./show.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-show");

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

describe("cn show", () => {
	it("shows a prompt by name", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			const { stdout } = await captureOutput(() => show(["my-prompt"], false));
			expect(stdout).toContain("my-prompt");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON with --json flag", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "json-prompt", "--json"], true));
			const { stdout } = await captureOutput(() => show(["json-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("show");
			expect(parsed.prompt.name).toBe("json-prompt");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("throws ExitError for nonexistent prompt", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => show(["does-not-exist"], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("returns error JSON for nonexistent prompt with --json", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			let output = "";
			try {
				const { stdout } = await captureOutput(() => show(["ghost-prompt", "--json"], true));
				output = stdout;
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			// Either throws or outputs error JSON; both are acceptable
			if (!threw && output) {
				const parsed = JSON.parse(output.trim());
				expect(parsed.success).toBe(false);
				expect(parsed.error).toContain("ghost-prompt");
			} else {
				expect(threw).toBe(true);
			}
		} finally {
			process.chdir(origCwd);
		}
	});

	it("shows a specific version with name@version syntax", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "versioned", "--json"], true));

			// Append a second version
			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const prompt = current.find((p) => p.name === "versioned");
			if (prompt) {
				const v2: Prompt = {
					...prompt,
					sections: [{ name: "intro", body: "Version 2 body" }],
					version: 2,
					updatedAt: new Date().toISOString(),
				};
				await appendJsonl(promptsPath, v2);
			}

			// Show version 1 explicitly
			const { stdout: v1out } = await captureOutput(() => show(["versioned@1", "--json"], true));
			const v1 = JSON.parse(v1out.trim());
			expect(v1.success).toBe(true);
			expect(v1.prompt.version).toBe(1);

			// Show version 2 explicitly
			const { stdout: v2out } = await captureOutput(() => show(["versioned@2", "--json"], true));
			const v2parsed = JSON.parse(v2out.trim());
			expect(v2parsed.success).toBe(true);
			expect(v2parsed.prompt.version).toBe(2);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("throws ExitError for nonexistent version", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "single-version", "--json"], true));

			let threw = false;
			try {
				await captureOutput(() => show(["single-version@99", "--json"], true));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("displays section names and bodies in human output", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "sectioned", "--json"], true));

			// Add sections manually
			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const prompt = current.find((p) => p.name === "sectioned");
			if (prompt) {
				const updated: Prompt = {
					...prompt,
					sections: [
						{ name: "role", body: "You are a test agent." },
						{ name: "constraints", body: "Do not break things." },
					],
					version: 2,
					updatedAt: new Date().toISOString(),
				};
				await appendJsonl(promptsPath, updated);
			}

			const { stdout } = await captureOutput(() => show(["sectioned"], false));
			expect(stdout).toContain("role");
			expect(stdout).toContain("You are a test agent.");
			expect(stdout).toContain("constraints");
			expect(stdout).toContain("Do not break things.");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("displays description and tags in human output", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				create(
					[
						"--name",
						"tagged-prompt",
						"--description",
						"A tagged prompt",
						"--tag",
						"alpha",
						"--tag",
						"beta",
					],
					false,
				),
			);
			const { stdout } = await captureOutput(() => show(["tagged-prompt"], false));
			expect(stdout).toContain("tagged-prompt");
			expect(stdout).toContain("A tagged prompt");
			expect(stdout).toContain("alpha");
			expect(stdout).toContain("beta");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("throws ExitError when no name provided", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => show([], false));
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
