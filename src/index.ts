#!/usr/bin/env bun
import { Command } from "commander";
import { errorOut, isJsonMode, jsonOut } from "./output.ts";
import { ExitError } from "./types.ts";

export const VERSION = "0.1.2";

const program = new Command();
program
	.name("cn")
	.description("Git-native prompt management for AI agent workflows")
	.version(VERSION, "-v, --version", "Show version");

// Register commands that have been migrated to the register pattern
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

// Pass-through dispatch for commands not yet on the register pattern.
// Uses process.argv directly so all flags/options are forwarded unchanged.
function addPassThrough(
	cmdName: string,
	loader: () => Promise<{ default: (args: string[], json: boolean) => Promise<void> }>,
) {
	program
		.command(cmdName)
		.allowUnknownOption()
		.allowExcessArguments()
		.action(async () => {
			const rawArgs = process.argv.slice(3);
			const json = isJsonMode(rawArgs);
			const mod = await loader();
			await mod.default(rawArgs, json);
		});
}

addPassThrough("create", () => import("./commands/create.ts"));
addPassThrough("update", () => import("./commands/update.ts"));
addPassThrough("emit", () => import("./commands/emit.ts"));
addPassThrough("schema", () => import("./commands/schema.ts"));
addPassThrough("validate", () => import("./commands/validate.ts"));
addPassThrough("import", () => import("./commands/import.ts"));
addPassThrough("prime", () => import("./commands/prime.ts"));
addPassThrough("onboard", () => import("./commands/onboard.ts"));

// pin / unpin share a module with separate entry points
program
	.command("pin")
	.allowUnknownOption()
	.allowExcessArguments()
	.action(async () => {
		const rawArgs = process.argv.slice(3);
		const json = isJsonMode(rawArgs);
		const mod = await import("./commands/pin.ts");
		await mod.default(rawArgs, json);
	});

program
	.command("unpin")
	.allowUnknownOption()
	.allowExcessArguments()
	.action(async () => {
		const rawArgs = process.argv.slice(3);
		const json = isJsonMode(rawArgs);
		const mod = await import("./commands/pin.ts");
		await mod.defaultUnpin(rawArgs, json);
	});

program.parseAsync(process.argv).catch((err: unknown) => {
	if (err instanceof ExitError) {
		process.exit(err.exitCode);
	}
	const msg = err instanceof Error ? err.message : String(err);
	const json = isJsonMode(process.argv.slice(2));
	if (json) {
		jsonOut({ success: false, error: msg });
	} else {
		errorOut(`Error: ${msg}`);
	}
	process.exit(1);
});
