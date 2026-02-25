import { describe, expect, it } from "bun:test";
import { parseYaml, serializeYaml } from "./yaml.ts";

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
