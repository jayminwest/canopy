import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";
import init from "./init.ts";
import tree from "./tree.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-tree");

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

function makePrompt(name: string, opts: Partial<Prompt> = {}): Prompt {
	return {
		id: `canopy-${name}`,
		name,
		version: 1,
		sections: [],
		status: "active",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...opts,
	};
}

async function seedPrompts(prompts: Prompt[]): Promise<void> {
	const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
	for (const p of prompts) {
		await appendJsonl(promptsPath, p);
	}
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

describe("cn tree", () => {
	it("shows a single prompt with no parents or children", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompts([makePrompt("orphan")]);
			const { stdout } = await captureOutput(() => tree(["orphan"], false));
			expect(stdout).toContain("orphan");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("shows single parent chain (parent → child)", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompts([makePrompt("base"), makePrompt("child", { extends: "base" })]);
			const { stdout } = await captureOutput(() => tree(["child"], false));
			expect(stdout).toContain("base");
			expect(stdout).toContain("child");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("shows multiple children of a focal node", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompts([
				makePrompt("root"),
				makePrompt("child-a", { extends: "root" }),
				makePrompt("child-b", { extends: "root" }),
			]);
			const { stdout } = await captureOutput(() => tree(["root"], false));
			expect(stdout).toContain("child-a");
			expect(stdout).toContain("child-b");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("shows deep hierarchy (grandparent → parent → child)", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompts([
				makePrompt("grandparent"),
				makePrompt("parent", { extends: "grandparent" }),
				makePrompt("grandchild", { extends: "parent" }),
			]);
			const { stdout } = await captureOutput(() => tree(["parent"], false));
			expect(stdout).toContain("grandparent");
			expect(stdout).toContain("parent");
			expect(stdout).toContain("grandchild");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--json output for orphan prompt", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompts([makePrompt("solo")]);
			const { stdout } = await captureOutput(() => tree(["solo", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.name).toBe("solo");
			expect(parsed.ancestors).toEqual([]);
			expect(parsed.tree.name).toBe("solo");
			expect(parsed.tree.children).toHaveLength(0);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--json output includes ancestors and children", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await seedPrompts([
				makePrompt("base"),
				makePrompt("mid", { extends: "base" }),
				makePrompt("leaf", { extends: "mid" }),
			]);
			const { stdout } = await captureOutput(() => tree(["mid", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.name).toBe("mid");
			expect(parsed.ancestors).toContain("base");
			expect(parsed.tree.name).toBe("mid");
			expect(parsed.tree.children).toHaveLength(1);
			expect(parsed.tree.children[0].name).toBe("leaf");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors on missing prompt name (human output)", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => tree([], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors on missing prompt name (json output)", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => tree(["--json"], true));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors when prompt not found (json output)", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => tree(["nonexistent", "--json"], true));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	// NOTE: cycle detection in renderChildren/buildTree is incomplete in tree.ts —
	// cycles between prompts cause a stack overflow in both human and JSON output paths.
	// The ancestor traversal loop has a guard but renderChildren/buildTree do not.
	// This is a known bug in tree.ts that requires a fix outside this file's scope.
});
