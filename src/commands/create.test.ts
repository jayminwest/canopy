import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Prompt } from "../types.ts";
import create from "./create.ts";
import init from "./init.ts";
import renderCmd from "./render.ts";
import show from "./show.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-create");

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

describe("cn create", () => {
	it("creates a new prompt", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => create(["--name", "base-agent"], false));
			expect(stdout).toContain("base-agent");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => create(["--name", "my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.name).toBe("my-prompt");
			expect(parsed.id).toMatch(/^canopy-[0-9a-f]{4}$/);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("shows the created prompt", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-agent", "--tag", "agent"], false));
			const { stdout } = await captureOutput(() => show(["my-agent", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.prompt.name).toBe("my-agent");
			expect(parsed.prompt.tags).toContain("agent");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("rejects duplicate name", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "dup-name"], false));

			const origExit = (process as { exit: (code?: number) => never }).exit;
			let exitCalled = false;
			(process as { exit: (code?: number) => never }).exit = () => {
				exitCalled = true;
				throw new Error("exit");
			};

			try {
				await captureOutput(() => create(["--name", "dup-name"], false));
			} catch {
				/* expected */
			}

			(process as { exit: (code?: number) => never }).exit = origExit;
			expect(exitCalled).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("creates prompt with parent and renders inheritance", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			// Create base prompt via show (which reads from store), but we need to manually add sections
			// For render test, create base with sections via update after create
			await captureOutput(() => create(["--name", "base", "--json"], true));

			// Add sections to base via update
			const { readJsonl, appendJsonl, dedupById } = await import("../store.ts");
			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const base = current.find((p) => p.name === "base");
			if (base) {
				const updated = {
					...base,
					sections: [
						{ name: "role", body: "Base role" },
						{ name: "constraints", body: "Base constraints" },
					],
					version: 2,
					updatedAt: new Date().toISOString(),
				};
				await appendJsonl(promptsPath, updated);
			}

			await captureOutput(() => create(["--name", "child", "--extends", "base"], false));

			const { stdout } = await captureOutput(() => renderCmd(["child", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.resolvedFrom).toContain("base");
			expect(parsed.resolvedFrom).toContain("child");
			expect(parsed.sections.some((s: { name: string }) => s.name === "role")).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});
});
