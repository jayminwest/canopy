import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl, dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import create from "./create.ts";
import init from "./init.ts";
import schemaCmd from "./schema.ts";
import validateCmd from "./validate.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-schema");

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

describe("cn schema", () => {
	it("creates a schema", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() =>
				schemaCmd(
					["create", "--name", "agent-def", "--required", "role,constraints", "--json"],
					true,
				),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.name).toBe("agent-def");
			expect(parsed.id).toMatch(/^schema-[0-9a-f]{4}$/);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("lists schemas", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => schemaCmd(["create", "--name", "s1", "--json"], true));
			await captureOutput(() => schemaCmd(["create", "--name", "s2", "--json"], true));

			const { stdout } = await captureOutput(() => schemaCmd(["list", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.count).toBe(2);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("adds a rule and shows it", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				schemaCmd(["create", "--name", "my-schema", "--required", "constraints"], false),
			);
			await captureOutput(() =>
				schemaCmd(
					[
						"rule",
						"add",
						"my-schema",
						"--section",
						"constraints",
						"--pattern",
						"Never push",
						"--message",
						"Push restriction required",
					],
					false,
				),
			);

			const { stdout } = await captureOutput(() =>
				schemaCmd(["show", "my-schema", "--json"], true),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.schema.rules).toHaveLength(1);
			expect(parsed.schema.rules[0].section).toBe("constraints");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("validates prompt against schema", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			// Create schema
			await captureOutput(() =>
				schemaCmd(["create", "--name", "agent-schema", "--required", "role,constraints"], false),
			);

			// Create prompt with required sections
			await captureOutput(() =>
				create(["--name", "good-agent", "--schema", "agent-schema"], false),
			);

			// Manually add sections
			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const prompt = current.find((p) => p.name === "good-agent");
			if (prompt) {
				const updated: Prompt = {
					...prompt,
					sections: [
						{ name: "role", body: "You are an agent." },
						{ name: "constraints", body: "Do good things." },
					],
					version: prompt.version + 1,
					updatedAt: new Date().toISOString(),
				};
				await appendJsonl(promptsPath, updated);
			}

			const { stdout } = await captureOutput(() => validateCmd(["good-agent", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.valid).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("fails validation for missing required section", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				schemaCmd(["create", "--name", "strict-schema", "--required", "role,constraints"], false),
			);

			await captureOutput(() =>
				create(["--name", "bad-agent", "--schema", "strict-schema"], false),
			);

			// Only add "role", missing "constraints"
			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const prompt = current.find((p) => p.name === "bad-agent");
			if (prompt) {
				const updated: Prompt = {
					...prompt,
					sections: [{ name: "role", body: "You are an agent." }],
					version: prompt.version + 1,
					updatedAt: new Date().toISOString(),
				};
				await appendJsonl(promptsPath, updated);
			}

			let threw = false;
			try {
				const { stdout } = await captureOutput(() => validateCmd(["bad-agent", "--json"], true));
				const parsed = JSON.parse(stdout.trim());
				expect(parsed.valid).toBe(false);
				expect(parsed.errors.length).toBeGreaterThan(0);
			} catch {
				threw = true;
			}

			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});
});
