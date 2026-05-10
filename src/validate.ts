import { resolvePrompt } from "./render.ts";
import type { Prompt, Schema } from "./types.ts";

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: string[];
}

export interface ValidationError {
	section: string;
	rule: string;
	message: string;
}

export function validatePrompt(
	prompt: Prompt,
	schema: Schema,
	allPrompts: Prompt[],
): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: string[] = [];

	// Resolve full section list (including inherited sections)
	let sections = prompt.sections;
	try {
		const rendered = resolvePrompt(prompt.name, allPrompts);
		sections = rendered.sections;
	} catch {
		// If render fails, validate with own sections only
	}

	const sectionMap = new Map(sections.map((s) => [s.name, s]));

	// Check required sections
	for (const required of schema.requiredSections) {
		if (!sectionMap.has(required)) {
			errors.push({
				section: required,
				rule: "required",
				message: `Required section "${required}" is missing`,
			});
		}
	}

	// Run regex rules
	if (schema.rules) {
		for (const rule of schema.rules) {
			const section = sectionMap.get(rule.section);
			if (!section) {
				// Section doesn't exist — skip regex check (required check handles missing)
				continue;
			}

			try {
				const regex = new RegExp(rule.pattern);
				if (!regex.test(section.body)) {
					errors.push({
						section: rule.section,
						rule: rule.pattern,
						message: rule.message,
					});
				}
			} catch {
				warnings.push(
					`Invalid regex pattern in rule for section "${rule.section}": ${rule.pattern}`,
				);
			}
		}
	}

	// Mulch block / extends_mulch shape validation runs regardless of schema rules.
	errors.push(...validateMulch(prompt));

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

const VALID_MULCH_KEYS = new Set(["prime", "budget", "on_empty"]);
const VALID_PRIME_KEYS = new Set(["domains", "files"]);
const VALID_ON_EMPTY = new Set(["skip", "warn", "error"]);

/**
 * Validate the shape of a prompt's `mulch` block and `extends_mulch` flag.
 * Returns structural errors (unknown keys, wrong types, bad enum values).
 * Does not check semantics like "domains exist in .mulch/mulch.config.yaml" —
 * that lives in the optional doctor check (canopy-552d).
 */
export function validateMulch(prompt: Prompt): ValidationError[] {
	const errors: ValidationError[] = [];

	const extendsMulch = (prompt as { extends_mulch?: unknown }).extends_mulch;
	if (extendsMulch !== undefined && typeof extendsMulch !== "boolean") {
		errors.push({
			section: "extends_mulch",
			rule: "type",
			message: `extends_mulch must be a boolean (got ${describeValue(extendsMulch)})`,
		});
	}

	const mulch = (prompt as { mulch?: unknown }).mulch;
	if (mulch === undefined) return errors;

	if (!isPlainObject(mulch)) {
		errors.push({
			section: "mulch",
			rule: "type",
			message: `mulch must be an object (got ${describeValue(mulch)})`,
		});
		return errors;
	}

	for (const key of Object.keys(mulch)) {
		if (!VALID_MULCH_KEYS.has(key)) {
			errors.push({
				section: "mulch",
				rule: "unknown-key",
				message: `Unknown key "${key}" in mulch block (allowed: prime, budget, on_empty)`,
			});
		}
	}

	if (mulch.budget !== undefined) {
		const b = mulch.budget;
		if (typeof b !== "number" || !Number.isFinite(b) || b < 0) {
			errors.push({
				section: "mulch.budget",
				rule: "type",
				message: `mulch.budget must be a non-negative finite number (got ${describeValue(b)})`,
			});
		}
	}

	if (mulch.on_empty !== undefined) {
		const v = mulch.on_empty;
		if (typeof v !== "string" || !VALID_ON_EMPTY.has(v)) {
			errors.push({
				section: "mulch.on_empty",
				rule: "enum",
				message: `mulch.on_empty must be one of "skip", "warn", "error" (got ${describeValue(v)})`,
			});
		}
	}

	if (mulch.prime !== undefined) {
		const prime = mulch.prime;
		if (!isPlainObject(prime)) {
			errors.push({
				section: "mulch.prime",
				rule: "type",
				message: `mulch.prime must be an object (got ${describeValue(prime)})`,
			});
		} else {
			for (const key of Object.keys(prime)) {
				if (!VALID_PRIME_KEYS.has(key)) {
					errors.push({
						section: "mulch.prime",
						rule: "unknown-key",
						message: `Unknown key "${key}" in mulch.prime (allowed: domains, files)`,
					});
				}
			}
			if (prime.domains !== undefined && !isStringArray(prime.domains)) {
				errors.push({
					section: "mulch.prime.domains",
					rule: "type",
					message: `mulch.prime.domains must be an array of strings (got ${describeValue(prime.domains)})`,
				});
			}
			if (prime.files !== undefined && !isStringArray(prime.files)) {
				errors.push({
					section: "mulch.prime.files",
					rule: "type",
					message: `mulch.prime.files must be an array of strings (got ${describeValue(prime.files)})`,
				});
			}
		}
	}

	return errors;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function describeValue(v: unknown): string {
	if (v === null) return "null";
	if (Array.isArray(v)) return "array";
	if (typeof v === "string") return `string "${v}"`;
	return typeof v;
}
