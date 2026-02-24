import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl, dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import create from "./create.ts";
import emitCmd from "./emit.ts";
import importCmd from "./import.ts";
import init from "./init.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-emit");

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

async function addSections(
	tmpDir: string,
	name: string,
	sections: { name: string; body: string }[],
) {
	const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
	const records = await readJsonl<Prompt>(promptsPath);
	const current = dedupById(records);
	const prompt = current.find((p) => p.name === name);
	if (!prompt) throw new Error(`Prompt '${name}' not found`);
	const updated: Prompt = {
		...prompt,
		sections,
		version: prompt.version + 1,
		updatedAt: new Date().toISOString(),
	};
	await appendJsonl(promptsPath, updated);
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

describe("cn emit", () => {
	it("emits a prompt to a file", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-agent"], false));
			await addSections(tmpDir, "my-agent", [{ name: "role", body: "You are an agent." }]);

			const { stdout } = await captureOutput(() =>
				emitCmd(["my-agent", "--out", join(tmpDir, "out.md"), "--json"], true),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.files).toHaveLength(1);

			const content = await Bun.file(join(tmpDir, "out.md")).text();
			expect(content).toContain("## role");
			expect(content).toContain("You are an agent.");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("emits --all active prompts", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "agent-a", "--status", "active"], false));
			await captureOutput(() => create(["--name", "agent-b", "--status", "active"], false));
			await captureOutput(() => create(["--name", "agent-c", "--status", "draft"], false));

			await addSections(tmpDir, "agent-a", [{ name: "role", body: "Agent A" }]);
			await addSections(tmpDir, "agent-b", [{ name: "role", body: "Agent B" }]);

			const outDir = join(tmpDir, "agents");
			const { stdout } = await captureOutput(() =>
				emitCmd(["--all", "--out-dir", outDir, "--json"], true),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			// Only active prompts emitted (agent-c is draft)
			expect(parsed.files.length).toBe(2);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("import + emit round-trip", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			// Write a markdown file to import
			const mdPath = join(tmpDir, "source.md");
			await Bun.write(
				mdPath,
				"## Role\n\nYou are a test agent.\n\n## Constraints\n\nNo misbehaving.\n",
			);

			await captureOutput(() => importCmd([mdPath, "--name", "imported-agent", "--split"], false));

			const outPath = join(tmpDir, "imported-agent.md");
			await captureOutput(() => emitCmd(["imported-agent", "--out", outPath], false));

			const content = await Bun.file(outPath).text();
			expect(content).toContain("## Role");
			expect(content).toContain("You are a test agent.");
			expect(content).toContain("## Constraints");
			expect(content).toContain("No misbehaving.");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("import without --split creates single body section", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const mdPath = join(tmpDir, "raw.md");
			await Bun.write(mdPath, "This is the full content.\n\n## Not a split\n");

			const { stdout } = await captureOutput(() =>
				importCmd([mdPath, "--name", "raw-import", "--json"], true),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.sections).toBe(1);
		} finally {
			process.chdir(origCwd);
		}
	});
});
