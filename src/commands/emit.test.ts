import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { saveConfig } from "../config.ts";
import { appendJsonl, dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import create from "./create.ts";
import emitCmd, { resolveEmitDir } from "./emit.ts";
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

async function setFrontmatter(tmpDir: string, name: string, frontmatter: Record<string, unknown>) {
	const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
	const records = await readJsonl<Prompt>(promptsPath);
	const current = dedupById(records);
	const prompt = current.find((p) => p.name === name);
	if (!prompt) throw new Error(`Prompt '${name}' not found`);
	const updated: Prompt = {
		...prompt,
		frontmatter,
		version: prompt.version + 1,
		updatedAt: new Date().toISOString(),
	};
	await appendJsonl(promptsPath, updated);
}

async function setExtends(tmpDir: string, name: string, extendsName: string) {
	const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
	const records = await readJsonl<Prompt>(promptsPath);
	const current = dedupById(records);
	const prompt = current.find((p) => p.name === name);
	if (!prompt) throw new Error(`Prompt '${name}' not found`);
	const updated: Prompt = {
		...prompt,
		extends: extendsName,
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
			expect(content).toContain("---");
			expect(content).toContain("name: my-agent");
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

	it("emits custom frontmatter keys", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "fm-agent", "--status", "active"], false));
			await addSections(tmpDir, "fm-agent", [{ name: "role", body: "FM agent." }]);
			await setFrontmatter(tmpDir, "fm-agent", { model: "sonnet", readOnly: true });

			const outPath = join(tmpDir, "fm-agent.md");
			await captureOutput(() => emitCmd(["fm-agent", "--out", outPath], false));

			const content = await Bun.file(outPath).text();
			expect(content).toContain("name: fm-agent");
			expect(content).toContain("model: sonnet");
			expect(content).toContain("readOnly: true");
			expect(content).toContain("## role");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("emits merged frontmatter from inherited prompts", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "base-agent", "--status", "active"], false));
			await addSections(tmpDir, "base-agent", [{ name: "role", body: "Base role." }]);
			await setFrontmatter(tmpDir, "base-agent", { model: "opus" });

			await captureOutput(() => create(["--name", "child-agent", "--status", "active"], false));
			await setExtends(tmpDir, "child-agent", "base-agent");
			await setFrontmatter(tmpDir, "child-agent", { tools: ["Read", "Write"] });

			const outPath = join(tmpDir, "child-agent.md");
			await captureOutput(() => emitCmd(["child-agent", "--out", outPath], false));

			const content = await Bun.file(outPath).text();
			// name from prompt itself
			expect(content).toContain("name: child-agent");
			// model inherited from parent
			expect(content).toContain("model: opus");
			// tools from child
			expect(content).toContain("tools:");
			expect(content).toContain("- Read");
			expect(content).toContain("- Write");
			// sections from parent
			expect(content).toContain("## role");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("check mode detects stale when frontmatter changes", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "stale-check", "--status", "active"], false));
			await addSections(tmpDir, "stale-check", [{ name: "role", body: "Role." }]);

			const outPath = join(tmpDir, "agents", "stale-check.md");

			// Emit without frontmatter
			await captureOutput(() => emitCmd(["--all", "--out-dir", join(tmpDir, "agents")], false));

			// Add frontmatter — should make the existing file stale
			await setFrontmatter(tmpDir, "stale-check", { model: "haiku" });

			const { stdout } = await captureOutput(() =>
				emitCmd(["--all", "--out-dir", join(tmpDir, "agents"), "--check", "--json"], true).catch(
					() => {},
				),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.upToDate).toBe(false);
			expect(parsed.stale).toContain("stale-check");

			// Re-emit to fix
			await captureOutput(() =>
				emitCmd(["--all", "--out-dir", join(tmpDir, "agents"), "--force"], false),
			);
			const content = await Bun.file(outPath).text();
			expect(content).toContain("model: haiku");
		} finally {
			process.chdir(origCwd);
		}
	});
});

