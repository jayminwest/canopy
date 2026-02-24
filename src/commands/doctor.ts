import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import { loadConfig } from "../config.ts";
import { jsonOut, palette } from "../output.ts";
import { resolvePrompt } from "../render.ts";
import { dedupById, dedupByIdLast, readJsonl } from "../store.ts";
import type { Prompt, Schema } from "../types.ts";
import { LOCK_STALE_MS } from "../types.ts";
import { validatePrompt } from "../validate.ts";

interface DoctorCheck {
	name: string;
	status: "pass" | "warn" | "fail";
	message: string;
	details: string[];
	fixable: boolean;
}

interface RawLine {
	lineNumber: number;
	text: string;
	parsed?: unknown;
	error?: string;
}

function readRawLines(filePath: string): RawLine[] {
	if (!existsSync(filePath)) return [];
	const content = readFileSync(filePath, "utf8");
	const lines: RawLine[] = [];
	for (const [i, raw] of content.split("\n").entries()) {
		const text = raw.trim();
		if (!text) continue;
		try {
			lines.push({ lineNumber: i + 1, text, parsed: JSON.parse(text) });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			lines.push({ lineNumber: i + 1, text, error: msg });
		}
	}
	return lines;
}

// 1. config check
async function checkConfig(canopyDir: string): Promise<DoctorCheck> {
	const configPath = join(canopyDir, "config.yaml");
	if (!existsSync(canopyDir)) {
		return {
			name: "config",
			status: "fail",
			message: ".canopy/ directory not found",
			details: [],
			fixable: false,
		};
	}
	if (!existsSync(configPath)) {
		return {
			name: "config",
			status: "fail",
			message: "config.yaml is missing",
			details: [],
			fixable: false,
		};
	}
	try {
		const cwd = canopyDir.replace(/\/.canopy$/, "");
		const config = await loadConfig(cwd);
		if (!config.project) {
			return {
				name: "config",
				status: "fail",
				message: "config.yaml missing required 'project' field",
				details: [],
				fixable: false,
			};
		}
		return {
			name: "config",
			status: "pass",
			message: "Config is valid",
			details: [],
			fixable: false,
		};
	} catch {
		return {
			name: "config",
			status: "fail",
			message: "config.yaml is unparseable",
			details: [],
			fixable: false,
		};
	}
}

// 2. prompts-integrity
function checkPromptsIntegrity(canopyDir: string): DoctorCheck {
	const filePath = join(canopyDir, "prompts.jsonl");
	if (!existsSync(filePath)) {
		return {
			name: "prompts-integrity",
			status: "warn",
			message: "prompts.jsonl not found",
			details: [],
			fixable: false,
		};
	}
	const lines = readRawLines(filePath);
	const badLines = lines.filter((l) => l.error);
	if (badLines.length > 0) {
		return {
			name: "prompts-integrity",
			status: "fail",
			message: `${String(badLines.length)} malformed line(s) in prompts.jsonl`,
			details: badLines.map((l) => `line ${String(l.lineNumber)}: ${l.error}`),
			fixable: false,
		};
	}
	const validCount = lines.filter((l) => l.parsed).length;
	return {
		name: "prompts-integrity",
		status: "pass",
		message: `${String(validCount)} records, all valid`,
		details: [],
		fixable: false,
	};
}

// 3. schemas-integrity
function checkSchemasIntegrity(canopyDir: string): DoctorCheck {
	const filePath = join(canopyDir, "schemas.jsonl");
	if (!existsSync(filePath)) {
		return {
			name: "schemas-integrity",
			status: "pass",
			message: "No schemas.jsonl (optional)",
			details: [],
			fixable: false,
		};
	}
	const lines = readRawLines(filePath);
	const badLines = lines.filter((l) => l.error);
	if (badLines.length > 0) {
		return {
			name: "schemas-integrity",
			status: "fail",
			message: `${String(badLines.length)} malformed line(s) in schemas.jsonl`,
			details: badLines.map((l) => `line ${String(l.lineNumber)}: ${l.error}`),
			fixable: false,
		};
	}
	const validCount = lines.filter((l) => l.parsed).length;
	return {
		name: "schemas-integrity",
		status: "pass",
		message: `${String(validCount)} records, all valid`,
		details: [],
		fixable: false,
	};
}

