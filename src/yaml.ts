/**
 * Minimal YAML parser for config files with multi-level nesting and array support.
 * Handles: string values, quoted strings, numbers as strings, nested maps, arrays.
 * Does NOT handle: multiline values, flow syntax ({}/[]), anchors/aliases.
 */

export interface YamlMap {
	[key: string]: YamlValue;
}
export type YamlValue = string | string[] | YamlMap;

// Broader scalar/flow value type for parseScalarOrFlow: covers the values a
// user can pass on the command line (cn config set <path> <value>). Kept
// alongside YamlMap/YamlValue rather than replacing them so existing
// parseYaml/serializeYaml callers (config.yaml round-trips) remain unchanged.
export type YamlScalar =
	| string
	| number
	| boolean
	| null
	| YamlScalar[]
	| { [key: string]: YamlScalar };

function maybeQuote(value: string): string {
	const needsQuotes =
		value.includes(":") ||
		value.includes("#") ||
		value.includes('"') ||
		value.includes("'") ||
		value.includes("\n") ||
		value.startsWith(" ") ||
		value.endsWith(" ");

	if (needsQuotes) {
		const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
		return `"${escaped}"`;
	}
	return value;
}

function unquote(value: string): string {
	// Handle double-quoted strings
	if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
		return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
	}
	// Handle single-quoted strings
	if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
		return value.slice(1, -1).replace(/\\''/g, "'");
	}
	return value;
}

function stripInlineComment(value: string): string {
	if (!value.startsWith('"') && !value.startsWith("'")) {
		const commentIdx = value.indexOf(" #");
		if (commentIdx !== -1) {
			return value.slice(0, commentIdx).trim();
		}
	}
	return value;
}

function getIndent(line: string): number {
	return line.length - line.trimStart().length;
}

function parseBlock(lines: string[], startIdx: number, baseIndent: number): [YamlMap, number] {
	const result: YamlMap = {};
	let i = startIdx;

	while (i < lines.length) {
		const rawLine = lines[i] ?? "";
		const trimmed = rawLine.trim();

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith("#")) {
			i++;
			continue;
		}

		const indent = getIndent(rawLine);

		// Dedented — end of this block
		if (indent < baseIndent) break;

		// Array item at this indent — shouldn't happen at map level
		if (trimmed.startsWith("- ")) break;

		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) {
			i++;
			continue;
		}

		const key = trimmed.slice(0, colonIdx).trim();
		const valuePart = trimmed.slice(colonIdx + 1).trim();

		if (!key) {
			i++;
			continue;
		}

		// Key has an inline value
		if (valuePart && !valuePart.startsWith("#")) {
			result[key] = unquote(stripInlineComment(valuePart));
			i++;
			continue;
		}

		// No inline value — look for children
		i++;
		if (i < lines.length) {
			// Find the next non-empty, non-comment line
			let peekIdx = i;
			while (peekIdx < lines.length) {
				const peekTrimmed = (lines[peekIdx] ?? "").trim();
				if (peekTrimmed && !peekTrimmed.startsWith("#")) break;
				peekIdx++;
			}

			if (peekIdx < lines.length) {
				const nextRaw = lines[peekIdx] ?? "";
				const nextIndent = getIndent(nextRaw);
				const nextTrimmed = nextRaw.trim();

				if (nextIndent > baseIndent) {
					if (nextTrimmed.startsWith("- ")) {
						// Array children
						const [arr, newIdx] = parseArray(lines, peekIdx, nextIndent);
						result[key] = arr;
						i = newIdx;
					} else {
						// Nested map children
						const [map, newIdx] = parseBlock(lines, peekIdx, nextIndent);
						result[key] = map;
						i = newIdx;
					}
				} else {
					// No children — empty value
					result[key] = "";
				}
			} else {
				result[key] = "";
			}
		} else {
			result[key] = "";
		}
	}

	return [result, i];
}

function parseArray(lines: string[], startIdx: number, baseIndent: number): [string[], number] {
	const result: string[] = [];
	let i = startIdx;

	while (i < lines.length) {
		const rawLine = lines[i] ?? "";
		const trimmed = rawLine.trim();

		if (!trimmed || trimmed.startsWith("#")) {
			i++;
			continue;
		}

		const indent = getIndent(rawLine);
		if (indent < baseIndent) break;

		if (trimmed.startsWith("- ")) {
			result.push(unquote(stripInlineComment(trimmed.slice(2).trim())));
			i++;
		} else {
			break;
		}
	}

	return [result, i];
}

