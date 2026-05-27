import { describe, expect, test } from "bun:test";
import {
	type CoverageBudgets,
	type CoverageTotals,
	checkBudgets,
	loadBudgets,
	parseAllFilesRow,
} from "./check-coverage.ts";

describe("loadBudgets", () => {
	test("parses valid percentages", () => {
		const b = loadBudgets(JSON.stringify({ functions: 85.5, lines: 90.25 }));
		expect(b).toEqual({ functions: 85.5, lines: 90.25 });
	});

	test("rejects out-of-range functions floor", () => {
		expect(() => loadBudgets(JSON.stringify({ functions: 120, lines: 90 }))).toThrow(/functions/);
	});

	test("rejects non-numeric lines floor", () => {
		expect(() => loadBudgets(JSON.stringify({ functions: 85, lines: "90" }))).toThrow(/lines/);
	});
});

describe("parseAllFilesRow", () => {
	test("extracts functions and lines from the Bun coverage table", () => {
		const output = [
			"--------------------------------------|---------|---------|-------------------",
			"File                                  | % Funcs | % Lines | Uncovered Line #s",
			"--------------------------------------|---------|---------|-------------------",
			" All files                            |   85.29 |   74.44 |",
			"--------------------------------------|---------|---------|-------------------",
		].join("\n");
		expect(parseAllFilesRow(output)).toEqual({ functions: 85.29, lines: 74.44 });
	});

	test("strips ANSI color codes before matching", () => {
		const colored =
			" All files                            |   \x1B[32m100.00\x1B[0m |   \x1B[32m99.50\x1B[0m |";
		expect(parseAllFilesRow(colored)).toEqual({ functions: 100, lines: 99.5 });
	});

	test("returns undefined when the row is missing", () => {
		expect(parseAllFilesRow("no coverage table here\n")).toBeUndefined();
	});
});

describe("checkBudgets", () => {
	const budgets: CoverageBudgets = { functions: 84, lines: 73 };

	test("returns no failures when both totals clear the floor", () => {
		const totals: CoverageTotals = { functions: 85.29, lines: 74.44 };
		expect(checkBudgets(totals, budgets)).toEqual([]);
	});

	test("flags functions below floor", () => {
		const totals: CoverageTotals = { functions: 80, lines: 92 };
		expect(checkBudgets(totals, budgets)).toEqual([{ metric: "functions", actual: 80, floor: 84 }]);
	});

	test("flags lines below floor", () => {
		const totals: CoverageTotals = { functions: 95, lines: 50 };
		expect(checkBudgets(totals, budgets)).toEqual([{ metric: "lines", actual: 50, floor: 73 }]);
	});

	test("flags both when both drop", () => {
		const totals: CoverageTotals = { functions: 10, lines: 20 };
		const failures = checkBudgets(totals, budgets);
		expect(failures.map((f) => f.metric).sort()).toEqual(["functions", "lines"]);
	});
});