// 4. schema-validation
async function checkSchemaValidation(canopyDir: string): Promise<DoctorCheck> {
	const promptsPath = join(canopyDir, "prompts.jsonl");
	const schemasPath = join(canopyDir, "schemas.jsonl");
	if (!existsSync(promptsPath)) {
		return {
			name: "schema-validation",
			status: "pass",
			message: "No prompts to validate",
			details: [],
			fixable: false,
		};
	}

	const allRecords = await readJsonl<Prompt>(promptsPath);
	const prompts = dedupById(allRecords);
	const activeWithSchema = prompts.filter((p) => p.status === "active" && p.schema);

	if (activeWithSchema.length === 0) {
		return {
			name: "schema-validation",
			status: "pass",
			message: "No prompts with schema declarations",
			details: [],
			fixable: false,
		};
	}

	let schemas: Schema[] = [];
	if (existsSync(schemasPath)) {
		const schemaRecords = await readJsonl<Schema>(schemasPath);
		schemas = dedupByIdLast(schemaRecords);
	}

	const schemaMap = new Map<string, Schema>();
	for (const s of schemas) {
		schemaMap.set(s.name, s);
	}

	const details: string[] = [];
	for (const prompt of activeWithSchema) {
		const schema = schemaMap.get(prompt.schema as string);
		if (!schema) {
			details.push(`${prompt.name}: schema "${prompt.schema}" not found`);
			continue;
		}
		const result = validatePrompt(prompt, schema, prompts);
		if (!result.valid) {
			for (const err of result.errors) {
				details.push(`${prompt.name}: ${err.message}`);
			}
		}
	}

	if (details.length > 0) {
		return {
			name: "schema-validation",
			status: "warn",
			message: `${String(details.length)} validation issue(s)`,
			details,
			fixable: false,
		};
	}
	return {
		name: "schema-validation",
		status: "pass",
		message: "All schema-declared prompts pass validation",
		details: [],
		fixable: false,
	};
}

// 5. inheritance
async function checkInheritance(canopyDir: string): Promise<DoctorCheck> {
	const promptsPath = join(canopyDir, "prompts.jsonl");
	if (!existsSync(promptsPath)) {
		return {
			name: "inheritance",
			status: "pass",
			message: "No prompts to check",
			details: [],
			fixable: false,
		};
	}

	const allRecords = await readJsonl<Prompt>(promptsPath);
	const prompts = dedupById(allRecords);
	const details: string[] = [];

	for (const prompt of prompts) {
		if (!prompt.extends) continue;
		try {
			resolvePrompt(prompt.name, prompts);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			details.push(`${prompt.name}: ${msg}`);
		}
	}

	if (details.length > 0) {
		return {
			name: "inheritance",
			status: "fail",
			message: `${String(details.length)} broken inheritance chain(s)`,
			details,
			fixable: false,
		};
	}
	return {
		name: "inheritance",
		status: "pass",
		message: "No broken references",
		details: [],
		fixable: false,
	};
}

// 6. emit-staleness
async function checkEmitStaleness(canopyDir: string): Promise<DoctorCheck> {
	const promptsPath = join(canopyDir, "prompts.jsonl");
	if (!existsSync(promptsPath)) {
		return {
			name: "emit-staleness",
			status: "pass",
			message: "No prompts to check",
			details: [],
			fixable: false,
		};
	}

	const cwd = canopyDir.replace(/\/.canopy$/, "");
	const config = await loadConfig(cwd);
	const emitDir = config.emitDir ?? "agents";
	const resolvedEmitDir = join(cwd, emitDir);

	const allRecords = await readJsonl<Prompt>(promptsPath);
	const prompts = dedupById(allRecords);
	const activePrompts = prompts.filter((p) => p.status === "active");

	if (activePrompts.length === 0) {
		return {
			name: "emit-staleness",
			status: "pass",
			message: "No active prompts to emit",
			details: [],
			fixable: false,
		};
	}

	const details: string[] = [];
	for (const p of activePrompts) {
		const filename = p.emitAs ?? `${p.name}.md`;
		const outPath = join(resolvedEmitDir, filename);
		if (!existsSync(outPath)) {
			details.push(`${p.name}: emitted file missing (${filename})`);
			continue;
		}

		try {
			const result = resolvePrompt(p.name, allRecords, p.pinned);
			const sections = result.sections;
			const expected = `${sections.map((s) => `## ${s.name}\n\n${s.body}`).join("\n\n")}\n`;
			const actual = await Bun.file(outPath).text();
			if (actual !== expected) {
				details.push(`${p.name}: emitted file is stale`);
			}
		} catch {
			details.push(`${p.name}: could not resolve for comparison`);
		}
	}

	if (details.length > 0) {
		return {
			name: "emit-staleness",
			status: "warn",
			message: `${String(details.length)} stale or missing emitted file(s)`,
			details,
			fixable: false,
		};
	}
	return {
		name: "emit-staleness",
		status: "pass",
		message: "All emitted files current",
		details: [],
		fixable: false,
	};
}

