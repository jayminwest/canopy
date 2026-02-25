#!/usr/bin/env bun
import chalk from "chalk";
import { Command, Help } from "commander";
import { errorOut, isJsonMode, jsonOut, palette, setQuiet } from "./output.ts";
import { ExitError } from "./types.ts";

export const VERSION = "0.1.8";

const t0 = performance.now();

const rawArgs = process.argv.slice(2);

// --version --json: rich metadata output (before Commander processes version flag)
if ((rawArgs.includes("-v") || rawArgs.includes("--version")) && rawArgs.includes("--json")) {
	const platform = `${process.platform}-${process.arch}`;
	console.log(
		JSON.stringify({ name: "@os-eco/canopy-cli", version: VERSION, runtime: "bun", platform }),
	);
	process.exit();
}

// Apply quiet mode early (before Commander parses)
if (rawArgs.includes("--quiet") || rawArgs.includes("-q")) {
	setQuiet(true);
}

const program = new Command();
program
	.name("cn")
	.description("Prompt management & composition")
	.version(VERSION, "-v, --version", "Show version")
	.option("-q, --quiet", "Suppress non-error output")
	.option("--verbose", "Extra diagnostic output")
	.option("--timing", "Show command execution time")
	.addHelpCommand(false)
	.configureHelp({
		formatHelp(cmd: Command, helper: Help): string {
			if (cmd.parent) {
				return Help.prototype.formatHelp.call(helper, cmd, helper);
			}
			const header = `${palette.brand(chalk.bold("canopy"))} ${palette.muted(`v${VERSION}`)} — Prompt management & composition\n\nUsage: cn <command> [options]`;

			const cmdLines: string[] = ["\nCommands:"];
			for (const sub of cmd.commands) {
				const name = sub.name();
				const argStr = sub.registeredArguments
					.map((a) => (a.required ? `<${a.name()}>` : `[${a.name()}]`))
					.join(" ");
				const rawEntry = argStr ? `${name} ${argStr}` : name;
				const colored = argStr ? `${chalk.green(name)} ${chalk.dim(argStr)}` : chalk.green(name);
				const pad = " ".repeat(Math.max(18 - rawEntry.length, 2));
				cmdLines.push(`  ${colored}${pad}${sub.description()}`);
			}

			const opts: [string, string][] = [
				["-h, --help", "Show help"],
				["-v, --version", "Show version"],
				["--json", "Output as JSON"],
				["-q, --quiet", "Suppress non-error output"],
				["--verbose", "Extra diagnostic output"],
				["--timing", "Show command execution time"],
			];
			const optLines: string[] = ["\nOptions:"];
			for (const [flag, desc] of opts) {
				const pad = " ".repeat(Math.max(18 - flag.length, 2));
				optLines.push(`  ${chalk.dim(flag)}${pad}${desc}`);
			}

			const footer = `\nRun '${chalk.dim("cn")} <command> --help' for command-specific help.`;

			return `${[header, ...cmdLines, ...optLines, footer].join("\n")}\n`;
		},
	});

const { register: registerInit } = await import("./commands/init.ts");
const { register: registerShow } = await import("./commands/show.ts");
const { register: registerList } = await import("./commands/list.ts");
const { register: registerArchive } = await import("./commands/archive.ts");
const { register: registerHistory } = await import("./commands/history.ts");
const { register: registerTree } = await import("./commands/tree.ts");
const { register: registerStats } = await import("./commands/stats.ts");
const { register: registerSync } = await import("./commands/sync.ts");
const { register: registerDiff } = await import("./commands/diff.ts");
const { register: registerRender } = await import("./commands/render.ts");
const { register: registerCreate } = await import("./commands/create.ts");
const { register: registerUpdate } = await import("./commands/update.ts");
const { register: registerEmit } = await import("./commands/emit.ts");
const { register: registerSchema } = await import("./commands/schema.ts");
const { register: registerValidate } = await import("./commands/validate.ts");
const { register: registerImport } = await import("./commands/import.ts");
const { register: registerPrime } = await import("./commands/prime.ts");
const { register: registerOnboard } = await import("./commands/onboard.ts");
const { register: registerPin } = await import("./commands/pin.ts");
const { register: registerDoctor } = await import("./commands/doctor.ts");
const { register: registerUpgrade } = await import("./commands/upgrade.ts");
const { createCompletionsCommand } = await import("./commands/completions.ts");

registerInit(program);
registerShow(program);
registerList(program);
registerArchive(program);
registerHistory(program);
registerTree(program);
registerStats(program);
registerSync(program);
registerDiff(program);
registerRender(program);
registerCreate(program);
registerUpdate(program);
registerEmit(program);
registerSchema(program);
registerValidate(program);
registerImport(program);
registerPrime(program);
registerOnboard(program);
registerPin(program); // registers both pin and unpin
registerDoctor(program);
registerUpgrade(program);
program.addCommand(createCompletionsCommand());

// --- Typo suggestions via Levenshtein distance ---

function editDistance(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp = new Array<number>((m + 1) * (n + 1)).fill(0);
	const idx = (i: number, j: number) => i * (n + 1) + j;
	for (let i = 0; i <= m; i++) dp[idx(i, 0)] = i;
	for (let j = 0; j <= n; j++) dp[idx(0, j)] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const del = (dp[idx(i - 1, j)] ?? 0) + 1;
			const ins = (dp[idx(i, j - 1)] ?? 0) + 1;
			const sub = (dp[idx(i - 1, j - 1)] ?? 0) + cost;
			dp[idx(i, j)] = Math.min(del, ins, sub);
		}
	}
	return dp[idx(m, n)] ?? 0;
}

function suggestCommand(input: string): string | undefined {
	const commands = program.commands.map((c) => c.name());
	let bestMatch: string | undefined;
	let bestDist = 3; // Only suggest if distance <= 2
	for (const cmd of commands) {
		const dist = editDistance(input, cmd);
		if (dist < bestDist) {
			bestDist = dist;
			bestMatch = cmd;
		}
	}
	return bestMatch;
}

program.on("command:*", (operands) => {
	const unknown = operands[0] ?? "";
	process.stderr.write(`Unknown command: ${unknown}\n`);
	const suggestion = suggestCommand(unknown);
	if (suggestion) {
		process.stderr.write(`Did you mean '${suggestion}'?\n`);
	}
	process.stderr.write("Run 'cn --help' for usage.\n");
	process.exit(1);
});

program
	.parseAsync(process.argv)
	.then(() => {
		if (program.opts().timing) {
			const elapsed = Math.round(performance.now() - t0);
			process.stderr.write(`[timing] ${elapsed}ms\n`);
		}
	})
	.catch((err: unknown) => {
		if (program.opts().timing) {
			const elapsed = Math.round(performance.now() - t0);
			process.stderr.write(`[timing] ${elapsed}ms\n`);
		}
		if (err instanceof ExitError) {
			process.exitCode = err.exitCode;
			return;
		}
		const msg = err instanceof Error ? err.message : String(err);
		const command = process.argv[2] ?? "";
		const json = isJsonMode(process.argv.slice(2));
		if (json) {
			jsonOut({ success: false, command, error: msg });
		} else {
			errorOut(`Error: ${msg}`);
		}
		process.exitCode = 1;
	});
