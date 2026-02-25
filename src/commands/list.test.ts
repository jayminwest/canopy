import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import create from "./create.ts";
import init from "./init.ts";
import list from "./list.ts";
import update from "./update.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-list");

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

describe("cn list", () => {
	it("returns empty message when no prompts exist", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => list([], false));
			expect(stdout).toContain("No prompts found.");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("lists created prompts", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "alpha"], false));
			await captureOutput(() => create(["--name", "beta"], false));
			const { stdout } = await captureOutput(() => list([], false));
			expect(stdout).toContain("alpha");
			expect(stdout).toContain("beta");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("filters by tag", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "tagged-prompt", "--tag", "agent"], false));
			await captureOutput(() => create(["--name", "other-prompt"], false));
			const { stdout } = await captureOutput(() => list(["--tag", "agent"], false));
			expect(stdout).toContain("tagged-prompt");
			expect(stdout).not.toContain("other-prompt");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("filters by status draft", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "draft-prompt", "--status", "draft"], false));
			await captureOutput(() => create(["--name", "active-prompt", "--status", "active"], false));
			const { stdout } = await captureOutput(() => list(["--status", "draft"], false));
			expect(stdout).toContain("draft-prompt");
			expect(stdout).not.toContain("active-prompt");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("filters by extends/parent", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "base-prompt"], false));
			await captureOutput(() =>
				create(["--name", "child-prompt", "--extends", "base-prompt"], false),
			);
			await captureOutput(() => create(["--name", "standalone"], false));
			const { stdout } = await captureOutput(() => list(["--extends", "base-prompt"], false));
			expect(stdout).toContain("child-prompt");
			expect(stdout).not.toContain("standalone");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("combination filters: tag + status", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				create(["--name", "match", "--tag", "tool", "--status", "active"], false),
			);
			await captureOutput(() =>
				create(["--name", "tag-only", "--tag", "tool", "--status", "draft"], false),
			);
			await captureOutput(() => create(["--name", "status-only", "--status", "active"], false));
			const { stdout } = await captureOutput(() =>
				list(["--tag", "tool", "--status", "active"], false),
			);
			expect(stdout).toContain("match");
			expect(stdout).not.toContain("tag-only");
			expect(stdout).not.toContain("status-only");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON with prompts and count", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			const { stdout } = await captureOutput(() => list(["--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("list");
			expect(Array.isArray(parsed.prompts)).toBe(true);
			expect(parsed.count).toBeGreaterThan(0);
			expect(parsed.prompts.some((p: { name: string }) => p.name === "my-prompt")).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON with empty results when no prompts", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => list(["--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.prompts).toEqual([]);
			expect(parsed.count).toBe(0);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("excludes archived prompts by default", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "to-archive"], false));
			await captureOutput(() => update(["to-archive", "--status", "archived"], false));
			await captureOutput(() => create(["--name", "visible-prompt"], false));
			const { stdout } = await captureOutput(() => list([], false));
			expect(stdout).not.toContain("to-archive");
			expect(stdout).toContain("visible-prompt");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("includes archived when filtered by --status archived", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "to-archive"], false));
			await captureOutput(() => update(["to-archive", "--status", "archived"], false));
			await captureOutput(() => create(["--name", "active-prompt"], false));
			const { stdout } = await captureOutput(() => list(["--status", "archived"], false));
			expect(stdout).toContain("to-archive");
			expect(stdout).not.toContain("active-prompt");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("shows prompt count in output", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "p1"], false));
			await captureOutput(() => create(["--name", "p2"], false));
			const { stdout } = await captureOutput(() => list([], false));
			expect(stdout).toMatch(/2 prompts?/);
		} finally {
			process.chdir(origCwd);
		}
	});
});
