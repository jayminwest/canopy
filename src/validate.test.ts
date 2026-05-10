import { describe, expect, it } from "bun:test";
import type { Prompt, Schema } from "./types.ts";
import { validateMulch, validatePrompt } from "./validate.ts";

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

function makeSchema(overrides: Partial<Schema> & { id: string; name: string }): Schema {
	return {
		requiredSections: [],
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

describe("validatePrompt", () => {
	it("passes when all required sections present", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [
				{ name: "role", body: "You are a builder." },
				{ name: "constraints", body: "Never push." },
			],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["role", "constraints"],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("fails when required section is missing", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [{ name: "role", body: "You are a builder." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["role", "constraints"],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.section).toBe("constraints");
	});

	it("validates regex rules", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [{ name: "constraints", body: "Be careful." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["constraints"],
			rules: [
				{
					section: "constraints",
					pattern: "Never push",
					message: "Must include push restriction",
				},
			],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(false);
		expect(result.errors[0]?.message).toBe("Must include push restriction");
	});

	it("passes regex rule when pattern matches", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [{ name: "constraints", body: "Never push to canonical branch." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["constraints"],
			rules: [
				{
					section: "constraints",
					pattern: "Never push",
					message: "Must include push restriction",
				},
			],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(true);
	});

	it("includes inherited sections in validation", () => {
		const base = makePrompt({
			id: "p-0001",
			name: "base",
			sections: [{ name: "constraints", body: "Never push." }],
		});

		const child = makePrompt({
			id: "p-0002",
			name: "child",
			extends: "base",
			sections: [{ name: "role", body: "Child role." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: ["role", "constraints"],
		});

		const result = validatePrompt(child, schema, [base, child]);
		expect(result.valid).toBe(true);
	});

	it("reports warning for invalid regex", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [{ name: "constraints", body: "Never push." }],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: [],
			rules: [
				{
					section: "constraints",
					pattern: "[invalid regex",
					message: "Bad pattern",
				},
			],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("surfaces mulch shape errors through validatePrompt", () => {
		const prompt = makePrompt({
			id: "p-0001",
			name: "builder",
			sections: [],
			mulch: { on_empty: "explode" } as unknown as Prompt["mulch"],
		});

		const schema = makeSchema({
			id: "s-0001",
			name: "agent",
			requiredSections: [],
		});

		const result = validatePrompt(prompt, schema, [prompt]);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.section === "mulch.on_empty")).toBe(true);
	});
});

describe("validateMulch", () => {
	function p(overrides: Partial<Prompt> & { id?: string; name?: string }): Prompt {
		return {
			id: "p-0001",
			name: "test",
			version: 1,
			sections: [],
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
			...overrides,
		};
	}

	it("returns no errors when mulch and extends_mulch are absent", () => {
		expect(validateMulch(p({}))).toEqual([]);
	});

	it("returns no errors for a well-formed mulch block", () => {
		const prompt = p({
			extends_mulch: true,
			mulch: {
				prime: { domains: ["warren"], files: ["src/**"] },
				budget: 50000,
				on_empty: "skip",
			},
		});
		expect(validateMulch(prompt)).toEqual([]);
	});

	it("rejects non-boolean extends_mulch", () => {
		const prompt = p({ extends_mulch: "yes" as unknown as boolean });
		const errs = validateMulch(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("extends_mulch");
		expect(errs[0]?.message).toContain("must be a boolean");
	});

	it("rejects mulch that is not an object", () => {
		const prompt = p({ mulch: "domains" as unknown as Prompt["mulch"] });
		const errs = validateMulch(prompt);
		expect(errs.some((e) => e.section === "mulch" && e.rule === "type")).toBe(true);
	});

	it("rejects unknown top-level keys under mulch", () => {
		const prompt = p({
			mulch: { foo: 1 } as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs.some((e) => e.rule === "unknown-key" && e.message.includes('"foo"'))).toBe(true);
	});

	it("rejects bad on_empty value", () => {
		const prompt = p({
			mulch: { on_empty: "explode" } as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("mulch.on_empty");
		expect(errs[0]?.message).toContain('"skip"');
	});

	it("rejects non-array domains", () => {
		const prompt = p({
			mulch: { prime: { domains: "warren" } } as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("mulch.prime.domains");
	});

	it("rejects non-string entries in domains array", () => {
		const prompt = p({
			mulch: { prime: { domains: ["ok", 42] } } as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs.some((e) => e.section === "mulch.prime.domains")).toBe(true);
	});

	it("rejects non-array files", () => {
		const prompt = p({
			mulch: { prime: { files: { glob: "src/**" } } } as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("mulch.prime.files");
	});

	it("rejects unknown keys under mulch.prime", () => {
		const prompt = p({
			mulch: { prime: { domains: ["a"], scope: "all" } } as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs.some((e) => e.section === "mulch.prime" && e.rule === "unknown-key")).toBe(true);
	});

	it("rejects prime that is not an object", () => {
		const prompt = p({
			mulch: { prime: ["a", "b"] } as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("mulch.prime");
	});

	it("rejects negative budget", () => {
		const prompt = p({
			mulch: { budget: -1 } as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("mulch.budget");
	});

	it("rejects non-numeric budget", () => {
		const prompt = p({
			mulch: { budget: "lots" } as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.section).toBe("mulch.budget");
	});

	it("collects multiple errors in one pass", () => {
		const prompt = p({
			extends_mulch: 1 as unknown as boolean,
			mulch: {
				prime: { domains: 1 },
				budget: -5,
				on_empty: "loud",
				bogus: true,
			} as unknown as Prompt["mulch"],
		});
		const errs = validateMulch(prompt);
		expect(errs.length).toBeGreaterThanOrEqual(4);
		const sections = errs.map((e) => e.section);
		expect(sections).toContain("extends_mulch");
		expect(sections).toContain("mulch.prime.domains");
		expect(sections).toContain("mulch.budget");
		expect(sections).toContain("mulch.on_empty");
	});
});
