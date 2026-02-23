import { describe, expect, it } from "bun:test";
import { resolvePrompt } from "./render.ts";
import type { Prompt } from "./types.ts";

function makePrompt(overrides: Partial<Prompt> & { id: string; name: string }): Prompt {
	return {
		version: 1,
		sections: [],
		status: "active",
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

describe("resolvePrompt", () => {
	it("returns own sections when no parent", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [
					{ name: "role", body: "You are an agent." },
					{ name: "constraints", body: "No push." },
				],
			}),
		];

		const result = resolvePrompt("base", prompts);
		expect(result.sections).toHaveLength(2);
		expect(result.sections[0]?.name).toBe("role");
		expect(result.resolvedFrom).toEqual(["base"]);
	});

	it("inherits parent sections", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [
					{ name: "role", body: "Base role" },
					{ name: "constraints", body: "Base constraints" },
				],
			}),
			makePrompt({
				id: "p-0002",
				name: "child",
				extends: "base",
				sections: [{ name: "quality-gates", body: "Run tests" }],
			}),
		];

		const result = resolvePrompt("child", prompts);
		expect(result.sections).toHaveLength(3);
		expect(result.sections[0]?.name).toBe("role");
		expect(result.sections[1]?.name).toBe("constraints");
		expect(result.sections[2]?.name).toBe("quality-gates");
		expect(result.resolvedFrom).toEqual(["base", "child"]);
	});

	it("child overrides parent sections", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [{ name: "role", body: "Base role" }],
			}),
			makePrompt({
				id: "p-0002",
				name: "child",
				extends: "base",
				sections: [{ name: "role", body: "Child role" }],
			}),
		];

		const result = resolvePrompt("child", prompts);
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]?.body).toBe("Child role");
	});

	it("empty body removes inherited section", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [
					{ name: "role", body: "Base role" },
					{ name: "quality-gates", body: "Run tests" },
				],
			}),
			makePrompt({
				id: "p-0002",
				name: "child",
				extends: "base",
				sections: [{ name: "quality-gates", body: "" }],
			}),
		];

		const result = resolvePrompt("child", prompts);
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]?.name).toBe("role");
	});

	it("detects circular inheritance", () => {
		const prompts: Prompt[] = [
			makePrompt({ id: "p-0001", name: "a", extends: "b", sections: [] }),
			makePrompt({ id: "p-0002", name: "b", extends: "a", sections: [] }),
		];

		expect(() => resolvePrompt("a", prompts)).toThrow(/Circular inheritance/);
	});

	it("enforces depth limit", () => {
		const prompts: Prompt[] = [];
		for (let i = 0; i <= 6; i++) {
			prompts.push(
				makePrompt({
					id: `p-${i.toString().padStart(4, "0")}`,
					name: `level-${i}`,
					extends: i > 0 ? `level-${i - 1}` : undefined,
					sections: [],
				}),
			);
		}

		expect(() => resolvePrompt("level-6", prompts)).toThrow(/depth limit/i);
	});

	it("resolves specific version", () => {
		const prompts: Prompt[] = [
			makePrompt({
				id: "p-0001",
				name: "base",
				version: 1,
				sections: [{ name: "role", body: "v1 role" }],
			}),
			makePrompt({
				id: "p-0001",
				name: "base",
				version: 2,
				sections: [{ name: "role", body: "v2 role" }],
			}),
		];

		const result = resolvePrompt("base", prompts, 1);
		expect(result.sections[0]?.body).toBe("v1 role");
		expect(result.version).toBe(1);
	});

	it("throws for missing prompt", () => {
		expect(() => resolvePrompt("nonexistent", [])).toThrow(/not found/);
	});
});
