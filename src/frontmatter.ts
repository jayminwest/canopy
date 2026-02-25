/**
 * YAML frontmatter parser and serializer.
 * Handles arrays, nested objects, booleans, numbers, and quoted strings.
 * Does NOT handle flow syntax ([a,b], {a:b}), multi-line scalars, anchors, or tags.
 */

type FmValue = string | number | boolean | FmValue[] | FmObj;
type FmObj = { [key: string]: FmValue };

// --- Helpers ---

function getIndent(line: string): number {
	let i = 0;
	while (i < line.length && line[i] === " ") i++;
	return i;
}

function unquoteStr(s: string): string {
	if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
		return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
	}
	if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
		return s.slice(1, -1).replace(/''/g, "'");
	}
	return s;
}

function stripInlineComment(s: string): string {
	if (s.startsWith('"') || s.startsWith("'")) return s;
	const idx = s.indexOf(" #");
	return idx !== -1 ? s.slice(0, idx).trim() : s;
}

function parseScalar(raw: string): string | number | boolean {
	raw = stripInlineComment(raw).trim();
	if (
		(raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
		(raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
	) {
		return unquoteStr(raw);
	}
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
	return raw;
}

// --- Parser ---

function parseMappingBlock(
	lines: string[],
	start: number,
	indent: number,
): { value: FmObj; next: number } {
	const result: FmObj = {};
	let i = start;

	while (i < lines.length) {
		const rawLine = lines[i] ?? "";
		const trimmed = rawLine.trim();

		if (!trimmed || trimmed.startsWith("#")) {
			i++;
			continue;
		}

		const lineIndent = getIndent(rawLine);
		if (lineIndent < indent) break;
		if (lineIndent > indent) {
			i++;
			continue;
		}

		// Sequence item at this indent — we're leaving mapping territory
		if (trimmed.startsWith("- ") || trimmed === "-") break;

		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) {
			i++;
			continue;
		}

		const key = trimmed.slice(0, colonIdx).trim();
		const rest = trimmed.slice(colonIdx + 1).trim();
		i++;

		if (rest && !rest.startsWith("#")) {
			result[key] = parseScalar(rest);
		} else {
			// Empty value — peek ahead to determine child type
			let peek = i;
			while (peek < lines.length && !lines[peek]?.trim()) peek++;

			if (peek >= lines.length) {
				result[key] = "";
				continue;
			}

			const nextLine = lines[peek] ?? "";
			const nextIndent = getIndent(nextLine);
			const nextTrimmed = nextLine.trim();

			if (nextIndent <= indent) {
				result[key] = "";
			} else if (nextTrimmed.startsWith("- ") || nextTrimmed === "-") {
				const { value, next } = parseSequenceBlock(lines, i, nextIndent);
				result[key] = value;
				i = next;
			} else {
				const { value, next } = parseMappingBlock(lines, i, nextIndent);
				result[key] = value;
				i = next;
			}
		}
	}

	return { value: result, next: i };
}

function parseSequenceBlock(
	lines: string[],
	start: number,
	indent: number,
): { value: FmValue[]; next: number } {
	const items: FmValue[] = [];
	let i = start;

	while (i < lines.length) {
		const rawLine = lines[i] ?? "";
		const trimmed = rawLine.trim();

		if (!trimmed || trimmed.startsWith("#")) {
			i++;
			continue;
		}

		const lineIndent = getIndent(rawLine);
		if (lineIndent < indent) break;
		if (lineIndent > indent) {
			i++;
			continue;
		}

		if (!trimmed.startsWith("- ") && trimmed !== "-") break;

		const itemContent = trimmed.startsWith("- ") ? trimmed.slice(2).trim() : "";
		i++;

		if (!itemContent) {
			// Empty item — check for indented mapping children
			let peek = i;
			while (peek < lines.length && !lines[peek]?.trim()) peek++;
			if (peek < lines.length && getIndent(lines[peek] ?? "") > indent) {
				const childIndent = getIndent(lines[peek] ?? "");
				const { value, next } = parseMappingBlock(lines, i, childIndent);
				items.push(value);
				i = next;
			} else {
				items.push("");
			}
			continue;
		}

		const colonIdx = itemContent.indexOf(":");
		if (colonIdx !== -1 && !itemContent.startsWith('"') && !itemContent.startsWith("'")) {
			// Mapping item: "- key: value" with optional continuation fields
			const key = itemContent.slice(0, colonIdx).trim();
			const valStr = itemContent.slice(colonIdx + 1).trim();
			const obj: FmObj = { [key]: valStr ? parseScalar(valStr) : "" };

			// Continuation fields at indent + 2 (same as the content after "- ")
			const contIndent = indent + 2;
			while (i < lines.length) {
				const nextRaw = lines[i] ?? "";
				const nextTrimmed = nextRaw.trim();

				if (!nextTrimmed || nextTrimmed.startsWith("#")) {
					i++;
					continue;
				}

				const nextIndent = getIndent(nextRaw);
				if (nextIndent !== contIndent) break;
				if (nextTrimmed.startsWith("- ")) break;

				const fieldColon = nextTrimmed.indexOf(":");
				if (fieldColon === -1) break;

				const fieldKey = nextTrimmed.slice(0, fieldColon).trim();
				const fieldRest = nextTrimmed.slice(fieldColon + 1).trim();
				obj[fieldKey] = fieldRest ? parseScalar(fieldRest) : "";
				i++;
			}

			items.push(obj);
		} else {
			items.push(parseScalar(itemContent));
		}
	}

	return { value: items, next: i };
}

// --- Serializer ---

function needsQuoting(s: string): boolean {
	// Ambiguous scalars that would be misinterpreted without quotes
	if (s === "true" || s === "false" || s === "null" || s === "~") return true;
	if (/^-?\d+(\.\d+)?$/.test(s)) return true;
	return (
		s.includes(":") ||
		s.includes("#") ||
		s.includes('"') ||
		s.includes("'") ||
		s.includes("\n") ||
		s.startsWith(" ") ||
		s.endsWith(" ")
	);
}

function maybeQuote(s: string): string {
	if (needsQuoting(s)) {
		return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
	}
	return s;
}

function serializeScalar(val: unknown): string {
	if (typeof val === "boolean" || typeof val === "number") return String(val);
	if (typeof val === "string") return maybeQuote(val);
	return String(val ?? "");
}

function serializeValue(key: string, val: unknown, indent: number): string[] {
	const pad = " ".repeat(indent);

	if (val === null || val === undefined) {
		return [`${pad}${key}:`];
	}

	if (typeof val === "boolean" || typeof val === "number") {
		return [`${pad}${key}: ${val}`];
	}

	if (typeof val === "string") {
		return [`${pad}${key}: ${maybeQuote(val)}`];
	}

	if (Array.isArray(val)) {
		const lines: string[] = [`${pad}${key}:`];
		for (const item of val) {
			if (item !== null && typeof item === "object" && !Array.isArray(item)) {
				const entries = Object.entries(item as Record<string, unknown>);
				if (entries.length === 0) {
					lines.push(`${pad}  -`);
				} else {
					for (let j = 0; j < entries.length; j++) {
						const entry = entries[j];
						if (!entry) continue;
						const [k, v] = entry;
						if (j === 0) {
							lines.push(`${pad}  - ${k}: ${serializeScalar(v)}`);
						} else {
							lines.push(`${pad}    ${k}: ${serializeScalar(v)}`);
						}
					}
				}
			} else {
				lines.push(`${pad}  - ${serializeScalar(item)}`);
			}
		}
		return lines;
	}

	if (typeof val === "object") {
		const lines: string[] = [`${pad}${key}:`];
		for (const [childKey, childVal] of Object.entries(val as Record<string, unknown>)) {
			lines.push(...serializeValue(childKey, childVal, indent + 2));
		}
		return lines;
	}

	return [`${pad}${key}: ${String(val)}`];
}

// --- Public API ---

/**
 * Extract YAML frontmatter from markdown content.
 * Returns parsed metadata + remaining body.
 */
export function extractFrontmatter(content: string): {
	metadata: Record<string, unknown>;
	body: string;
} {
	if (!content.startsWith("---")) {
		return { metadata: {}, body: content };
	}

	// The opening --- must be the entire first line
	const firstNewline = content.indexOf("\n");
	if (firstNewline === -1) {
		return { metadata: {}, body: content };
	}
	if (content.slice(0, firstNewline).trim() !== "---") {
		return { metadata: {}, body: content };
	}

	const afterFirst = content.slice(firstNewline + 1);
	const lines = afterFirst.split("\n");

	// Find the closing ---
	let closingIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if ((lines[i] ?? "").trim() === "---") {
			closingIdx = i;
			break;
		}
	}

	if (closingIdx === -1) {
		// No closing ---, treat as no frontmatter
		return { metadata: {}, body: content };
	}

	const yamlLines = lines.slice(0, closingIdx);
	const bodyLines = lines.slice(closingIdx + 1);
	const body = bodyLines.join("\n");

	const { value: metadata } = parseMappingBlock(yamlLines, 0, 0);
	return { metadata, body };
}

/**
 * Serialize a metadata object to a YAML frontmatter block (with --- delimiters).
 * Returns empty string if metadata is empty.
 */
export function renderFrontmatter(metadata: Record<string, unknown>): string {
	if (Object.keys(metadata).length === 0) return "";

	const lines: string[] = ["---"];
	for (const [key, val] of Object.entries(metadata)) {
		lines.push(...serializeValue(key, val, 0));
	}
	lines.push("---");

	return `${lines.join("\n")}\n`;
}