describe("resolveEmitDir", () => {
	const basePrompt: Prompt = {
		id: "test-001",
		name: "test",
		version: 1,
		sections: [],
		status: "active",
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
	};

	const baseConfig = { project: "test", version: "1" };

	it("falls back to global emitDir", () => {
		const dir = resolveEmitDir(basePrompt, { ...baseConfig, emitDir: "output" });
		expect(dir).toBe("output");
	});

	it("falls back to 'agents' when no config emitDir", () => {
		const dir = resolveEmitDir(basePrompt, baseConfig);
		expect(dir).toBe("agents");
	});

	it("per-prompt emitDir wins over tag-based routing", () => {
		const prompt = { ...basePrompt, emitDir: "custom", tags: ["slash-command"] };
		const config = { ...baseConfig, emitDirByTag: { "slash-command": ".claude/commands" } };
		expect(resolveEmitDir(prompt, config)).toBe("custom");
	});

	it("tag-based routing works", () => {
		const prompt = { ...basePrompt, tags: ["slash-command"] };
		const config = { ...baseConfig, emitDirByTag: { "slash-command": ".claude/commands" } };
		expect(resolveEmitDir(prompt, config)).toBe(".claude/commands");
	});

	it("first matching tag wins", () => {
		const prompt = { ...basePrompt, tags: ["internal", "slash-command"] };
		const config = {
			...baseConfig,
			emitDirByTag: { "slash-command": ".claude/commands", internal: ".internal/prompts" },
		};
		expect(resolveEmitDir(prompt, config)).toBe(".internal/prompts");
	});

	it("no matching tags falls back to global emitDir", () => {
		const prompt = { ...basePrompt, tags: ["unrelated"] };
		const config = {
			...baseConfig,
			emitDir: "output",
			emitDirByTag: { "slash-command": ".claude/commands" },
		};
		expect(resolveEmitDir(prompt, config)).toBe("output");
	});
});

describe("cn emit routing integration", () => {
	it("tag-based routing routes prompts to different directories", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			// Create prompts with different tags
			await captureOutput(() =>
				create(["--name", "my-cmd", "--tag", "slash-command", "--status", "active"], false),
			);
			await captureOutput(() =>
				create(["--name", "my-agent", "--tag", "agent", "--status", "active"], false),
			);
			await addSections(tmpDir, "my-cmd", [{ name: "role", body: "Command" }]);
			await addSections(tmpDir, "my-agent", [{ name: "role", body: "Agent" }]);

			// Configure tag routing
			await saveConfig(tmpDir, {
				project: "test",
				version: "1",
				emitDir: "agents",
				emitDirByTag: {
					"slash-command": ".claude/commands",
					agent: "agents",
				},
			});

			// Emit all
			const { stdout } = await captureOutput(() => emitCmd(["--all", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.files).toHaveLength(2);

			// Verify files landed in correct directories
			expect(existsSync(join(tmpDir, ".claude/commands/my-cmd.md"))).toBe(true);
			expect(existsSync(join(tmpDir, "agents/my-agent.md"))).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("per-prompt emitDir override routes to correct directory", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				create(["--name", "special", "--emit-dir", "custom-dir", "--status", "active"], false),
			);
			await addSections(tmpDir, "special", [{ name: "role", body: "Special" }]);

			const { stdout } = await captureOutput(() => emitCmd(["--all", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);

			expect(existsSync(join(tmpDir, "custom-dir/special.md"))).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--out-dir overrides all routing", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				create(["--name", "routed", "--tag", "slash-command", "--status", "active"], false),
			);
			await addSections(tmpDir, "routed", [{ name: "role", body: "Routed" }]);

			await saveConfig(tmpDir, {
				project: "test",
				version: "1",
				emitDirByTag: { "slash-command": ".claude/commands" },
			});

			const overrideDir = join(tmpDir, "override");
			const { stdout } = await captureOutput(() =>
				emitCmd(["--all", "--out-dir", overrideDir, "--json"], true),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);

			// File should be in override dir, not .claude/commands
			expect(existsSync(join(overrideDir, "routed.md"))).toBe(true);
			expect(existsSync(join(tmpDir, ".claude/commands/routed.md"))).toBe(false);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--dry-run shows routed paths", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				create(["--name", "cmd-a", "--tag", "slash-command", "--status", "active"], false),
			);
			await captureOutput(() =>
				create(["--name", "agent-a", "--tag", "agent", "--status", "active"], false),
			);

			await saveConfig(tmpDir, {
				project: "test",
				version: "1",
				emitDir: "agents",
				emitDirByTag: { "slash-command": ".claude/commands" },
			});

			const { stdout } = await captureOutput(() => emitCmd(["--all", "--dry-run", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.dryRun).toBe(true);

			const cmdFile = parsed.files.find((f: { name: string }) => f.name === "cmd-a");
			const agentFile = parsed.files.find((f: { name: string }) => f.name === "agent-a");
			expect(cmdFile.path).toContain(".claude/commands");
			expect(agentFile.path).toContain("agents");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--check respects routing", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				create(["--name", "cmd-check", "--tag", "slash-command", "--status", "active"], false),
			);
			await addSections(tmpDir, "cmd-check", [{ name: "role", body: "Check me" }]);

			await saveConfig(tmpDir, {
				project: "test",
				version: "1",
				emitDirByTag: { "slash-command": ".claude/commands" },
			});

			// First emit to the correct routed path
			await captureOutput(() => emitCmd(["--all"], false));
			expect(existsSync(join(tmpDir, ".claude/commands/cmd-check.md"))).toBe(true);

			// Check should pass (files are where routing says they should be)
			const { stdout } = await captureOutput(() => emitCmd(["--all", "--check", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.upToDate).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});
});
