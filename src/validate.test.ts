import { describe, expect, it } from "bun:test";
import type { Prompt, Schema } from "./types.ts";
import { validatePrompt } from "./validate.ts";

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
});
