import { randomBytes } from "node:crypto";

export function generateId(prefix: string, existingIds: string[]): string {
	const existingSet = new Set(existingIds);

	for (let attempt = 0; attempt < 100; attempt++) {
		const hex = randomBytes(2).toString("hex");
		const id = `${prefix}-${hex}`;
		if (!existingSet.has(id)) {
			return id;
		}
	}

	// Fallback to 8 hex chars after 100 collisions
	for (let attempt = 0; attempt < 1000; attempt++) {
		const hex = randomBytes(4).toString("hex");
		const id = `${prefix}-${hex}`;
		if (!existingSet.has(id)) {
			return id;
		}
	}

	throw new Error(`Failed to generate unique ID with prefix "${prefix}"`);
}
