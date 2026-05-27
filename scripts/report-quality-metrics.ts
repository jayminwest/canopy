#!/usr/bin/env bun
/**
 * report-quality-metrics.ts (L5 toolkit).
 *
 * Emits a consolidated "code-quality metrics" summary into the GitHub
 * Actions step summary (and stdout for local runs). It does NOT enforce
 * anything — each underlying guard (`check-coverage`, biome's complexity
 * rules, `check-file-sizes`, `check-debt-markers`) already fails the
 * build when its ratchet is breached. This report just makes the
 * current state visible in one place so reviewers can see trends at a
 * glance without digging through individual logs.
 *
 * Inputs (all optional — missing artifacts produce a "—" cell rather
 * than a failure, so the script is safe to run before/after coverage):
 *
 *   coverage/summary.json            — line + function totals (preferred, written by check-coverage.ts)
 *   coverage/lcov.info               — line + function totals (fallback only; diverges from Bun text reporter)
 *   budgets/coverage-budgets.json    — coverage floors
 *   biome.json                       — complexity & line-per-fn overrides
 *   budgets/file-size-budgets.json   — grandfathered file-size entries
 *   budgets/debt-markers-budget.json — grandfathered debt markers
 *
 * Usage:
 *   bun run scripts/report-quality-metrics.ts
 *   bun run scripts/report-quality-metrics.ts --lcov path/to/lcov.info
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

export interface CoverageTotals {
	functions: { hit: number; found: number; pct: number };
	lines: { hit: number; found: number; pct: number };
}

/**
 * Parse an lcov.info file into aggregate function + line totals.
 *
 * lcov record fields:
 *   FNF: <count>   — functions found
 *   FNH: <count>   — functions hit
 *   LF:  <count>   — lines found
 *   LH:  <count>   — lines hit
 *
 * We sum across all SF blocks; that matches the "All files" aggregate
 * Bun's text reporter prints (functions% = hit/found, lines% same).
 * Returns `undefined` if the file has no usable records.
 */
export function parseLcov(input: string): CoverageTotals | undefined {
	let fnf = 0;
	let fnh = 0;
	let lf = 0;
	let lh = 0;
	let saw = false;
	for (const rawLine of input.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon);
		const value = Number.parseInt(line.slice(colon + 1).trim(), 10);
		if (!Number.isFinite(value)) continue;
		switch (key) {
			case "FNF":
				fnf += value;
				saw = true;
				break;
			case "FNH":
				fnh += value;
				saw = true;
				break;
			case "LF":
				lf += value;
				saw = true;
				break;
			case "LH":
				lh += value;
				saw = true;
				break;
		}
	}
	if (!saw) return undefined;
	const fnPct = fnf === 0 ? 100 : (fnh / fnf) * 100;
	const linePct = lf === 0 ? 100 : (lh / lf) * 100;
	return {
		functions: { hit: fnh, found: fnf, pct: fnPct },
		lines: { hit: lh, found: lf, pct: linePct },
	};
}

export interface ComplexityOverrides {
	cognitive: number;
	linesPerFunction: number;
}

/**
 * Count files grandfathered out of biome's two complexity rules by
 * scanning biome.json's `overrides` array. Any override block whose
 * `linter.rules.complexity.<rule>` is "off" contributes its `includes`
 * count. By convention each file appears in at most one override block
 * per rule, so we don't dedupe across blocks.
 */
export function countComplexityOverrides(biomeJson: string): ComplexityOverrides {
	const parsed = JSON.parse(biomeJson) as {
		overrides?: Array<{
			includes?: string[];
			linter?: { rules?: { complexity?: Record<string, unknown> } };
		}>;
	};
	let cognitive = 0;
	let linesPerFunction = 0;
	for (const block of parsed.overrides ?? []) {
		const rules = block.linter?.rules?.complexity;
		if (!rules) continue;
		const includes = block.includes ?? [];
		if (rules.noExcessiveCognitiveComplexity === "off") cognitive += includes.length;
		if (rules.noExcessiveLinesPerFunction === "off") linesPerFunction += includes.length;
	}
	return { cognitive, linesPerFunction };
}

export interface FileSizeBudgets {
	threshold: number;
	grandfathered: number;
	largest: number;
}

export function summariseFileSizes(budgetsJson: string): FileSizeBudgets {
	const parsed = JSON.parse(budgetsJson) as {
		threshold?: number;
		budgets?: Record<string, number>;
	};
	const budgets = parsed.budgets ?? {};
	const values = Object.values(budgets);
	return {
		threshold: parsed.threshold ?? 0,
		grandfathered: values.length,
		largest: values.length === 0 ? 0 : Math.max(...values),
	};
}

export interface DebtMarkers {
	grandfathered: number;
}

export function summariseDebt(allowlistJson: string): DebtMarkers {
	const parsed = JSON.parse(allowlistJson) as { allowlist?: unknown[] };
	return { grandfathered: (parsed.allowlist ?? []).length };
}

