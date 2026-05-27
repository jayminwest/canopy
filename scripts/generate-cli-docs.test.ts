import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import {
	buildProgram,
	generate,
	renderMarkdown,
	summarizeCommand,
	summarizeProgram,
} from "./generate-cli-docs.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");

describe("generate-cli-docs", () => {
	test("docs/cli-reference.md is in sync with src/index.ts", async () => {
		const { content } = await generate();
		const onDisk = readFileSync(resolve(REPO_ROOT, "docs/cli-reference.md"), "utf8");
		expect(onDisk).toBe(content);
	});

	test("buildProgram registers every canopy subcommand", async () => {
		const program = await buildProgram();
		const names = new Set(program.commands.map((c) => c.name()));
		for (const expected of [
			"init",
			"show",
			"list",
			"render",
			"emit",
			"create",
			"update",
			"validate",
			"config",
			"prime",
			"doctor",
		]) {
			expect(names.has(expected)).toBe(true);
		}
	});

	test("summarizeCommand captures name, description, args, and options", () => {
		const program = new Command();
		program
			.command("widget")
			.description("Manage widgets")
			.argument("<name>", "Widget name")
			.argument("[size]", "Optional size")
			.option("-f, --force", "Force the operation");
		const cmd = program.commands[0];
		expect(cmd).toBeDefined();
		if (!cmd) return;
		const summary = summarizeCommand(cmd);
		expect(summary.name).toBe("widget");
		expect(summary.description).toBe("Manage widgets");
		expect(summary.args).toHaveLength(2);
		expect(summary.args[0]).toMatchObject({ name: "name", required: true });
		expect(summary.args[1]).toMatchObject({ name: "size", required: false });
		expect(summary.options.some((o) => o.flags.includes("--force"))).toBe(true);
	});

	test("summarizeProgram sorts commands alphabetically", () => {
		const program = new Command();
		program.command("zebra").description("Z");
		program.command("apple").description("A");
		program.command("mango").description("M");
		const summaries = summarizeProgram(program);
		expect(summaries.map((s) => s.name)).toEqual(["apple", "mango", "zebra"]);
	});

	test("renderMarkdown emits banner, index, and per-command sections", () => {
		const md = renderMarkdown([
			{
				name: "init",
				description: "Initialize a canopy store",
				args: [],
				options: [{ flags: "--force", description: "Overwrite" }],
			},
			{
				name: "list",
				description: "List prompts",
				args: [{ name: "filter", required: false, description: "Optional filter" }],
				options: [],
			},
		]);
		expect(md).toContain("AUTO-GENERATED");
		expect(md).toContain("Total commands: **2**.");
		expect(md).toContain("## init");
		expect(md).toContain("## list");
		expect(md).toContain("`--force`");
		expect(md).toContain("`filter`");
	});

	test("renderMarkdown escapes pipes in descriptions", () => {
		const md = renderMarkdown([
			{
				name: "weird",
				description: "matches a|b alternation",
				args: [],
				options: [],
			},
		]);
		expect(md).toContain("a\\|b");
	});

	test("generate refuses to emit empty references", async () => {
		// Sanity: the real program has many commands; this guards against
		// a silent regression where buildProgram returns an empty tree.
		const { summaries } = await generate();
		expect(summaries.length).toBeGreaterThanOrEqual(20);
	});
});
