import { describe, expect, it } from "bun:test";
import type { Section } from "../types.ts";
import { diffSections } from "./diff.ts";

describe("diffSections", () => {
	it("detects added section", () => {
		const from: Section[] = [{ name: "role", body: "Base role" }];
		const to: Section[] = [
			{ name: "role", body: "Base role" },
			{ name: "constraints", body: "New" },
		];

		const changes = diffSections(from, to);
		const added = changes.find((c) => c.section === "constraints");
		expect(added?.type).toBe("added");
	});

	it("detects removed section", () => {
		const from: Section[] = [
			{ name: "role", body: "Base role" },
			{ name: "constraints", body: "Old" },
		];
		const to: Section[] = [{ name: "role", body: "Base role" }];

		const changes = diffSections(from, to);
		const removed = changes.find((c) => c.section === "constraints");
		expect(removed?.type).toBe("removed");
	});

	it("detects modified section", () => {
		const from: Section[] = [{ name: "role", body: "Old role" }];
		const to: Section[] = [{ name: "role", body: "New role" }];

		const changes = diffSections(from, to);
		const modified = changes.find((c) => c.section === "role");
		expect(modified?.type).toBe("modified");
	});

	it("detects unchanged section", () => {
		const from: Section[] = [{ name: "role", body: "Same role" }];
		const to: Section[] = [{ name: "role", body: "Same role" }];

		const changes = diffSections(from, to);
		const unchanged = changes.find((c) => c.section === "role");
		expect(unchanged?.type).toBe("unchanged");
	});

	it("handles empty sections", () => {
		const changes = diffSections([], []);
		expect(changes).toHaveLength(0);
	});

	it("detects all change types together", () => {
		const from: Section[] = [
			{ name: "role", body: "Old role" },
			{ name: "workflow", body: "Steps" },
		];
		const to: Section[] = [
			{ name: "role", body: "New role" },
			{ name: "constraints", body: "Don't do bad things" },
		];

		const changes = diffSections(from, to);
		expect(changes.find((c) => c.section === "role")?.type).toBe("modified");
		expect(changes.find((c) => c.section === "workflow")?.type).toBe("removed");
		expect(changes.find((c) => c.section === "constraints")?.type).toBe("added");
	});
});
