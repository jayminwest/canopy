import { join } from "node:path";
import type { Command } from "commander";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";

export default async function tree(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn tree <name> [options]

Options:
  --json    Output as JSON`);
		return;
	}

	const name = args.filter((a) => !a.startsWith("--"))[0];
	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "tree", error: "Prompt name required" });
		} else {
			errorOut("Usage: cn tree <name>");
		}
		throw new ExitError(1);
	}

	const allRecords = await readJsonl<Prompt>(promptsPath);
	const current = dedupById(allRecords);

	const prompt = current.find((p) => p.name === name);
	if (!prompt) {
		if (json) {
			jsonOut({ success: false, command: "tree", error: `Prompt '${name}' not found` });
		} else {
			errorOut(`Prompt '${name}' not found`);
		}
		throw new ExitError(1);
	}

	// Build ancestry chain (parents via extends)
	const ancestors: string[] = [];
	let cur: Prompt | undefined = prompt;
	while (cur?.extends) {
		const parentName: string = cur.extends;
		if (ancestors.includes(parentName)) break; // cycle guard
		ancestors.push(parentName);
		cur = current.find((p) => p.name === parentName);
	}
	ancestors.reverse();

	// Collect mixins for the focal prompt
	const mixins: string[] = prompt.mixins ?? [];

	// Find all descendants (via extends or mixins)
	function getChildren(pname: string): string[] {
		return current.filter((p) => p.extends === pname && p.name !== pname).map((p) => p.name);
	}

	function getMixinUsers(pname: string): string[] {
		return current.filter((p) => p.mixins?.includes(pname) && p.name !== pname).map((p) => p.name);
	}

	if (json) {
		const buildTree = (pname: string): object => ({
			name: pname,
			children: getChildren(pname).map(buildTree),
			mixinUsers: getMixinUsers(pname),
		});

		jsonOut({
			success: true,
			command: "tree",
			name,
			ancestors,
			mixins,
			tree: buildTree(name),
		});
		return;
	}

	// Render ancestors
	for (let i = 0; i < ancestors.length; i++) {
		const indent = "  ".repeat(i);
		humanOut(`${indent}${c.dim(ancestors[i] ?? "")}`);
	}

	// Render focal node
	const focalIndent = "  ".repeat(ancestors.length);
	const mixinLabel = mixins.length > 0 ? c.dim(` + ${mixins.join(", ")}`) : "";
	humanOut(`${focalIndent}${c.bold(c.cyan(name))} ${c.dim(`(v${prompt.version})`)}${mixinLabel}`);

	// Render children recursively
	function renderChildren(pname: string, depth: number) {
		const children = getChildren(pname);
		for (const child of children) {
			const indent = "  ".repeat(depth);
			const childPrompt = current.find((p) => p.name === child);
			const ver = childPrompt ? c.dim(` v${childPrompt.version}`) : "";
			const childMixins = childPrompt?.mixins?.length
				? c.dim(` + ${childPrompt.mixins.join(", ")}`)
				: "";
			humanOut(`${indent}├── ${child}${ver}${childMixins}`);
			renderChildren(child, depth + 1);
		}
	}

	renderChildren(name, ancestors.length + 1);
}

export function registerTreeCommand(program: Command): void {
	program
		.command("tree")
		.description("Show inheritance tree for a prompt")
		.argument("<name>", "Prompt name")
		.action(async (name: string) => {
			const json: boolean = program.opts().json ?? false;
			const args = [name, ...(json ? ["--json"] : [])];
			await tree(args, json);
		});
}
