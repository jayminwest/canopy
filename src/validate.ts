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

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}
