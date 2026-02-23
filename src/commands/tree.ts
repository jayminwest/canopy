import { join } from "node:path";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";

export default async function tree(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");

	const name = args.filter((a) => !a.startsWith("--"))[0];
	if (!name) {
		if (json) {
			jsonOut({ success: false, command: "tree", error: "Prompt name required" });
		} else {
			errorOut("Usage: cn tree <name>");
		}
		process.exit(1);
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
		process.exit(1);
	}

	// Build ancestry chain (parents)
	const ancestors: string[] = [];
	let cur: Prompt | undefined = prompt;
	while (cur?.extends) {
		const parentName: string = cur.extends;
		if (ancestors.includes(parentName)) break; // cycle guard
		ancestors.push(parentName);
		cur = current.find((p) => p.name === parentName);
	}
	ancestors.reverse();

	// Find all descendants
	function getChildren(pname: string): string[] {
		return current.filter((p) => p.extends === pname && p.name !== pname).map((p) => p.name);
	}

	if (json) {
		const buildTree = (pname: string): object => ({
			name: pname,
			children: getChildren(pname).map(buildTree),
		});

		jsonOut({
			success: true,
			command: "tree",
			name,
			ancestors,
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
	humanOut(`${focalIndent}${c.bold(c.cyan(name))} ${c.dim(`(v${prompt.version})`)}`);

	// Render children recursively
	function renderChildren(pname: string, depth: number) {
		const children = getChildren(pname);
		for (const child of children) {
			const indent = "  ".repeat(depth);
			const childPrompt = current.find((p) => p.name === child);
			const ver = childPrompt ? c.dim(` v${childPrompt.version}`) : "";
			humanOut(`${indent}├── ${child}${ver}`);
			renderChildren(child, depth + 1);
		}
	}

	renderChildren(name, ancestors.length + 1);
}
