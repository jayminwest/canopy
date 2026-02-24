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
