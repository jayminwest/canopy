import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../config.ts";
import { renderFrontmatter } from "../frontmatter.ts";
import { c, errorOut, fmt, humanOut, jsonOut } from "../output.ts";
import { resolvePrompt } from "../render.ts";
import { dedupById, readJsonl } from "../store.ts";
import type { Config, Prompt } from "../types.ts";
import { ExitError } from "../types.ts";

function promptToMarkdown(
	sections: { name: string; body: string }[],
	frontmatter: Record<string, unknown>,
	promptName: string,
	promptDescription?: string,
): string {
	const combined: Record<string, unknown> = { name: promptName };
	if (promptDescription) combined.description = promptDescription;
	Object.assign(combined, frontmatter);

	const fmBlock = renderFrontmatter(combined);
	const sectionsMd = `${sections.map((s) => `## ${s.name}\n\n${s.body}`).join("\n\n")}\n`;
	return fmBlock ? `${fmBlock}\n${sectionsMd}` : sectionsMd;
}

export function resolveEmitDir(prompt: Prompt, config: Config): string {
	if (prompt.emitDir) return prompt.emitDir;
	if (config.emitDirByTag && prompt.tags) {
		for (const tag of prompt.tags) {
			const dir = config.emitDirByTag[tag];
			if (dir) return dir;
		}
	}
	return config.emitDir ?? "agents";
}

async function emitPrompt(
	prompt: Prompt,
	outDir: string,
	allPrompts: Prompt[],
	force: boolean,
): Promise<{ name: string; path: string; version: number; skipped?: boolean }> {
	const pinnedVersion = prompt.pinned;
	const result = resolvePrompt(prompt.name, allPrompts, pinnedVersion);
	const filename = prompt.emitAs ?? `${prompt.name}.md`;
	const outPath = join(outDir, filename);

	if (!force && existsSync(outPath)) {
		// Check if up to date
		const existing = await Bun.file(outPath).text();
		const content = promptToMarkdown(
			result.sections,
			result.frontmatter,
			prompt.name,
			prompt.description,
		);
		if (existing === content) {
			return { name: prompt.name, path: outPath, version: result.version, skipped: true };
		}
	}

	mkdirSync(dirname(outPath), { recursive: true });
	await Bun.write(
		outPath,
		promptToMarkdown(result.sections, result.frontmatter, prompt.name, prompt.description),
	);

	return { name: prompt.name, path: outPath, version: result.version };
}

