import { describe, expect, it } from "bun:test";
import { extractFrontmatter, renderFrontmatter } from "./frontmatter.ts";

describe("extractFrontmatter", () => {
	it("extracts frontmatter from file with frontmatter", () => {
		const content = `---
name: my-agent
model: sonnet
---

## role

Body content here
`;
		const { metadata, body } = extractFrontmatter(content);
		expect(metadata.name).toBe("my-agent");
		expect(metadata.model).toBe("sonnet");
		expect(body).toContain("Body content here");
	});

	it("returns empty metadata and full body when no frontmatter", () => {
		const content = "# Just a markdown file\n\nNo frontmatter here.\n";
		const { metadata, body } = extractFrontmatter(content);
		expect(metadata).toEqual({});
		expect(body).toBe(content);
	});

	it("handles file with only frontmatter (empty body)", () => {
		const content = `---
name: agent
---
`;
		const { metadata, body } = extractFrontmatter(content);
		expect(metadata.name).toBe("agent");
		expect(body).toBe("");
	});

	it("parses flat key-value pairs", () => {
		const content = `---
name: builder
model: claude-sonnet
version: 1
---
`;
		const { metadata } = extractFrontmatter(content);
		expect(metadata.name).toBe("builder");
		expect(metadata.model).toBe("claude-sonnet");
		expect(metadata.version).toBe(1);
	});

	it("parses YAML lists (tools list)", () => {
		const content = `---
tools:
  - Read
  - Write
  - Bash
---
`;
		const { metadata } = extractFrontmatter(content);
		expect(metadata.tools).toEqual(["Read", "Write", "Bash"]);
	});

	it("parses nested objects", () => {
		const content = `---
contextContract:
  emitDir: agents
  prefix: cn
---
`;
		const { metadata } = extractFrontmatter(content);
		expect(metadata.contextContract).toEqual({
			emitDir: "agents",
			prefix: "cn",
		});
	});

	it("parses arrays of objects (contextContract.requires)", () => {
		const content = `---
contextContract:
  requires:
    - type: spec_file
      key: SPEC
    - type: seed_file
      key: SEED
---
`;
		const { metadata } = extractFrontmatter(content);
		const contract = metadata.contextContract as Record<string, unknown>;
		expect(Array.isArray(contract.requires)).toBe(true);
		const requires = contract.requires as Array<Record<string, unknown>>;
		expect(requires.at(0)).toEqual({ type: "spec_file", key: "SPEC" });
		expect(requires.at(1)).toEqual({ type: "seed_file", key: "SEED" });
	});

	it("parses booleans and numbers", () => {
		const content = `---
readOnly: true
debug: false
timeout: 30
factor: 1.5
---
`;
		const { metadata } = extractFrontmatter(content);
		expect(metadata.readOnly).toBe(true);
		expect(metadata.debug).toBe(false);
		expect(metadata.timeout).toBe(30);
		expect(metadata.factor).toBe(1.5);
	});

	it("parses quoted strings (single and double)", () => {
		const content = `---
label: "hello world"
path: 'my path'
url: "http://example.com"
---
`;
		const { metadata } = extractFrontmatter(content);
		expect(metadata.label).toBe("hello world");
		expect(metadata.path).toBe("my path");
		expect(metadata.url).toBe("http://example.com");
	});

	it("strips inline comments from unquoted values", () => {
		const content = `---
model: sonnet # default model
---
`;
		const { metadata } = extractFrontmatter(content);
		expect(metadata.model).toBe("sonnet");
	});

	it("handles empty frontmatter block", () => {
		const content = `---
---
Body here
`;
		const { metadata, body } = extractFrontmatter(content);
		expect(metadata).toEqual({});
		expect(body).toContain("Body here");
	});

	it("returns full content when closing --- is missing", () => {
		const content = `---
name: agent
model: sonnet
`;
		const { metadata, body } = extractFrontmatter(content);
		expect(metadata).toEqual({});
		expect(body).toBe(content);
	});

	it("handles content with --- in body", () => {
		const content = `---
name: agent
---

Some content

---

More content after a horizontal rule
`;
		const { metadata, body } = extractFrontmatter(content);
		expect(metadata.name).toBe("agent");
		expect(body).toContain("---");
		expect(body).toContain("More content after a horizontal rule");
	});
});