// 7. stale-locks
function checkStaleLocks(canopyDir: string): DoctorCheck {
	const details: string[] = [];
	try {
		const entries = readdirSync(canopyDir);
		for (const entry of entries) {
			if (!entry.endsWith(".lock")) continue;
			const lockPath = join(canopyDir, entry);
			try {
				const st = statSync(lockPath);
				const age = Date.now() - st.mtimeMs;
				if (age > LOCK_STALE_MS) {
					details.push(`${entry} is stale (${String(Math.round(age / 1000))}s old)`);
				} else {
					details.push(`${entry} exists (${String(Math.round(age / 1000))}s old, may be active)`);
				}
			} catch {
				details.push(`${entry} exists but cannot stat`);
			}
		}
	} catch {
		// .canopy/ might not be readable
	}
	if (details.length > 0) {
		return {
			name: "stale-locks",
			status: "warn",
			message: `${String(details.length)} lock file(s) found`,
			details,
			fixable: true,
		};
	}
	return {
		name: "stale-locks",
		status: "pass",
		message: "No stale locks",
		details: [],
		fixable: false,
	};
}

// 8. version-sync — compare package.json version against VERSION in index.ts
function checkVersionSync(): DoctorCheck {
	// Read version from the installed package.json (relative to this file)
	const pkgPath = join(import.meta.dir, "../../package.json");
	let pkgVersion: string;
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
		if (!pkg.version) {
			return {
				name: "version-sync",
				status: "warn",
				message: "package.json has no version field",
				details: [],
				fixable: false,
			};
		}
		pkgVersion = pkg.version;
	} catch {
		return {
			name: "version-sync",
			status: "warn",
			message: "package.json not found or unparseable",
			details: [],
			fixable: false,
		};
	}

	// Read VERSION from index.ts source
	const indexPath = join(import.meta.dir, "../index.ts");
	try {
		const src = readFileSync(indexPath, "utf8");
		const match = src.match(/export const VERSION\s*=\s*"([^"]+)"/);
		if (!match) {
			return {
				name: "version-sync",
				status: "warn",
				message: "Could not find VERSION constant in index.ts",
				details: [],
				fixable: false,
			};
		}
		const srcVersion = match[1];
		if (srcVersion !== pkgVersion) {
			return {
				name: "version-sync",
				status: "fail",
				message: `VERSION (${srcVersion}) ≠ package.json (${pkgVersion})`,
				details: [],
				fixable: false,
			};
		}
		return {
			name: "version-sync",
			status: "pass",
			message: `${pkgVersion} matches package.json`,
			details: [],
			fixable: false,
		};
	} catch {
		return {
			name: "version-sync",
			status: "warn",
			message: "Could not read index.ts for VERSION check",
			details: [],
			fixable: false,
		};
	}
}

// Fix logic
function applyFixes(canopyDir: string, checks: DoctorCheck[]): string[] {
	const fixed: string[] = [];
	for (const check of checks) {
		if (check.status === "pass" || !check.fixable) continue;
		switch (check.name) {
			case "stale-locks": {
				try {
					const entries = readdirSync(canopyDir);
					for (const entry of entries) {
						if (!entry.endsWith(".lock")) continue;
						const lockPath = join(canopyDir, entry);
						try {
							const st = statSync(lockPath);
							if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
								unlinkSync(lockPath);
								fixed.push(`Removed stale ${entry}`);
							}
						} catch {
							// best-effort
						}
					}
				} catch {
					// best-effort
				}
				break;
			}
		}
	}
	return fixed;
}

