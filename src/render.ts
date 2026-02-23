import type { Prompt, Section } from "./types.ts";
import { MAX_INHERIT_DEPTH } from "./types.ts";

export interface RenderResult {
	sections: Section[];
	resolvedFrom: string[];
	version: number;
}

/**
 * Resolve a prompt's full section list by walking the inheritance chain.
 * Parent sections first, child overrides/appends on top.
 * Empty body = section removal.
 */
export function resolvePrompt(name: string, prompts: Prompt[], version?: number): RenderResult {
	const visited: string[] = [];
	return resolveInner(name, prompts, version, visited);
}

function resolveInner(
	name: string,
	prompts: Prompt[],
	version: number | undefined,
	visited: string[],
): RenderResult {
	if (visited.includes(name)) {
		throw new Error(`Circular inheritance: ${[...visited, name].join(" → ")}`);
	}
	if (visited.length >= MAX_INHERIT_DEPTH) {
		throw new Error(
			`Inheritance depth limit (${MAX_INHERIT_DEPTH}) exceeded at "${name}". Chain: ${visited.join(" → ")}`,
		);
	}

	// Find the prompt
	const prompt = findPrompt(prompts, name, version);
	if (!prompt) {
		const versionStr = version !== undefined ? `@${version}` : "";
		throw new Error(`Prompt "${name}${versionStr}" not found`);
	}

	visited.push(name);

	// No parent — return own sections (excluding empty-body removals)
	if (!prompt.extends) {
		const sections = prompt.sections.filter((s) => s.body !== "");
		return {
			sections,
			resolvedFrom: [name],
			version: prompt.version,
		};
	}

	// Resolve parent first
	const parentResult = resolveInner(prompt.extends, prompts, undefined, visited);

	// Merge: parent sections first, child overrides/appends
	const merged = mergeSections(parentResult.sections, prompt.sections);

	return {
		sections: merged,
		resolvedFrom: [...parentResult.resolvedFrom, name],
		version: prompt.version,
	};
}

function findPrompt(prompts: Prompt[], name: string, version?: number): Prompt | undefined {
	if (version !== undefined) {
		return prompts.find((p) => p.name === name && p.version === version);
	}
	// Get latest version for this name
	const candidates = prompts.filter((p) => p.name === name);
	if (candidates.length === 0) return undefined;
	return candidates.reduce((best, p) => (p.version > best.version ? p : best));
}

function mergeSections(parentSections: Section[], childSections: Section[]): Section[] {
	// Start with parent sections
	const result: Section[] = [...parentSections];

	for (const childSection of childSections) {
		const parentIdx = result.findIndex((s) => s.name === childSection.name);

		if (childSection.body === "") {
			// Empty body = remove the section
			if (parentIdx !== -1) {
				result.splice(parentIdx, 1);
			}
			continue;
		}

		if (parentIdx !== -1) {
			// Override parent section
			result[parentIdx] = childSection;
		} else {
			// Append new section
			result.push(childSection);
		}
	}

	return result;
}
