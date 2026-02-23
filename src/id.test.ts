import { describe, expect, it } from "bun:test";
import { generateId } from "./id.ts";

describe("generateId", () => {
	it("generates id with prefix", () => {
		const id = generateId("overstory", []);
		expect(id).toMatch(/^overstory-[0-9a-f]{4}$/);
	});

	it("generates id with schema prefix", () => {
		const id = generateId("schema", []);
		expect(id).toMatch(/^schema-[0-9a-f]{4}$/);
	});

	it("avoids collision with existing ids", () => {
		// Pre-fill all possible 4-hex values for a specific prefix pattern
		const existing: string[] = [];
		for (let i = 0; i <= 0xffff; i++) {
			const hex = i.toString(16).padStart(4, "0");
			existing.push(`test-${hex}`);
		}

		// After 100 collisions, should fall back to 8 hex chars
		const id = generateId("test", existing);
		expect(id).toMatch(/^test-[0-9a-f]{8}$/);
	});

	it("generates unique ids across multiple calls", () => {
		const ids: string[] = [];
		for (let i = 0; i < 20; i++) {
			const id = generateId("proj", ids);
			expect(ids).not.toContain(id);
			ids.push(id);
		}
		expect(new Set(ids).size).toBe(20);
	});
});