describe("renderFrontmatter", () => {
	it("serializes flat key-value pairs", () => {
		const result = renderFrontmatter({ name: "builder", model: "sonnet" });
		expect(result).toContain("name: builder");
		expect(result).toContain("model: sonnet");
		expect(result).toMatch(/^---\n/);
		expect(result).toMatch(/\n---\n$/);
	});

	it("serializes arrays of scalars", () => {
		const result = renderFrontmatter({ tools: ["Read", "Write", "Bash"] });
		expect(result).toContain("tools:");
		expect(result).toContain("  - Read");
		expect(result).toContain("  - Write");
		expect(result).toContain("  - Bash");
	});

	it("serializes nested objects", () => {
		const result = renderFrontmatter({
			contextContract: { emitDir: "agents", prefix: "cn" },
		});
		expect(result).toContain("contextContract:");
		expect(result).toContain("  emitDir: agents");
		expect(result).toContain("  prefix: cn");
	});

	it("serializes booleans and numbers", () => {
		const result = renderFrontmatter({
			readOnly: true,
			debug: false,
			timeout: 30,
		});
		expect(result).toContain("readOnly: true");
		expect(result).toContain("debug: false");
		expect(result).toContain("timeout: 30");
	});

	it("quotes strings that contain special characters", () => {
		const result = renderFrontmatter({ url: "http://example.com" });
		expect(result).toContain('"http://example.com"');
	});

	it("quotes strings that would be misinterpreted as booleans or numbers", () => {
		const result = renderFrontmatter({ flag: "true", count: "42" });
		expect(result).toContain('"true"');
		expect(result).toContain('"42"');
	});

	it("returns empty string for empty metadata", () => {
		expect(renderFrontmatter({})).toBe("");
	});

	it("serializes arrays of objects", () => {
		const result = renderFrontmatter({
			requires: [
				{ type: "spec_file", key: "SPEC" },
				{ type: "seed_file", key: "SEED" },
			],
		});
		expect(result).toContain("requires:");
		expect(result).toContain("  - type: spec_file");
		expect(result).toContain("    key: SPEC");
		expect(result).toContain("  - type: seed_file");
		expect(result).toContain("    key: SEED");
	});
});

describe("round-trip", () => {
	it("parse then serialize produces equivalent output for flat keys", () => {
		const original = `---\nname: builder\nmodel: sonnet\n---\n`;
		const { metadata } = extractFrontmatter(original);
		const rendered = renderFrontmatter(metadata);
		const { metadata: reparsed } = extractFrontmatter(rendered);
		expect(reparsed.name).toBe("builder");
		expect(reparsed.model).toBe("sonnet");
	});

	it("round-trips arrays", () => {
		const original = { tools: ["Read", "Write"] };
		const rendered = renderFrontmatter(original);
		const { metadata } = extractFrontmatter(rendered);
		expect(metadata.tools).toEqual(["Read", "Write"]);
	});

	it("round-trips nested objects", () => {
		const original = { contextContract: { emitDir: "agents" } };
		const rendered = renderFrontmatter(original);
		const { metadata } = extractFrontmatter(rendered);
		expect(metadata.contextContract).toEqual({ emitDir: "agents" });
	});

	it("round-trips arrays of objects", () => {
		const original = {
			requires: [
				{ type: "spec_file", key: "SPEC" },
				{ type: "seed_file", key: "SEED" },
			],
		};
		const rendered = renderFrontmatter(original);
		const { metadata } = extractFrontmatter(rendered);
		const requires = metadata.requires as Array<Record<string, unknown>>;
		expect(requires.at(0)).toEqual({ type: "spec_file", key: "SPEC" });
		expect(requires.at(1)).toEqual({ type: "seed_file", key: "SEED" });
	});

	it("round-trips booleans and numbers", () => {
		const original = { readOnly: true, timeout: 30 };
		const rendered = renderFrontmatter(original);
		const { metadata } = extractFrontmatter(rendered);
		expect(metadata.readOnly).toBe(true);
		expect(metadata.timeout).toBe(30);
	});

	it("round-trips complex agent frontmatter", () => {
		const original = {
			name: "my-agent",
			model: "sonnet",
			tools: ["Read", "Write"],
			readOnly: true,
			contextContract: {
				requires: [
					{ type: "spec_file", key: "SPEC" },
					{ type: "seed_file", key: "SEED" },
				],
			},
		};
		const rendered = renderFrontmatter(original);
		const { metadata } = extractFrontmatter(rendered);
		expect(metadata.name).toBe("my-agent");
		expect(metadata.model).toBe("sonnet");
		expect(metadata.tools).toEqual(["Read", "Write"]);
		expect(metadata.readOnly).toBe(true);
		const contract = metadata.contextContract as Record<string, unknown>;
		const requires = contract.requires as Array<Record<string, unknown>>;
		expect(requires.at(0)).toEqual({ type: "spec_file", key: "SPEC" });
	});
});
