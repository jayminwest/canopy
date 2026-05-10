import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import init from "./init.ts";
import renderCmd from "./render.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-render");

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

async function seedPrompt(prompt: Prompt): Promise<void> {
	const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
	await appendJsonl(promptsPath, prompt);
}

function makePrompt(overrides: Partial<Prompt> & { id: string; name: string }): Prompt {
	return {
		version: 1,
		sections: [],
		status: "active",
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
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

describe("cn render --json envelope", () => {
	it("surfaces resolved mulch as a top-level field when declared", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "role-with-mulch",
					sections: [{ name: "role", body: "You are an agent." }],
					mulch: {
						prime: { domains: ["canopy"], files: ["src/render.ts"] },
						budget: 5000,
						on_empty: "warn",
					},
				}),
			);

			const { stdout } = await captureOutput(() => renderCmd(["role-with-mulch", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.mulch).toEqual({
				prime: { domains: ["canopy"], files: ["src/render.ts"] },
				budget: 5000,
				on_empty: "warn",
			});
		} finally {
			process.chdir(origCwd);
		}
	});

	it("omits mulch entirely (not null, not {}) when no role declared one", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "plain",
					sections: [{ name: "role", body: "Plain role." }],
				}),
			);

			const { stdout } = await captureOutput(() => renderCmd(["plain", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect("mulch" in parsed).toBe(false);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("surfaces resolved mulch from inheritance chain (extends_mulch=true)", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [{ name: "role", body: "Base." }],
					mulch: { prime: { domains: ["a"] }, budget: 1000 },
				}),
			);
			await seedPrompt(
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					extends_mulch: true,
					sections: [],
					mulch: { prime: { domains: ["b"] }, budget: 2000 },
				}),
			);

			const { stdout } = await captureOutput(() => renderCmd(["child", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.mulch).toEqual({
				prime: { domains: ["a", "b"] },
				budget: 2000,
			});
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--format json (no envelope) also surfaces mulch as top-level field", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "role-with-mulch",
					sections: [{ name: "role", body: "You are an agent." }],
					mulch: { prime: { domains: ["canopy"] } },
				}),
			);

			const { stdout } = await captureOutput(() =>
				renderCmd(["role-with-mulch", "--format", "json"], false),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.mulch).toEqual({ prime: { domains: ["canopy"] } });
			expect(parsed.success).toBeUndefined();
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--format json omits mulch when undeclared", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompt(
				makePrompt({
					id: "p-0001",
					name: "plain",
					sections: [{ name: "role", body: "Plain role." }],
				}),
			);

			const { stdout } = await captureOutput(() => renderCmd(["plain", "--format", "json"], false));
			const parsed = JSON.parse(stdout.trim());
			expect("mulch" in parsed).toBe(false);
		} finally {
			process.chdir(origCwd);
		}
	});
});