function fmtPct(actual: number, floor: number): string {
	const delta = actual - floor;
	const sign = delta >= 0 ? "+" : "";
	return `${actual.toFixed(2)}% (floor ${floor.toFixed(2)}%, ${sign}${delta.toFixed(2)}pt)`;
}

export interface ReportInputs {
	summaryJson: string | undefined;
	lcov: string | undefined;
	coverageBudgets: string | undefined;
	biomeJson: string | undefined;
	fileSizeBudgets: string | undefined;
	debtAllowlist: string | undefined;
}

function parseSummaryJson(summaryJson: string): { functions?: number; lines?: number } {
	try {
		const parsed = JSON.parse(summaryJson) as { functions?: number; lines?: number };
		return {
			functions: typeof parsed.functions === "number" ? parsed.functions : undefined,
			lines: typeof parsed.lines === "number" ? parsed.lines : undefined,
		};
	} catch {
		return {};
	}
}

function resolveCoverage(
	summaryJson: string | undefined,
	lcov: string | undefined,
): { functions: number; lines: number } | undefined {
	const fromSummary = summaryJson ? parseSummaryJson(summaryJson) : {};
	const fromLcov = lcov ? parseLcov(lcov) : undefined;
	const functions = fromSummary.functions ?? fromLcov?.functions.pct;
	const lines = fromSummary.lines ?? fromLcov?.lines.pct;
	if (functions === undefined || lines === undefined) return undefined;
	return { functions, lines };
}

function renderCoverageRows(inputs: ReportInputs): string[] {
	const totals = resolveCoverage(inputs.summaryJson, inputs.lcov);
	if (!totals || !inputs.coverageBudgets) {
		return ["| Coverage | — (summary.json/lcov.info or budgets missing) |"];
	}
	const floors = JSON.parse(inputs.coverageBudgets) as { functions: number; lines: number };
	return [
		`| Coverage — functions | ${fmtPct(totals.functions, floors.functions)} |`,
		`| Coverage — lines | ${fmtPct(totals.lines, floors.lines)} |`,
	];
}

function renderComplexityRows(biomeJson: string | undefined): string[] {
	if (!biomeJson) return [];
	const c = countComplexityOverrides(biomeJson);
	return [
		`| Complexity — files exempt from cognitive-complexity ≤ 15 | ${c.cognitive} |`,
		`| Complexity — files exempt from lines-per-function ≤ 500 | ${c.linesPerFunction} |`,
	];
}

function renderRatchetRows(inputs: ReportInputs): string[] {
	const rows: string[] = [];
	if (inputs.fileSizeBudgets) {
		const fs = summariseFileSizes(inputs.fileSizeBudgets);
		rows.push(
			`| File-size budget — grandfathered files | ${fs.grandfathered} (largest ${fs.largest} lines vs ${fs.threshold} threshold) |`,
		);
	}
	if (inputs.debtAllowlist) {
		const d = summariseDebt(inputs.debtAllowlist);
		rows.push(`| Untracked debt markers — grandfathered | ${d.grandfathered} |`);
	}
	return rows;
}

export function formatReport(inputs: ReportInputs): string {
	const lines: string[] = [
		"## Code-quality metrics",
		"",
		"| Metric | Value |",
		"| --- | --- |",
		...renderCoverageRows(inputs),
		...renderComplexityRows(inputs.biomeJson),
		...renderRatchetRows(inputs),
		"",
		"<sub>All numbers above are enforced by individual ratchet scripts; this panel is a passive summary.</sub>",
		"",
	];
	return lines.join("\n");
}

function readIfExists(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function parseArgs(argv: string[]): { lcovPath: string } {
	let lcovPath = resolve(REPO_ROOT, "coverage/lcov.info");
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--lcov") {
			const next = argv[i + 1];
			if (next) {
				lcovPath = resolve(next);
				i++;
			}
		}
	}
	return { lcovPath };
}

async function main(): Promise<void> {
	const { lcovPath } = parseArgs(process.argv.slice(2));

	const formatted = formatReport({
		summaryJson: readIfExists(resolve(REPO_ROOT, "coverage/summary.json")),
		lcov: readIfExists(lcovPath),
		coverageBudgets: readIfExists(resolve(REPO_ROOT, "budgets/coverage-budgets.json")),
		biomeJson: readIfExists(resolve(REPO_ROOT, "biome.json")),
		fileSizeBudgets: readIfExists(resolve(REPO_ROOT, "budgets/file-size-budgets.json")),
		debtAllowlist: readIfExists(resolve(REPO_ROOT, "budgets/debt-markers-budget.json")),
	});

	console.log(formatted);
	const stepSummary = process.env.GITHUB_STEP_SUMMARY;
	if (stepSummary) {
		appendFileSync(stepSummary, `${formatted}\n`);
	}
}

if (import.meta.main) {
	await main();
}
