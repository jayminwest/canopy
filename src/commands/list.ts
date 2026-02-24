import { join } from "node:path";
import type { Command } from "commander";
import { c, humanOut, jsonOut } from "../output.ts";
import { dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";

export default async function list(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn list [options]

Options:
  --tag <tag>     Filter by tag
  --status <s>    Filter by status (draft|active|archived)
  --json          Output as JSON`);
		return;
	}

	// Parse filters
	let filterTag: string | undefined;
	let filterStatus: string | undefined;
	let filterExtends: string | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--tag" && args[i + 1]) {
			filterTag = args[++i];
		} else if (args[i] === "--status" && args[i + 1]) {
			filterStatus = args[++i];
		} else if (args[i] === "--extends" && args[i + 1]) {
			filterExtends = args[++i];
		}
	}

	const allRecords = await readJsonl<Prompt>(promptsPath);
	let prompts = dedupById(allRecords);

	// Default: exclude archived unless explicitly requested
	if (!filterStatus) {
		prompts = prompts.filter((p) => p.status !== "archived");
	} else {
		prompts = prompts.filter((p) => p.status === filterStatus);
	}

	if (filterTag) {
		prompts = prompts.filter((p) => p.tags?.includes(filterTag as string));
	}

	if (filterExtends) {
		prompts = prompts.filter((p) => p.extends === filterExtends);
	}

	if (json) {
		jsonOut({ success: true, command: "list", prompts, count: prompts.length });
	} else {
		if (prompts.length === 0) {
			humanOut("No prompts found.");
			return;
		}

		for (const p of prompts) {
			const tags = p.tags?.length ? c.dim(` [${p.tags.join(", ")}]`) : "";
			const ext = p.extends ? c.dim(` → ${p.extends}`) : "";
			const pin = p.pinned !== undefined ? c.yellow(` (pinned @${p.pinned})`) : "";
			humanOut(
				`${c.bold(p.name)}${ext}${tags}${pin}  ${c.dim(`v${p.version} · ${p.status} · ${p.id}`)}`,
			);
		}
		humanOut(c.dim(`\n${prompts.length} prompt${prompts.length === 1 ? "" : "s"}`));
	}
}

export function register(program: Command): void {
	program
		.command("list")
		.description("List prompts")
		.option("--tag <tag>", "Filter by tag")
		.option("--status <status>", "Filter by status (draft|active|archived)")
		.option("--extends <name>", "Filter by parent prompt")
		.option("--json", "Output as JSON")
		.action(
			async (options: { tag?: string; status?: string; extends?: string; json?: boolean }) => {
				const args: string[] = [];
				if (options.tag) args.push("--tag", options.tag);
				if (options.status) args.push("--status", options.status);
				if (options.extends) args.push("--extends", options.extends);
				if (options.json) args.push("--json");
				await list(args, options.json ?? false);
			},
		);
}
