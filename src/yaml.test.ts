import { describe, expect, it } from "bun:test";
import { parseScalarOrFlow, parseYaml, serializeYaml } from "./yaml.ts";

describe("parseYaml", () => {
	it("parses basic key-value pairs", () => {
		const result = parseYaml("project: overstory\nversion: 1\n");
		expect(result).toEqual({ project: "overstory", version: "1" });
	});

	it("handles quoted strings", () => {
		const result = parseYaml(`name: "hello world"\npath: 'my path'`);
		expect(result.name).toBe("hello world");
		expect(result.path).toBe("my path");
	});

	it("skips empty lines and comments", () => {
		const text = "# comment\nproject: test\n\nversion: 2\n";
		const result = parseYaml(text);
		expect(result).toEqual({ project: "test", version: "2" });
	});

	it("handles values with colons in quoted strings", () => {
		const result = parseYaml(`url: "http://example.com"`);
		expect(result.url).toBe("http://example.com");
	});

	it("strips inline comments from unquoted values", () => {
		const result = parseYaml("emitDir: agents # where to emit");
		expect(result.emitDir).toBe("agents");
	});

	it("handles escaped characters in double-quoted strings", () => {
		const result = parseYaml(`msg: "line1\\nline2"`);
		expect(result.msg).toBe("line1\nline2");
	});

	it("parses a nested map", () => {
		const text =
			"emitDirByTag:\n  slash-command: .claude/commands\n  internal: .internal/prompts\n";
		const result = parseYaml(text);
		expect(result.emitDirByTag).toEqual({
			"slash-command": ".claude/commands",
			internal: ".internal/prompts",
		});
	});

	it("parses mixed flat and nested keys", () => {
		const text =
			"project: overstory\nversion: 1\nemitDir: agents\nemitDirByTag:\n  slash-command: .claude/commands\n  internal: .internal/prompts\n";
		const result = parseYaml(text);
		expect(result.project).toBe("overstory");
		expect(result.version).toBe("1");
		expect(result.emitDir).toBe("agents");
		expect(result.emitDirByTag).toEqual({
			"slash-command": ".claude/commands",
			internal: ".internal/prompts",
		});
	});

	it("handles empty nested key (no children)", () => {
		const text = "project: test\nemitDirByTag:\nversion: 1\n";
		const result = parseYaml(text);
		// emitDirByTag has no indented children, so it's an empty string
		expect(result.emitDirByTag).toBe("");
		expect(result.project).toBe("test");
		expect(result.version).toBe("1");
	});

	it("handles quoted values in nested maps", () => {
		const text = "emitDirByTag:\n  command: \".claude/commands\"\n  path: 'my path'\n";
		const result = parseYaml(text);
		expect(result.emitDirByTag).toEqual({
			command: ".claude/commands",
			path: "my path",
		});
	});
});

describe("serializeYaml", () => {
	it("serializes basic key-value pairs", () => {
		const result = serializeYaml({ project: "test", version: "1" });
		const parsed = parseYaml(result);
		expect(parsed.project).toBe("test");
		expect(parsed.version).toBe("1");
	});

	it("quotes values with colons", () => {
		const result = serializeYaml({ url: "http://example.com" });
		expect(result).toContain('"');
		const parsed = parseYaml(result);
		expect(parsed.url).toBe("http://example.com");
	});

	it("round-trips correctly", () => {
		const original = { project: "my-project", version: "1", emitDir: "agents" };
		const serialized = serializeYaml(original);
		const parsed = parseYaml(serialized);
		expect(parsed.project).toBe("my-project");
		expect(parsed.version).toBe("1");
		expect(parsed.emitDir).toBe("agents");
	});

	it("serializes nested maps", () => {
		const obj = {
			project: "test",
			emitDirByTag: { "slash-command": ".claude/commands", internal: ".internal/prompts" },
		};
		const result = serializeYaml(obj);
		expect(result).toContain("emitDirByTag:");
		expect(result).toContain("  slash-command: .claude/commands");
		expect(result).toContain("  internal: .internal/prompts");
	});

	it("round-trips nested maps", () => {
		const original = {
			project: "overstory",
			version: "1",
			emitDir: "agents",
			emitDirByTag: { "slash-command": ".claude/commands", internal: ".internal/prompts" },
		};
		const serialized = serializeYaml(original);
		const parsed = parseYaml(serialized);
		expect(parsed.project).toBe("overstory");
		expect(parsed.version).toBe("1");
		expect(parsed.emitDir).toBe("agents");
		expect(parsed.emitDirByTag).toEqual({
			"slash-command": ".claude/commands",
			internal: ".internal/prompts",
		});
	});

	it("quotes nested values that need quoting", () => {
		const obj = {
			emitDirByTag: { command: "path with: colon" },
		};
		const serialized = serializeYaml(obj);
		expect(serialized).toContain('"path with: colon"');
		const parsed = parseYaml(serialized);
		expect(parsed.emitDirByTag).toEqual({ command: "path with: colon" });
	});
});