export function parseYaml(text: string): YamlMap {
	const lines = text.split("\n");
	const [result] = parseBlock(lines, 0, 0);
	return result;
}

function serializeValue(key: string, value: YamlValue, indent: number): string[] {
	const prefix = "\t".repeat(0) + " ".repeat(indent);

	if (typeof value === "string") {
		return [`${prefix}${key}: ${maybeQuote(value)}`];
	}

	if (Array.isArray(value)) {
		const lines = [`${prefix}${key}:`];
		for (const item of value) {
			lines.push(`${prefix}  - ${maybeQuote(item)}`);
		}
		return lines;
	}

	// Nested map
	const lines = [`${prefix}${key}:`];
	for (const [childKey, childValue] of Object.entries(value)) {
		lines.push(...serializeValue(childKey, childValue, indent + 2));
	}
	return lines;
}

export function serializeYaml(obj: YamlMap): string {
	const lines: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		lines.push(...serializeValue(key, value, 0));
	}

	return `${lines.join("\n")}\n`;
}

// Parse a single scalar or flow-style value. Used by `cn config set` to turn a
// CLI argument into a typed JSON value before schema-validating the write.
// Supports: quoted strings, booleans, null/~, integers, floats, flow sequences
// [a, b, c], and flow mappings { k: v, k2: v2 }. Bare strings pass through.
export function parseScalarOrFlow(s: string): YamlScalar {
	if (s.startsWith("[")) return parseFlowSeq(s);
	if (s.startsWith("{")) return parseFlowMap(s);
	if (s.startsWith('"') || s.startsWith("'")) return unquoteScalar(s);
	if (s === "true") return true;
	if (s === "false") return false;
	if (s === "null" || s === "~" || s === "") return null;
	if (/^-?\d+$/.test(s)) return Number(s);
	if (/^-?\d+\.\d+$/.test(s)) return Number(s);
	return s;
}

function unquoteScalar(s: string): string {
	if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
		try {
			return JSON.parse(s) as string;
		} catch {
			return s.slice(1, -1);
		}
	}
	if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
		return s.slice(1, -1).replace(/''/g, "'");
	}
	return s;
}

function parseFlowSeq(s: string): YamlScalar[] {
	if (!s.endsWith("]")) throw new Error(`Unclosed flow sequence: ${s}`);
	const inner = s.slice(1, -1).trim();
	if (inner === "") return [];
	return splitFlow(inner).map((p) => parseScalarOrFlow(p.trim()));
}

function parseFlowMap(s: string): { [key: string]: YamlScalar } {
	if (!s.endsWith("}")) throw new Error(`Unclosed flow mapping: ${s}`);
	const inner = s.slice(1, -1).trim();
	const out: { [key: string]: YamlScalar } = {};
	if (inner === "") return out;
	for (const part of splitFlow(inner)) {
		const t = part.trim();
		const colonIdx = findFlowKeyColon(t);
		if (colonIdx === -1) throw new Error(`Flow map entry missing ':': ${t}`);
		const k = unquoteScalar(t.slice(0, colonIdx).trim());
		const v = t.slice(colonIdx + 1).trim();
		out[k] = parseScalarOrFlow(v);
	}
	return out;
}

function findFlowKeyColon(text: string): number {
	let inSingle = false;
	let inDouble = false;
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (!inDouble && c === "'") inSingle = !inSingle;
		else if (!inSingle && c === '"') inDouble = !inDouble;
		else if (!inSingle && !inDouble && (c === "{" || c === "[")) depth++;
		else if (!inSingle && !inDouble && (c === "}" || c === "]")) depth--;
		else if (!inSingle && !inDouble && depth === 0 && c === ":") {
			const next = text[i + 1];
			if (next === undefined || next === " " || next === "\t") return i;
		}
	}
	return -1;
}

function splitFlow(s: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let inSingle = false;
	let inDouble = false;
	let start = 0;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (!inDouble && c === "'") inSingle = !inSingle;
		else if (!inSingle && c === '"') inDouble = !inDouble;
		else if (!inSingle && !inDouble && (c === "[" || c === "{")) depth++;
		else if (!inSingle && !inDouble && (c === "]" || c === "}")) depth--;
		else if (!inSingle && !inDouble && depth === 0 && c === ",") {
			parts.push(s.slice(start, i));
			start = i + 1;
		}
	}
	if (start <= s.length) parts.push(s.slice(start));
	return parts;
}
