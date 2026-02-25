/**
 * Minimal YAML parser for flat key-value config files with one-level nested map support.
 * Handles: string values, quoted strings, numbers as strings, one-level nested maps.
 * Does NOT handle: deeply nested objects, arrays, multiline values.
 */

type YamlValue = string | Record<string, string>;

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

export function parseYaml(text: string): Record<string, YamlValue> {
	const result: Record<string, YamlValue> = {};
	const lines = text.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const rawLine = lines[i] ?? "";
		const line = rawLine.trim();

		// Skip comments and empty lines
		if (!line || line.startsWith("#")) continue;

		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim();
		let value = line.slice(colonIdx + 1).trim();

		if (!key) continue;

		// Check if this is a nested map (empty value followed by indented children)
		if (!value || value.startsWith("#")) {
			// Look ahead for indented children
			const children: Record<string, string> = {};
			let hasChildren = false;
			while (i + 1 < lines.length) {
				const nextRaw = lines[i + 1] ?? "";
				// Must be indented with 2 spaces (not a top-level key)
				if (
					!nextRaw.startsWith("  ") ||
					(nextRaw.startsWith("   ") === false && nextRaw.match(/^[^ ]/))
				)
					break;
				// Check for 2-space indent specifically
				if (nextRaw.length > 0 && nextRaw[0] === " " && !nextRaw.startsWith("  ")) break;
				if (!nextRaw.startsWith("  ")) break;
				const childLine = nextRaw.trim();
				if (!childLine || childLine.startsWith("#")) {
					i++;
					continue;
				}
				// If not indented (starts at column 0), stop
				if (nextRaw[0] !== " ") break;
				const childColon = childLine.indexOf(":");
				if (childColon === -1) break;
				const childKey = childLine.slice(0, childColon).trim();
				let childValue = childLine.slice(childColon + 1).trim();
				if (!childKey) break;
				childValue = stripInlineComment(childValue);
				childValue = unquote(childValue);
				children[childKey] = childValue;
				hasChildren = true;
				i++;
			}
			if (hasChildren) {
				result[key] = children;
			} else {
				// Empty value, store as empty string
				result[key] = "";
			}
			continue;
		}

		value = stripInlineComment(value);
		value = unquote(value);

		result[key] = value;
	}

	return result;
}

export function serializeYaml(obj: Record<string, YamlValue>): string {
	const lines: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === "object") {
			lines.push(`${key}:`);
			for (const [childKey, childValue] of Object.entries(value)) {
				lines.push(`  ${childKey}: ${maybeQuote(childValue)}`);
			}
		} else {
			lines.push(`${key}: ${maybeQuote(value)}`);
		}
	}

	return `${lines.join("\n")}\n`;
}