describe("parseScalarOrFlow", () => {
	it("parses bare strings", () => {
		expect(parseScalarOrFlow("hello")).toBe("hello");
		expect(parseScalarOrFlow("agents/canopy")).toBe("agents/canopy");
	});

	it("parses booleans", () => {
		expect(parseScalarOrFlow("true")).toBe(true);
		expect(parseScalarOrFlow("false")).toBe(false);
	});

	it("parses null forms", () => {
		expect(parseScalarOrFlow("null")).toBeNull();
		expect(parseScalarOrFlow("~")).toBeNull();
		expect(parseScalarOrFlow("")).toBeNull();
	});

	it("parses integers and floats as numbers", () => {
		expect(parseScalarOrFlow("42")).toBe(42);
		expect(parseScalarOrFlow("-7")).toBe(-7);
		expect(parseScalarOrFlow("3.14")).toBe(3.14);
		expect(parseScalarOrFlow("-0.5")).toBe(-0.5);
	});

	it("unquotes double-quoted strings and decodes escapes", () => {
		expect(parseScalarOrFlow('"hello world"')).toBe("hello world");
		expect(parseScalarOrFlow('"a\\nb"')).toBe("a\nb");
	});

	it("unquotes single-quoted strings and decodes doubled apostrophes", () => {
		expect(parseScalarOrFlow("'plain'")).toBe("plain");
		expect(parseScalarOrFlow("'it''s'")).toBe("it's");
	});

	it("preserves numeric-looking strings inside quotes", () => {
		expect(parseScalarOrFlow('"42"')).toBe("42");
		expect(parseScalarOrFlow("'true'")).toBe("true");
	});

	it("parses flow sequences", () => {
		expect(parseScalarOrFlow("[]")).toEqual([]);
		expect(parseScalarOrFlow("[a, b, c]")).toEqual(["a", "b", "c"]);
		expect(parseScalarOrFlow("[1, 2, 3]")).toEqual([1, 2, 3]);
		expect(parseScalarOrFlow("[true, false, null]")).toEqual([true, false, null]);
	});

	it("parses flow mappings", () => {
		expect(parseScalarOrFlow("{}")).toEqual({});
		expect(parseScalarOrFlow("{ dir: agents }")).toEqual({ dir: "agents" });
		expect(parseScalarOrFlow("{ dir: agents, byTag: true }")).toEqual({
			dir: "agents",
			byTag: true,
		});
	});

	it("parses nested flow values", () => {
		expect(parseScalarOrFlow("[[1, 2], [3, 4]]")).toEqual([
			[1, 2],
			[3, 4],
		]);
		expect(parseScalarOrFlow("{ outer: { inner: 1 } }")).toEqual({
			outer: { inner: 1 },
		});
		expect(parseScalarOrFlow("{ items: [a, b] }")).toEqual({ items: ["a", "b"] });
	});

	it("handles quoted strings with commas inside flow sequences", () => {
		expect(parseScalarOrFlow('["a, b", c]')).toEqual(["a, b", "c"]);
	});

	it("throws on unclosed flow sequence", () => {
		expect(() => parseScalarOrFlow("[a, b")).toThrow(/Unclosed flow sequence/);
	});

	it("throws on unclosed flow mapping", () => {
		expect(() => parseScalarOrFlow("{ k: v")).toThrow(/Unclosed flow mapping/);
	});

	it("throws on flow map entry without colon", () => {
		expect(() => parseScalarOrFlow("{ keyonly }")).toThrow(/missing ':'/);
	});
});
