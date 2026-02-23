/**
 * Minimal YAML parser for flat key-value config files.
 * Handles: string values, quoted strings, numbers as strings.
 * Does NOT handle: nested objects, arrays, multiline values.
 */
export function parseYaml(text: string): Record<string, string> {
	const result: Record<string, string> = {};

	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();

		// Skip comments and empty lines
		if (!line || line.startsWith("#")) continue;

		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim();
		let value = line.slice(colonIdx + 1).trim();

		if (!key) continue;

		// Strip inline comments (not inside quotes)
		if (!value.startsWith('"') && !value.startsWith("'")) {
			const commentIdx = value.indexOf(" #");
			if (commentIdx !== -1) {
				value = value.slice(0, commentIdx).trim();
			}
		}

		// Handle double-quoted strings
		if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
			value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
		}
		// Handle single-quoted strings
		else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
			value = value.slice(1, -1).replace(/\\''/g, "'");
		}

		result[key] = value;
	}

	return result;
}

export function serializeYaml(obj: Record<string, string>): string {
	const lines: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		// Quote values that contain special chars or look ambiguous
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
			lines.push(`${key}: "${escaped}"`);
		} else {
			lines.push(`${key}: ${value}`);
		}
	}

	return `${lines.join("\n")}\n`;
}
