import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig } from "../config.ts";
import { c, errorOut, humanOut, jsonOut } from "../output.ts";
import { resolvePrompt } from "../render.ts";
import { dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";

function sectionsToMarkdown(sections: { name: string; body: string }[]): string {
	const parts: string[] = [];
	for (const section of sections) {
		parts.push(`## ${section.name}\n\n${section.body}`);
	}
	return `${parts.join("\n\n")}\n`;
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
		const content = sectionsToMarkdown(result.sections);
		if (existing === content) {
			return { name: prompt.name, path: outPath, version: result.version, skipped: true };
		}
	}

	mkdirSync(dirname(outPath), { recursive: true });
	await Bun.write(outPath, sectionsToMarkdown(result.sections));

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

	// Get output directory
	let outDir: string | undefined;
	const outDirIdx = args.indexOf("--out-dir");
	if (outDirIdx !== -1 && args[outDirIdx + 1]) {
		outDir = args[outDirIdx + 1];
	}
	const resolvedOutDir = outDir ?? config.emitDir ?? "agents";

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
						path: join(resolvedOutDir, p.emitAs ?? `${p.name}.md`),
						version: p.version,
					})),
				});
			} else {
				humanOut(`Would emit ${activePrompts.length} prompts to ${resolvedOutDir}/`);
				for (const p of activePrompts) {
					humanOut(`  ${p.name} → ${p.emitAs ?? `${p.name}.md`}`);
				}
			}
			return;
		}

		if (checkMode) {
			const stale: string[] = [];
			for (const p of activePrompts) {
				const filename = p.emitAs ?? `${p.name}.md`;
				const outPath = join(resolvedOutDir, filename);
				const result = resolvePrompt(p.name, allRecords, p.pinned);
				const expected = sectionsToMarkdown(result.sections);

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
					humanOut(c.green("✓ All emitted files are up to date"));
				} else {
					humanOut(c.red(`✗ ${stale.length} stale file(s):`));
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
			const r = await emitPrompt(p, resolvedOutDir, allRecords, force);
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
	const resolvedPath = outPath ?? join(resolvedOutDir, filename);

	if (!force && existsSync(resolvedPath)) {
		const result = resolvePrompt(prompt.name, allRecords, prompt.pinned);
		const content = sectionsToMarkdown(result.sections);
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
	await Bun.write(resolvedPath, sectionsToMarkdown(result.sections));

	if (json) {
		jsonOut({
			success: true,
			command: "emit",
			files: [{ name: prompt.name, path: resolvedPath, version: result.version }],
		});
	} else {
		humanOut(`${c.green("✓")} ${prompt.name} → ${resolvedPath}`);
	}
}
