#!/usr/bin/env bun
/**
 * Automated CLI doc generator.
 *
 * Walks the Commander command tree registered by `src/index.ts` and
 * emits a Markdown reference of every `cn` subcommand to
 * `docs/cli-reference.md`. The handler module is the canonical CLI
 * surface, so deriving the docs from it avoids drift between a
 * hand-written reference and the real binary.
 *
 * No new runtime/devDep — Commander is already a runtime dep, used at
 * the same shape `src/index.ts` uses to build the program. The
 * generator registers every command on a throwaway Commander instance,
 * then introspects `.commands`, `.options`, and `.registeredArguments`.
 *
 * Modes:
 *   bun run gen:docs            # write docs/cli-reference.md
 *   bun run gen:docs:check      # exit 1 if docs/cli-reference.md is stale
 *
 * The check mode is wired into CI (`.github/workflows/ci.yml`) so a
 * command added to `src/index.ts` without regenerating the reference
 * fails the build. Fix by running `bun run gen:docs` and committing
 * the result.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";

const REPO_ROOT = resolve(import.meta.dir, "..");
const OUTPUT_PATH = resolve(REPO_ROOT, "docs/cli-reference.md");

function readPackageVersion(): string {
	const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
		version?: string;
	};
	return pkg.version ?? "0.0.0";
}

export interface CommandOption {
	flags: string;
	description: string;
}

export interface CommandArgument {
	name: string;
	description: string;
	required: boolean;
}

export interface CommandSummary {
	name: string;
	description: string;
	args: CommandArgument[];
	options: CommandOption[];
}

export async function buildProgram(): Promise<Command> {
	const program = new Command();
	program
		.name("cn")
		.description("Prompt management & composition")
		.version(readPackageVersion(), "-v, --version", "Show version");

	const { registerInitCommand } = await import("../src/commands/init.ts");
	const { registerShowCommand } = await import("../src/commands/show.ts");
	const { registerListCommand } = await import("../src/commands/list.ts");
	const { registerArchiveCommand } = await import("../src/commands/archive.ts");
	const { registerHistoryCommand } = await import("../src/commands/history.ts");
	const { registerTreeCommand } = await import("../src/commands/tree.ts");
	const { registerStatsCommand } = await import("../src/commands/stats.ts");
	const { registerSyncCommand } = await import("../src/commands/sync.ts");
	const { registerDiffCommand } = await import("../src/commands/diff.ts");
	const { registerRenderCommand } = await import("../src/commands/render.ts");
	const { registerCreateCommand } = await import("../src/commands/create.ts");
	const { registerUpdateCommand } = await import("../src/commands/update.ts");
	const { registerEmitCommand } = await import("../src/commands/emit.ts");
	const { registerSchemaCommand } = await import("../src/commands/schema.ts");
	const { registerValidateCommand } = await import("../src/commands/validate.ts");
	const { registerConfigCommand } = await import("../src/commands/config.ts");
	const { registerImportCommand } = await import("../src/commands/import.ts");
	const { registerPrimeCommand } = await import("../src/commands/prime.ts");
	const { registerOnboardCommand } = await import("../src/commands/onboard.ts");
	const { registerPinCommand } = await import("../src/commands/pin.ts");
	const { registerDoctorCommand } = await import("../src/commands/doctor.ts");
	const { registerUpgradeCommand } = await import("../src/commands/upgrade.ts");
	const { registerCompletionsCommand } = await import("../src/commands/completions.ts");

	registerInitCommand(program);
	registerShowCommand(program);
	registerListCommand(program);
	registerArchiveCommand(program);
	registerHistoryCommand(program);
	registerTreeCommand(program);
	registerStatsCommand(program);
	registerSyncCommand(program);
	registerDiffCommand(program);
	registerRenderCommand(program);
	registerCreateCommand(program);
	registerUpdateCommand(program);
	registerEmitCommand(program);
	registerSchemaCommand(program);
	registerValidateCommand(program);
	registerConfigCommand(program);
	registerImportCommand(program);
	registerPrimeCommand(program);
	registerOnboardCommand(program);
	registerPinCommand(program);
	registerDoctorCommand(program);
	registerUpgradeCommand(program);
	registerCompletionsCommand(program);

	return program;
}

export function summarizeCommand(cmd: Command): CommandSummary {
	const args: CommandArgument[] = cmd.registeredArguments.map((a) => ({
		name: a.name(),
		description: a.description ?? "",
		required: a.required,
	}));
	const options: CommandOption[] = cmd.options.map((o) => ({
		flags: o.flags,
		description: o.description ?? "",
	}));
	return {
		name: cmd.name(),
		description: cmd.description(),
		args,
		options,
	};
}

export function summarizeProgram(program: Command): CommandSummary[] {
	return program.commands
		.map((cmd) => summarizeCommand(cmd))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function escapeCell(text: string): string {
	return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function renderUsage(summary: CommandSummary): string {
	const argTokens = summary.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`));
	const argStr = argTokens.length > 0 ? ` ${argTokens.join(" ")}` : "";
	const optStr = summary.options.length > 0 ? " [options]" : "";
	return `cn ${summary.name}${argStr}${optStr}`;
}

export function renderMarkdown(summaries: readonly CommandSummary[]): string {
	const sections: string[] = [];

	sections.push("# canopy CLI reference");
	sections.push("");
	sections.push("<!-- AUTO-GENERATED by `bun run gen:docs` from `src/index.ts`. -->");
	sections.push("<!-- Do not edit by hand. CI fails if this file is out of sync. -->");
	sections.push("");
	sections.push(
		"This page enumerates every subcommand registered by canopy's `cn` binary. " +
			"It is derived directly from the Commander tree built in " +
			"[`src/index.ts`](../src/index.ts) so it cannot drift from the running CLI.",
	);
	sections.push("");
	sections.push("To refresh: `bun run gen:docs`. To check (CI mode): `bun run gen:docs:check`.");
	sections.push("");
	sections.push(`Total commands: **${summaries.length}**.`);
	sections.push("");

	sections.push("## Index");
	sections.push("");
	sections.push("| Command | Description |");
	sections.push("| --- | --- |");
	for (const summary of summaries) {
		const anchor = summary.name.toLowerCase();
		sections.push(`| [\`${summary.name}\`](#${anchor}) | ${escapeCell(summary.description)} |`);
	}
	sections.push("");

	for (const summary of summaries) {
		sections.push(`## ${summary.name}`);
		sections.push("");
		if (summary.description) {
			sections.push(summary.description);
			sections.push("");
		}
		sections.push("```bash");
		sections.push(renderUsage(summary));
		sections.push("```");
		sections.push("");

		if (summary.args.length > 0) {
			sections.push("**Arguments:**");
			sections.push("");
			sections.push("| Name | Required | Description |");
			sections.push("| --- | --- | --- |");
			for (const arg of summary.args) {
				sections.push(
					`| \`${arg.name}\` | ${arg.required ? "yes" : "no"} | ${escapeCell(arg.description)} |`,
				);
			}
			sections.push("");
		}

		if (summary.options.length > 0) {
			sections.push("**Options:**");
			sections.push("");
			sections.push("| Flags | Description |");
			sections.push("| --- | --- |");
			for (const opt of summary.options) {
				sections.push(`| \`${opt.flags}\` | ${escapeCell(opt.description)} |`);
			}
			sections.push("");
		}
	}

	return `${sections.join("\n").trimEnd()}\n`;
}

export async function generate(): Promise<{ content: string; summaries: CommandSummary[] }> {
	const program = await buildProgram();
	const summaries = summarizeProgram(program);
	if (summaries.length === 0) {
		throw new Error("Walked an empty command tree — refusing to overwrite docs/cli-reference.md.");
	}
	return { content: renderMarkdown(summaries), summaries };
}

function readExisting(): string | null {
	try {
		return readFileSync(OUTPUT_PATH, "utf8");
	} catch {
		return null;
	}
}

async function main(): Promise<void> {
	const checkMode = process.argv.includes("--check");
	const { content, summaries } = await generate();
	const existing = readExisting();

	if (checkMode) {
		if (existing === null) {
			console.error(
				"docs/cli-reference.md is missing. Run `bun run gen:docs` and commit the result.",
			);
			process.exit(1);
		}
		if (existing !== content) {
			console.error("docs/cli-reference.md is stale relative to src/index.ts.");
			console.error("Run `bun run gen:docs` and commit the result.");
			process.exit(1);
		}
		console.log(`gen:docs ok (${summaries.length} commands).`);
		return;
	}

	writeFileSync(OUTPUT_PATH, content);
	console.log(`Wrote docs/cli-reference.md (${summaries.length} commands).`);
}

if (import.meta.main) await main();
