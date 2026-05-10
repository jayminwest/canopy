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

	describe("mixins", () => {
		it("applies mixin sections on top of own sections", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait-a",
					sections: [{ name: "caution", body: "Be careful." }],
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					mixins: ["trait-a"],
					sections: [{ name: "role", body: "Child role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(2);
			expect(result.sections[0]?.name).toBe("caution");
			expect(result.sections[1]?.name).toBe("role");
			expect(result.resolvedFrom).toEqual(["trait-a", "child"]);
		});

		it("later mixin overrides earlier mixin sections", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait-a",
					sections: [{ name: "style", body: "Verbose" }],
				}),
				makePrompt({
					id: "p-0002",
					name: "trait-b",
					sections: [{ name: "style", body: "Concise" }],
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					mixins: ["trait-a", "trait-b"],
					sections: [{ name: "role", body: "Child role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(2);
			expect(result.sections[0]?.body).toBe("Concise");
			expect(result.sections[1]?.name).toBe("role");
		});

		it("focal prompt overrides mixin sections", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait-a",
					sections: [{ name: "role", body: "Trait role" }],
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					mixins: ["trait-a"],
					sections: [{ name: "role", body: "My role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(1);
			expect(result.sections[0]?.body).toBe("My role");
		});

		it("combines extends and mixins (extends first, then mixins, then focal)", () => {
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
					name: "trait-review",
					sections: [{ name: "review-style", body: "Be thorough" }],
				}),
				makePrompt({
					id: "p-0003",
					name: "trait-caution",
					sections: [{ name: "caution", body: "Be careful" }],
				}),
				makePrompt({
					id: "p-0004",
					name: "cautious-reviewer",
					extends: "base",
					mixins: ["trait-review", "trait-caution"],
					sections: [{ name: "quality-gates", body: "Run tests" }],
				}),
			];

			const result = resolvePrompt("cautious-reviewer", prompts);
			expect(result.sections).toHaveLength(5);
			expect(result.sections.map((s) => s.name)).toEqual([
				"role",
				"constraints",
				"review-style",
				"caution",
				"quality-gates",
			]);
			expect(result.resolvedFrom).toEqual([
				"base",
				"trait-review",
				"trait-caution",
				"cautious-reviewer",
			]);
		});

		it("mixin overrides parent section, focal overrides mixin", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [{ name: "role", body: "Base role" }],
				}),
				makePrompt({
					id: "p-0002",
					name: "trait",
					sections: [{ name: "role", body: "Trait role" }],
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					extends: "base",
					mixins: ["trait"],
					sections: [{ name: "role", body: "Child role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(1);
			expect(result.sections[0]?.body).toBe("Child role");
		});

		it("merges frontmatter from mixins (extends → mixins → focal)", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.5 },
				}),
				makePrompt({
					id: "p-0002",
					name: "trait",
					sections: [],
					frontmatter: { temperature: 0.9, topP: 0.95 },
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					extends: "base",
					mixins: ["trait"],
					sections: [],
					frontmatter: { maxTokens: 2000 },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({
				model: "claude-3",
				temperature: 0.9,
				topP: 0.95,
				maxTokens: 2000,
			});
		});

		it("detects circular reference via mixin", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "a",
					mixins: ["b"],
					sections: [],
				}),
				makePrompt({
					id: "p-0002",
					name: "b",
					mixins: ["a"],
					sections: [],
				}),
			];

			expect(() => resolvePrompt("a", prompts)).toThrow(/Circular inheritance/);
		});

		it("handles mixin with its own extends chain", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait-base",
					sections: [{ name: "trait-core", body: "Core trait" }],
				}),
				makePrompt({
					id: "p-0002",
					name: "trait-ext",
					extends: "trait-base",
					sections: [{ name: "trait-extra", body: "Extra trait" }],
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					mixins: ["trait-ext"],
					sections: [{ name: "role", body: "Child role" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(3);
			expect(result.sections.map((s) => s.name)).toEqual(["trait-core", "trait-extra", "role"]);
			expect(result.resolvedFrom).toEqual(["trait-base", "trait-ext", "child"]);
		});

		it("throws for missing mixin prompt", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "child",
					mixins: ["nonexistent"],
					sections: [],
				}),
			];

			expect(() => resolvePrompt("child", prompts)).toThrow(/not found/);
		});
	});

	describe("frontmatter merging", () => {
		it("returns own frontmatter when no parent", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.7 },
				}),
			];

			const result = resolvePrompt("base", prompts);
			expect(result.frontmatter).toEqual({ model: "claude-3", temperature: 0.7 });
		});

		it("inherits parent frontmatter", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.7 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({ model: "claude-3", temperature: 0.7 });
		});

		it("child frontmatter overrides parent keys", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.7 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
					frontmatter: { model: "claude-opus-4" },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({ model: "claude-opus-4", temperature: 0.7 });
		});

		it("mixed: some keys inherited, some overridden, some new", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3", temperature: 0.5, maxTokens: 1000 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
					frontmatter: { temperature: 0.9, topP: 0.95 },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({
				model: "claude-3",
				temperature: 0.9,
				maxTokens: 1000,
				topP: 0.95,
			});
		});

		it("empty frontmatter on child still inherits parent", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					frontmatter: { model: "claude-3" },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
					frontmatter: {},
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.frontmatter).toEqual({ model: "claude-3" });
		});

		it("prompt without frontmatter field returns {}", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
				}),
			];

			const result = resolvePrompt("base", prompts);
			expect(result.frontmatter).toEqual({});
		});
	});

	describe("mulch resolution", () => {
		it("omits mulch when no role declares it", () => {
			const prompts: Prompt[] = [
				makePrompt({ id: "p-0001", name: "base", sections: [] }),
				makePrompt({ id: "p-0002", name: "child", extends: "base", sections: [] }),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toBeUndefined();
			expect("mulch" in result).toBe(false);
		});

		it("returns own mulch when no parent", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					mulch: {
						prime: { domains: ["canopy"], files: ["src/render.ts"] },
						budget: 5000,
						on_empty: "warn",
					},
				}),
			];

			const result = resolvePrompt("base", prompts);
			expect(result.mulch).toEqual({
				prime: { domains: ["canopy"], files: ["src/render.ts"] },
				budget: 5000,
				on_empty: "warn",
			});
		});

		it("child mulch wholesale overrides parent without extends_mulch", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					mulch: {
						prime: { domains: ["base-domain"], files: ["base.ts"] },
						budget: 1000,
						on_empty: "error",
					},
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
					mulch: { prime: { domains: ["child-domain"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toEqual({ prime: { domains: ["child-domain"] } });
		});

		it("child without mulch and without extends_mulch yields undefined (no inheritance)", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					mulch: { prime: { domains: ["base-domain"] }, budget: 1000 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					sections: [],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toBeUndefined();
			expect("mulch" in result).toBe(false);
		});

		it("extends_mulch=true unions domains/files and last-wins budget/on_empty", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					mulch: {
						prime: { domains: ["a", "b"], files: ["x.ts"] },
						budget: 1000,
						on_empty: "error",
					},
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					extends_mulch: true,
					sections: [],
					mulch: {
						prime: { domains: ["b", "c"], files: ["y.ts"] },
						budget: 2000,
					},
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toEqual({
				prime: { domains: ["a", "b", "c"], files: ["x.ts", "y.ts"] },
				budget: 2000,
				on_empty: "error",
			});
		});

		it("extends_mulch=true with no own mulch inherits parent unchanged", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					mulch: { prime: { domains: ["a"] }, budget: 100 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					extends_mulch: true,
					sections: [],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toEqual({ prime: { domains: ["a"] }, budget: 100 });
		});

		it("multi-level inheritance applies merge semantics pairwise", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "grand",
					sections: [],
					mulch: { prime: { domains: ["g"] }, budget: 100, on_empty: "error" },
				}),
				makePrompt({
					id: "p-0002",
					name: "parent",
					extends: "grand",
					extends_mulch: true,
					sections: [],
					mulch: { prime: { domains: ["p"] }, budget: 200 },
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					extends: "parent",
					extends_mulch: true,
					sections: [],
					mulch: { prime: { domains: ["c"], files: ["c.ts"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toEqual({
				prime: { domains: ["g", "p", "c"], files: ["c.ts"] },
				budget: 200,
				on_empty: "error",
			});
		});

		it("multi-level: middle layer without extends_mulch breaks the chain", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "grand",
					sections: [],
					mulch: { prime: { domains: ["g"] }, budget: 100 },
				}),
				makePrompt({
					id: "p-0002",
					name: "parent",
					extends: "grand",
					sections: [],
					mulch: { prime: { domains: ["p"] } },
				}),
				makePrompt({
					id: "p-0003",
					name: "child",
					extends: "parent",
					extends_mulch: true,
					sections: [],
					mulch: { prime: { domains: ["c"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toEqual({
				prime: { domains: ["p", "c"] },
			});
		});

		it("extends_mulch=true unions mixin contributions with parent and focal", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					mulch: { prime: { domains: ["base-d"] } },
				}),
				makePrompt({
					id: "p-0002",
					name: "trait-a",
					sections: [],
					mulch: { prime: { domains: ["trait-a-d"], files: ["a.ts"] }, budget: 500 },
				}),
				makePrompt({
					id: "p-0003",
					name: "trait-b",
					sections: [],
					mulch: { prime: { files: ["b.ts"] }, on_empty: "skip" },
				}),
				makePrompt({
					id: "p-0004",
					name: "child",
					extends: "base",
					mixins: ["trait-a", "trait-b"],
					extends_mulch: true,
					sections: [],
					mulch: { prime: { domains: ["child-d"] }, budget: 999 },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toEqual({
				prime: {
					domains: ["base-d", "trait-a-d", "child-d"],
					files: ["a.ts", "b.ts"],
				},
				budget: 999,
				on_empty: "skip",
			});
		});

		it("without extends_mulch, mixin mulch is ignored even if focal has none", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait",
					sections: [],
					mulch: { prime: { domains: ["t"] } },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					mixins: ["trait"],
					sections: [],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toBeUndefined();
		});

		it("without extends_mulch, focal mulch wins over mixin mulch", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "trait",
					sections: [],
					mulch: { prime: { domains: ["trait-d"] }, budget: 100 },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					mixins: ["trait"],
					sections: [],
					mulch: { prime: { domains: ["child-d"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch).toEqual({ prime: { domains: ["child-d"] } });
		});

		it("preserves order and dedupes within union", () => {
			const prompts: Prompt[] = [
				makePrompt({
					id: "p-0001",
					name: "base",
					sections: [],
					mulch: { prime: { domains: ["a", "b", "c"], files: ["x", "y"] } },
				}),
				makePrompt({
					id: "p-0002",
					name: "child",
					extends: "base",
					extends_mulch: true,
					sections: [],
					mulch: { prime: { domains: ["b", "d", "a"], files: ["y", "z"] } },
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.mulch?.prime?.domains).toEqual(["a", "b", "c", "d"]);
			expect(result.mulch?.prime?.files).toEqual(["x", "y", "z"]);
		});

		it("regression: prompts without mulch render unchanged", () => {
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
					sections: [{ name: "extra", body: "Extra" }],
				}),
			];

			const result = resolvePrompt("child", prompts);
			expect(result.sections).toHaveLength(2);
			expect(result.mulch).toBeUndefined();
			expect("mulch" in result).toBe(false);
		});
	});
});
