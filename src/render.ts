import type { MulchBlock, Prompt, Section } from "./types.ts";
import { MAX_INHERIT_DEPTH } from "./types.ts";

export interface RenderResult {
	sections: Section[];
	frontmatter: Record<string, unknown>;
	resolvedFrom: string[];
	version: number;
	mulch?: MulchBlock;
}

/**
 * Resolve a prompt's full section list by walking the inheritance chain
 * and applying mixins. Resolution order:
 * 1. Resolve extends chain (parent first)
 * 2. For each mixin (left-to-right), resolve it fully
 * 3. Merge: base → mixin₁ → mixin₂ → … → focal prompt
 * Later entries override earlier on section name conflicts.
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

	// No parent and no mixins — return own sections (excluding empty-body removals)
	if (!prompt.extends && (!prompt.mixins || prompt.mixins.length === 0)) {
		const sections = prompt.sections.filter((s) => s.body !== "");
		return withMulch(
			{
				sections,
				frontmatter: prompt.frontmatter ?? {},
				resolvedFrom: [name],
				version: prompt.version,
			},
			prompt.mulch,
		);
	}

	// Start with parent chain if exists
	let baseSections: Section[] = [];
	let baseFrontmatter: Record<string, unknown> = {};
	let baseResolvedFrom: string[] = [];
	let baseMulch: MulchBlock | undefined;
	const mixinMulches: (MulchBlock | undefined)[] = [];

	if (prompt.extends) {
		const parentResult = resolveInner(prompt.extends, prompts, undefined, visited);
		baseSections = parentResult.sections;
		baseFrontmatter = parentResult.frontmatter;
		baseResolvedFrom = parentResult.resolvedFrom;
		baseMulch = parentResult.mulch;
	}

	// Apply each mixin left-to-right on top of the base
	if (prompt.mixins && prompt.mixins.length > 0) {
		for (const mixinName of prompt.mixins) {
			// Each mixin resolves with its own visited-branch to allow
			// the same ancestor to appear via extends AND a mixin (diamond).
			// But we must still detect cycles involving the focal prompt.
			const mixinVisited = [...visited];
			const mixinResult = resolveInner(mixinName, prompts, undefined, mixinVisited);
			baseSections = mergeSections(baseSections, mixinResult.sections);
			baseFrontmatter = { ...baseFrontmatter, ...mixinResult.frontmatter };
			baseResolvedFrom = [...baseResolvedFrom, ...mixinResult.resolvedFrom];
			mixinMulches.push(mixinResult.mulch);
		}
	}

	// Finally apply the focal prompt's own sections on top
	const merged = mergeSections(baseSections, prompt.sections);

	// Resolve mulch with override-vs-merge semantics gated by extends_mulch.
	// extends_mulch=true: union parent + each mixin's resolved mulch + focal.mulch
	//   (domains/files unioned, budget/on_empty last-wins).
	// extends_mulch=false (default): focal.mulch wholesale overrides — no inheritance,
	//   not even from mixins. If focal has no mulch block, result is undefined.
	let resolvedMulch: MulchBlock | undefined;
	if (prompt.extends_mulch) {
		resolvedMulch = baseMulch;
		for (const m of mixinMulches) {
			resolvedMulch = mergeMulch(resolvedMulch, m);
		}
		resolvedMulch = mergeMulch(resolvedMulch, prompt.mulch);
	} else {
		resolvedMulch = prompt.mulch;
	}

	return withMulch(
		{
			sections: merged,
			frontmatter: { ...baseFrontmatter, ...(prompt.frontmatter ?? {}) },
			resolvedFrom: [...baseResolvedFrom, name],
			version: prompt.version,
		},
		resolvedMulch,
	);
}

function withMulch(result: RenderResult, mulch: MulchBlock | undefined): RenderResult {
	if (mulch === undefined) return result;
	return { ...result, mulch };
}

function mergeMulch(
	base: MulchBlock | undefined,
	overlay: MulchBlock | undefined,
): MulchBlock | undefined {
	if (base === undefined) return overlay;
	if (overlay === undefined) return base;

	const merged: MulchBlock = {};

	const baseDomains = base.prime?.domains;
	const overlayDomains = overlay.prime?.domains;
	const baseFiles = base.prime?.files;
	const overlayFiles = overlay.prime?.files;
	const domains =
		baseDomains || overlayDomains ? unionPreserveOrder(baseDomains, overlayDomains) : undefined;
	const files = baseFiles || overlayFiles ? unionPreserveOrder(baseFiles, overlayFiles) : undefined;
	if (domains !== undefined || files !== undefined) {
		merged.prime = {};
		if (domains !== undefined) merged.prime.domains = domains;
		if (files !== undefined) merged.prime.files = files;
	}

	const budget = overlay.budget !== undefined ? overlay.budget : base.budget;
	if (budget !== undefined) merged.budget = budget;

	const on_empty = overlay.on_empty !== undefined ? overlay.on_empty : base.on_empty;
	if (on_empty !== undefined) merged.on_empty = on_empty;

	return merged;
}

function unionPreserveOrder(a: string[] | undefined, b: string[] | undefined): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of a ?? []) {
		if (!seen.has(item)) {
			seen.add(item);
			out.push(item);
		}
	}
	for (const item of b ?? []) {
		if (!seen.has(item)) {
			seen.add(item);
			out.push(item);
		}
	}
	return out;
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