export default async function emit(args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");
	const config = await loadConfig(cwd);

	if (args.includes("--help") || args.includes("-h")) {
		humanOut(`Usage: cn emit <name> [options]
       cn emit --all [options]

Options:
  --all              Emit all active prompts
  --check            Check if emitted files are up to date
  --out <path>       Custom output path (single prompt)
  --out-dir <path>   Custom output directory (--all mode)
  --force            Overwrite even if unchanged
  --dry-run          Show what would be emitted
  --json             Output as JSON`);
		return;
	}

	const force = args.includes("--force");
	const dryRun = args.includes("--dry-run");
	const checkMode = args.includes("--check");
	const allMode = args.includes("--all") || checkMode;

	const allRecords = await readJsonl<Prompt>(promptsPath);
	const current = dedupById(allRecords);

	// Get output directory override (applies to all prompts when set)
	let outDir: string | undefined;
	const outDirIdx = args.indexOf("--out-dir");
	if (outDirIdx !== -1 && args[outDirIdx + 1]) {
		outDir = args[outDirIdx + 1];
	}

	if (allMode) {
		const activePrompts = current.filter((p) => p.status === "active");

		if (dryRun) {
			if (json) {
				jsonOut({
					success: true,
					command: "emit",
					dryRun: true,
					files: activePrompts.map((p) => ({
						name: p.name,
						path: join(outDir ?? resolveEmitDir(p, config), p.emitAs ?? `${p.name}.md`),
						version: p.version,
					})),
				});
			} else {
				if (outDir) {
					humanOut(`Would emit ${activePrompts.length} prompts to ${outDir}/`);
				} else {
					humanOut(`Would emit ${activePrompts.length} prompts:`);
				}
				for (const p of activePrompts) {
					const dir = outDir ?? resolveEmitDir(p, config);
					humanOut(`  ${p.name} → ${join(dir, p.emitAs ?? `${p.name}.md`)}`);
				}
			}
			return;
		}

		if (checkMode) {
			const stale: string[] = [];
			for (const p of activePrompts) {
				const filename = p.emitAs ?? `${p.name}.md`;
				const promptOutDir = outDir ?? resolveEmitDir(p, config);
				const outPath = join(promptOutDir, filename);
				const result = resolvePrompt(p.name, allRecords, p.pinned);
				const expected = promptToMarkdown(
					result.sections,
					result.frontmatter,
					p.name,
					p.description,
				);

				let actual = "";
				try {
					actual = await Bun.file(outPath).text();
				} catch {
					stale.push(p.name);
					continue;
				}

				if (actual !== expected) {
					stale.push(p.name);
				}
			}

			if (json) {
				jsonOut({
					success: stale.length === 0,
					command: "emit",
					check: true,
					stale,
					upToDate: stale.length === 0,
				});
			} else {
				if (stale.length === 0) {
					humanOut(fmt.success("All emitted files are up to date"));
				} else {
					humanOut(fmt.error(`${stale.length} stale file(s)`));
					for (const name of stale) {
						humanOut(`  - ${name}`);
					}
				}
			}

			if (stale.length > 0) throw new ExitError(1);
			return;
		}

		const results = [];
		for (const p of activePrompts) {
			const r = await emitPrompt(p, outDir ?? resolveEmitDir(p, config), allRecords, force);
			results.push(r);
		}

		if (json) {
			jsonOut({ success: true, command: "emit", files: results });
		} else {
			for (const r of results) {
				const status = r.skipped ? c.dim("(unchanged)") : c.green("✓");
				humanOut(`${status} ${r.name} → ${r.path}`);
			}
		}
		return;
	}

	// Single prompt emit
	const nameArg = args.filter((a) => !a.startsWith("--"))[0];
	if (!nameArg) {
		if (json) {
			jsonOut({ success: false, command: "emit", error: "Prompt name or --all required" });
		} else {
			errorOut("Usage: cn emit <name> [--out <path>] or cn emit --all");
		}
		throw new ExitError(1);
	}

	const prompt = current.find((p) => p.name === nameArg);
	if (!prompt) {
		if (json) {
			jsonOut({ success: false, command: "emit", error: `Prompt '${nameArg}' not found` });
		} else {
			errorOut(`Prompt '${nameArg}' not found`);
		}
		throw new ExitError(1);
	}

	// Custom --out path
	let outPath: string | undefined;
	const outIdx = args.indexOf("--out");
	if (outIdx !== -1 && args[outIdx + 1]) {
		outPath = args[outIdx + 1];
	}

	const filename = prompt.emitAs ?? `${prompt.name}.md`;
	const singleOutDir = outDir ?? resolveEmitDir(prompt, config);
	const resolvedPath = outPath ?? join(singleOutDir, filename);

	if (!force && existsSync(resolvedPath)) {
		const result = resolvePrompt(prompt.name, allRecords, prompt.pinned);
		const content = promptToMarkdown(
			result.sections,
			result.frontmatter,
			prompt.name,
			prompt.description,
		);
		const existing = await Bun.file(resolvedPath).text();
		if (existing === content) {
			if (json) {
				jsonOut({
					success: true,
					command: "emit",
					files: [
						{ name: prompt.name, path: resolvedPath, version: result.version, skipped: true },
					],
				});
			} else {
				humanOut(c.dim(`(unchanged) ${prompt.name} → ${resolvedPath}`));
			}
			return;
		}
	}

	const result = resolvePrompt(prompt.name, allRecords, prompt.pinned);
	mkdirSync(dirname(resolvedPath), { recursive: true });
	await Bun.write(
		resolvedPath,
		promptToMarkdown(result.sections, result.frontmatter, prompt.name, prompt.description),
	);

	if (json) {
		jsonOut({
			success: true,
			command: "emit",
			files: [{ name: prompt.name, path: resolvedPath, version: result.version }],
		});
	} else {
		humanOut(fmt.success(`${prompt.name} → ${resolvedPath}`));
	}
}

export function register(program: Command): void {
	program
		.command("emit [name]")
		.description("Render and write prompt to a file")
		.option("--all", "Emit all active prompts")
		.option("--check", "Check if emitted files are up to date")
		.option("--out <path>", "Custom output path (single prompt)")
		.option("--out-dir <path>", "Custom output directory (--all mode)")
		.option("--force", "Overwrite even if unchanged")
		.option("--dry-run", "Show what would be emitted")
		.action(async (name: string | undefined, opts: Record<string, unknown>) => {
			const json: boolean = program.opts().json ?? false;
			const args: string[] = [];
			if (name) args.push(name);
			if (opts.all) args.push("--all");
			if (opts.check) args.push("--check");
			if (opts.out) args.push("--out", opts.out as string);
			if (opts.outDir) args.push("--out-dir", opts.outDir as string);
			if (opts.force) args.push("--force");
			if (opts.dryRun) args.push("--dry-run");
			await emit(args, json);
		});
}
