/**
 * Minimal YAML parser for config files with multi-level nesting and array support.
 * Handles: string values, quoted strings, numbers as strings, nested maps, arrays.
 * Does NOT handle: multiline values, flow syntax ({}/[]), anchors/aliases.
 */

export interface YamlMap {
	[key: string]: YamlValue;
}
export type YamlValue = string | string[] | YamlMap;

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
