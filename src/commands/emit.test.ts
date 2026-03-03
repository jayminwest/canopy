import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { saveConfig } from "../config.ts";
import { appendJsonl, dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import create from "./create.ts";
import emitCmd, { escapeTemplateLiteral, resolveEmitDir, toExportName } from "./emit.ts";
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

async function setEmitAs(tmpDir: string, name: string, emitAs: string) {
	const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
	const records = await readJsonl<Prompt>(promptsPath);
	const current = dedupById(records);
	const prompt = current.find((p) => p.name === name);
	if (!prompt) throw new Error(`Prompt '${name}' not found`);
	const updated: Prompt = {
		...prompt,
		emitAs,
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
			// Single section — no ## heading
			expect(content).not.toContain("## role");
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
			// Single section — no ## heading
			expect(content).not.toContain("## role");
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
			// Single inherited section — no ## heading
			expect(content).not.toContain("## role");
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

	it("uses default target dir", () => {
		const config = {
			...baseConfig,
			targets: { default: { dir: "output", default: true } },
		};
		const dir = resolveEmitDir(basePrompt, config);
		expect(dir).toBe("output");
	});

	it("falls back to 'agents' when no targets configured", () => {
		const dir = resolveEmitDir(basePrompt, baseConfig);
		expect(dir).toBe("agents");
	});

	it("per-prompt emitDir wins over tag-based routing", () => {
		const prompt = { ...basePrompt, emitDir: "custom", tags: ["slash-command"] };
		const config = {
			...baseConfig,
			targets: { commands: { dir: ".claude/commands", tags: ["slash-command"] } },
		};
		expect(resolveEmitDir(prompt, config)).toBe("custom");
	});

	it("tag-based routing works via targets", () => {
		const prompt = { ...basePrompt, tags: ["slash-command"] };
		const config = {
			...baseConfig,
			targets: { commands: { dir: ".claude/commands", tags: ["slash-command"] } },
		};
		expect(resolveEmitDir(prompt, config)).toBe(".claude/commands");
	});

	it("first matching tag wins", () => {
		const prompt = { ...basePrompt, tags: ["internal", "slash-command"] };
		const config = {
			...baseConfig,
			targets: {
				internal: { dir: ".internal/prompts", tags: ["internal"] },
				commands: { dir: ".claude/commands", tags: ["slash-command"] },
			},
		};
		expect(resolveEmitDir(prompt, config)).toBe(".internal/prompts");
	});

	it("no matching tags falls back to default target", () => {
		const prompt = { ...basePrompt, tags: ["unrelated"] };
		const config = {
			...baseConfig,
			targets: {
				default: { dir: "output", default: true },
				commands: { dir: ".claude/commands", tags: ["slash-command"] },
			},
		};
		expect(resolveEmitDir(prompt, config)).toBe("output");
	});

	it("multiple targets, first matching tag wins", () => {
		const prompt = { ...basePrompt, tags: ["docs"] };
		const config = {
			...baseConfig,
			targets: {
				default: { dir: "agents", default: true },
				docs: { dir: "documentation", tags: ["docs", "readme"] },
				commands: { dir: ".claude/commands", tags: ["slash-command"] },
			},
		};
		expect(resolveEmitDir(prompt, config)).toBe("documentation");
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
				targets: {
					agents: { dir: "agents", default: true, tags: ["agent"] },
					commands: { dir: ".claude/commands", tags: ["slash-command"] },
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
				targets: {
					commands: { dir: ".claude/commands", tags: ["slash-command"] },
				},
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
				targets: {
					agents: { dir: "agents", default: true },
					commands: { dir: ".claude/commands", tags: ["slash-command"] },
				},
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
				targets: {
					commands: { dir: ".claude/commands", tags: ["slash-command"] },
				},
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

describe("toExportName", () => {
	it("converts hyphenated names to uppercase with underscores", () => {
		expect(toExportName("day-planner-system")).toBe("DAY_PLANNER_SYSTEM");
	});

	it("converts simple names", () => {
		expect(toExportName("agent")).toBe("AGENT");
	});
});

describe("escapeTemplateLiteral", () => {
	it("escapes backticks", () => {
		expect(escapeTemplateLiteral("use `code` here")).toBe("use \\`code\\` here");
	});

	it("escapes template expressions", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal ${} escaping
		expect(escapeTemplateLiteral("value is ${foo}")).toBe("value is \\${foo}");
	});

	it("escapes backslashes", () => {
		expect(escapeTemplateLiteral("path\\to\\file")).toBe("path\\\\to\\\\file");
	});

	it("handles all escapes together", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal ${} escaping
		expect(escapeTemplateLiteral("a\\b`c${d}")).toBe("a\\\\b\\`c\\${d}");
	});

	it("preserves already-escaped backticks (no double-escaping)", () => {
		expect(escapeTemplateLiteral("use \\`code\\` here")).toBe("use \\`code\\` here");
	});

	it("preserves already-escaped code fences", () => {
		expect(escapeTemplateLiteral("\\`\\`\\`python\ncode\n\\`\\`\\`")).toBe(
			"\\`\\`\\`python\ncode\n\\`\\`\\`",
		);
	});

	it("preserves already-escaped backslashes", () => {
		expect(escapeTemplateLiteral("path\\\\is\\\\here")).toBe("path\\\\is\\\\here");
	});

	it("preserves already-escaped dollar expressions", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal ${} escaping
		expect(escapeTemplateLiteral("value is \\${foo}")).toBe("value is \\${foo}");
	});

	it("handles mixed raw and pre-escaped content", () => {
		expect(escapeTemplateLiteral("raw ` and escaped \\`")).toBe("raw \\` and escaped \\`");
	});
});

describe("TypeScript emit", () => {
	it("emits a .ts file with export const", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt", "--status", "active"], false));
			await addSections(tmpDir, "my-prompt", [{ name: "role", body: "You are helpful." }]);
			await setEmitAs(tmpDir, "my-prompt", "my-prompt.ts");

			const outPath = join(tmpDir, "my-prompt.ts");
			await captureOutput(() => emitCmd(["my-prompt", "--out", outPath], false));

			const content = await Bun.file(outPath).text();
			expect(content).toContain("// Auto-generated by Canopy");
			expect(content).toContain("// Prompt: my-prompt");
			expect(content).toContain("export const MY_PROMPT = `");
			// Single section — no ## heading
			expect(content).not.toContain("## role");
			expect(content).toContain("You are helpful.");
			// Should NOT contain frontmatter delimiters
			expect(content).not.toContain("---");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("escapes backticks and template literals in .ts output", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "escape-test", "--status", "active"], false));
			await addSections(tmpDir, "escape-test", [
				// biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal ${} escaping
				{ name: "role", body: "Use `code` and ${vars} carefully." },
			]);
			await setEmitAs(tmpDir, "escape-test", "escape-test.ts");

			const outPath = join(tmpDir, "escape-test.ts");
			await captureOutput(() => emitCmd(["escape-test", "--out", outPath], false));

			const content = await Bun.file(outPath).text();
			expect(content).toContain("\\`code\\`");
			// biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal ${} escaping
			expect(content).toContain("\\${vars}");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--check detects stale .ts files", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "ts-check", "--status", "active"], false));
			await addSections(tmpDir, "ts-check", [{ name: "role", body: "Original." }]);
			await setEmitAs(tmpDir, "ts-check", "ts-check.ts");

			const outDir = join(tmpDir, "out");
			await captureOutput(() => emitCmd(["--all", "--out-dir", outDir], false));
			expect(existsSync(join(outDir, "ts-check.ts"))).toBe(true);

			// Modify prompt — file should become stale
			await addSections(tmpDir, "ts-check", [{ name: "role", body: "Updated." }]);

			const { stdout } = await captureOutput(() =>
				emitCmd(["--all", "--out-dir", outDir, "--check", "--json"], true).catch(() => {}),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.upToDate).toBe(false);
			expect(parsed.stale).toContain("ts-check");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("skips unchanged .ts files on re-emit", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "ts-skip", "--status", "active"], false));
			await addSections(tmpDir, "ts-skip", [{ name: "role", body: "Stable." }]);
			await setEmitAs(tmpDir, "ts-skip", "ts-skip.ts");

			const outDir = join(tmpDir, "out");
			await captureOutput(() => emitCmd(["--all", "--out-dir", outDir], false));

			// Second emit should skip
			const { stdout } = await captureOutput(() =>
				emitCmd(["--all", "--out-dir", outDir, "--json"], true),
			);
			const parsed = JSON.parse(stdout.trim());
			const file = parsed.files.find((f: { name: string }) => f.name === "ts-skip");
			expect(file.skipped).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});
});