function printCheck(check: DoctorCheck, verbose: boolean): void {
	if (check.status === "pass" && !verbose) return;

	const icon =
		check.status === "pass"
			? palette.brand("✓")
			: check.status === "warn"
				? chalk.yellow("!")
				: chalk.red("✗");

	const padded = check.name + " ".repeat(Math.max(20 - check.name.length, 2));
	console.log(`  ${icon} ${chalk.dim(padded)}${check.message}`);
	for (const detail of check.details) {
		console.log(`      ${chalk.dim(detail)}`);
	}
}

export async function run(fix: boolean, verbose: boolean, json: boolean): Promise<void> {
	const cwd = process.cwd();
	const canopyDir = join(cwd, ".canopy");

	const checks: DoctorCheck[] = [];

	// 1. config
	const configCheck = await checkConfig(canopyDir);
	checks.push(configCheck);

	// If config fails, skip remaining checks
	if (configCheck.status === "fail") {
		return reportResults(checks, json, verbose, fix, canopyDir);
	}

	// 2-3. JSONL integrity
	checks.push(checkPromptsIntegrity(canopyDir));
	checks.push(checkSchemasIntegrity(canopyDir));

	// 4. schema validation
	checks.push(await checkSchemaValidation(canopyDir));

	// 5. inheritance
	checks.push(await checkInheritance(canopyDir));

	// 6. emit staleness
	checks.push(await checkEmitStaleness(canopyDir));

	// 7. stale locks
	checks.push(checkStaleLocks(canopyDir));

	// 8. version sync
	checks.push(checkVersionSync());

	// Apply fixes if requested
	if (fix) {
		const fixableFailures = checks.filter((ch) => ch.fixable && ch.status !== "pass");
		if (fixableFailures.length > 0) {
			const fixedItems = applyFixes(canopyDir, checks);

			// Re-run all checks after fixes
			const reChecks: DoctorCheck[] = [];
			const reConfig = await checkConfig(canopyDir);
			reChecks.push(reConfig);
			if (reConfig.status !== "fail") {
				reChecks.push(checkPromptsIntegrity(canopyDir));
				reChecks.push(checkSchemasIntegrity(canopyDir));
				reChecks.push(await checkSchemaValidation(canopyDir));
				reChecks.push(await checkInheritance(canopyDir));
				reChecks.push(await checkEmitStaleness(canopyDir));
				reChecks.push(checkStaleLocks(canopyDir));
				reChecks.push(checkVersionSync());
			}
			return reportResults(reChecks, json, verbose, fix, canopyDir, fixedItems);
		}
	}

	return reportResults(checks, json, verbose, fix, canopyDir);
}

function reportResults(
	checks: DoctorCheck[],
	jsonMode: boolean,
	verbose: boolean,
	_fix: boolean,
	_canopyDir: string,
	fixedItems?: string[],
): void {
	const summary = {
		pass: checks.filter((ch) => ch.status === "pass").length,
		warn: checks.filter((ch) => ch.status === "warn").length,
		fail: checks.filter((ch) => ch.status === "fail").length,
	};

	if (jsonMode) {
		jsonOut({
			success: summary.fail === 0,
			command: "doctor",
			checks: checks.map((ch) => ({
				name: ch.name,
				status: ch.status,
				message: ch.message,
				details: ch.details,
				fixable: ch.fixable,
			})),
			summary,
			...(fixedItems && fixedItems.length > 0 ? { fixed: fixedItems } : {}),
		});
	} else {
		console.log(`\n${chalk.bold("cn doctor")}\n`);
		for (const check of checks) {
			printCheck(check, verbose);
		}
		console.log(
			`\n  ${chalk.dim(`${String(summary.pass)} passed, ${String(summary.warn)} warning, ${String(summary.fail)} failed`)}`,
		);
		if (fixedItems && fixedItems.length > 0) {
			console.log(`\n${chalk.bold("Fixed:")}`);
			for (const item of fixedItems) {
				console.log(`  ${palette.brand("✓")} ${item}`);
			}
		}
	}

	if (summary.fail > 0) {
		process.exitCode = 1;
	}
}

export function register(program: Command): void {
	program
		.command("doctor")
		.description("Check project health and data integrity")
		.option("--fix", "Fix auto-fixable issues")
		.option("--verbose", "Show all check results including passes")
		.action(async (opts: { fix?: boolean; verbose?: boolean }) => {
			const json: boolean = program.opts().json ?? false;
			await run(opts.fix ?? false, opts.verbose ?? false, json);
		});
}
