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
});
