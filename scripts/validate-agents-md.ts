#!/usr/bin/env bun
/**
 * AGENTS.md validator (L5 toolkit port).
 *
 * Static-checks `AGENTS.md` (and any other markdown doc supplied via
 * `--target`) against canopy's `package.json` + working tree:
 *
 *   - Every `bun run <NAME>` token inside a fenced bash/sh/shell block
 *     must reference a script defined in `package.json` scripts.
 *   - Every backtick-wrapped token that looks like a repo path must
 *     resolve on disk relative to the repo root.
 *
 * A small `known-missing` allowlist whitelists paths that are
 * intentionally not vendored (build artifacts, generated reporters,
 * placeholders documented in conventions). Keep the list short — each
 * entry is a deliberate exception.
 *
 * Wired into `bun run check:agents` and `.github/workflows/ci.yml`.
 *
 * CLI:
 *   bun run scripts/validate-agents-md.ts                 # validate AGENTS.md
 *   bun run scripts/validate-agents-md.ts --repo-root R --target AGENTS.md \
 *       --target CLAUDE.md --known-missing path/to/file.md
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT_DIR = import.meta.dir;
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_TARGETS = ["AGENTS.md"] as const;

/**
 * Paths AGENTS.md may legitimately reference but that are not in the
 * checked-in tree (build outputs, gitignored CI artifacts, placeholder
 * filenames used in naming-convention illustrations). Every entry here
 * is a conscious exception.
 */
const DEFAULT_KNOWN_MISSING = new Set<string>([
	"coverage/lcov.info",
	"coverage",
	"test-results/junit.xml",
	"test-results",
	"junit.xml",
	"kebab-case.ts",
]);

export type FailureKind = "missing-doc" | "missing-script" | "missing-path";

export interface Failure {
	file: string;
	kind: FailureKind;
	detail: string;
}

export function loadPackageScripts(repoRoot: string): Set<string> {
	const pkgPath = resolve(repoRoot, "package.json");
	if (!existsSync(pkgPath)) return new Set();
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
		scripts?: Record<string, string>;
	};
	return new Set(Object.keys(pkg.scripts ?? {}));
}

export function extractFencedBashBlocks(markdown: string): string[] {
	const blocks: string[] = [];
	const fence = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop
	while ((match = fence.exec(markdown)) !== null) {
		const body = match[1];
		if (body !== undefined) blocks.push(body);
	}
	return blocks;
}

export function stripShellComments(block: string): string {
	return block
		.split("\n")
		.map((line) => {
			const hash = line.indexOf("#");
			return hash === -1 ? line : line.slice(0, hash);
		})
		.join("\n");
}

export function extractBunRunScripts(blocks: string[]): Set<string> {
	const scripts = new Set<string>();
	const pattern = /\bbun\s+run\s+([a-zA-Z0-9:_-]+)/g;
	for (const rawBlock of blocks) {
		const block = stripShellComments(rawBlock);
		let m: RegExpExecArray | null;
		// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop
		while ((m = pattern.exec(block)) !== null) {
			const name = m[1];
			if (name !== undefined) scripts.add(name);
		}
	}
	return scripts;
}

export function extractBacktickedPaths(markdown: string): string[] {
	const paths: string[] = [];
	const inline = /`([^`\n]+)`/g;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop
	while ((m = inline.exec(markdown)) !== null) {
		const raw = m[1];
		if (raw === undefined) continue;
		const token = raw.trim();
		if (/^https?:\/\//.test(token)) continue;
		if (/\s/.test(token)) continue;
		if (token.startsWith("@")) continue;
		if (token.endsWith("...")) continue;
		if (/^\.[A-Za-z0-9]+$/.test(token)) continue;
		if (!/^[.A-Za-z0-9_][A-Za-z0-9_.\-/]*\/?$/.test(token)) continue;
		const looksLikePath =
			token.includes("/") || /\.(md|json|ya?ml|toml|ts|tsx|js|sh|lock)$/.test(token);
		if (!looksLikePath) continue;
		const cleaned = token.replace(/\/+$/, "");
		if (cleaned.includes("<") || cleaned.includes(">")) continue;
		if (cleaned.includes("*")) continue;
		paths.push(cleaned);
	}
	return paths;
}

export interface ValidateOptions {
	repoRoot?: string;
	targets?: readonly string[];
	knownMissingPaths?: ReadonlySet<string>;
}

export interface ValidateResult {
	failures: Failure[];
	checkedScripts: Set<string>;
	checkedPaths: string[];
}

export function validate(options: ValidateOptions = {}): ValidateResult {
	const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
	const targets = options.targets ?? DEFAULT_TARGETS;
	const knownMissing = options.knownMissingPaths ?? DEFAULT_KNOWN_MISSING;
	const scripts = loadPackageScripts(repoRoot);
	const failures: Failure[] = [];
	const checkedScripts = new Set<string>();
	const checkedPaths: string[] = [];

	for (const rel of targets) {
		const abs = resolve(repoRoot, rel);
		if (!existsSync(abs)) {
			failures.push({ file: rel, kind: "missing-doc", detail: `${rel} not found` });
			continue;
		}
		const src = readFileSync(abs, "utf8");

		const bunRunScripts = extractBunRunScripts(extractFencedBashBlocks(src));
		for (const name of bunRunScripts) {
			checkedScripts.add(name);
			if (!scripts.has(name)) {
				failures.push({
					file: rel,
					kind: "missing-script",
					detail: `\`bun run ${name}\` referenced but not defined in package.json scripts`,
				});
			}
		}

		for (const p of extractBacktickedPaths(src)) {
			checkedPaths.push(p);
			if (knownMissing.has(p)) continue;
			if (!existsSync(resolve(repoRoot, p))) {
				failures.push({
					file: rel,
					kind: "missing-path",
					detail: `referenced path \`${p}\` does not exist`,
				});
			}
		}
	}

	return { failures, checkedScripts, checkedPaths };
}

interface ParsedArgs {
	repoRoot?: string;
	targets: string[];
	knownMissing: string[];
}

function parseArgs(argv: readonly string[]): ParsedArgs {
	const out: ParsedArgs = { targets: [], knownMissing: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--repo-root") {
			out.repoRoot = argv[++i];
		} else if (a === "--target") {
			const v = argv[++i];
			if (v) out.targets.push(v);
		} else if (a === "--known-missing") {
			const v = argv[++i];
			if (v) out.knownMissing.push(v);
		}
	}
	return out;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const options: ValidateOptions = {};
	if (args.repoRoot) options.repoRoot = resolve(args.repoRoot);
	if (args.targets.length > 0) options.targets = args.targets;
	if (args.knownMissing.length > 0) {
		const merged = new Set<string>(DEFAULT_KNOWN_MISSING);
		for (const p of args.knownMissing) merged.add(p);
		options.knownMissingPaths = merged;
	}

	const { failures } = validate(options);
	const targetsLabel = (options.targets ?? DEFAULT_TARGETS).join(", ");

	if (failures.length === 0) {
		console.log(`✓ AGENTS.md validation passed (${targetsLabel})`);
		return;
	}

	console.error("✗ AGENTS.md validation failed:");
	for (const f of failures) {
		console.error(`  [${f.kind}] ${f.file}: ${f.detail}`);
	}
	process.exit(1);
}

if (import.meta.main) main();
