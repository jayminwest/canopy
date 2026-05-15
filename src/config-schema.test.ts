import { describe, expect, it } from "bun:test";
import { configSchema } from "./config-schema.ts";

describe("configSchema", () => {
	it("emits valid JSON Schema with the expected top-level shape", () => {
		const schema = configSchema();
		expect(schema.$id).toBe("https://github.com/jayminwest/canopy/config.schema.json");
		expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
		expect(schema.type).toBe("object");
		expect(schema.required).toEqual(["project", "version"]);
		expect(schema.additionalProperties).toBe(false);
		expect(schema.title).toBe("Canopy project config");

		const props = schema.properties as Record<string, unknown>;
		expect(Object.keys(props).sort()).toEqual(["project", "targets", "version"].sort());

		const defs = schema.$defs as Record<string, unknown>;
		expect(Object.keys(defs)).toEqual(["EmitTarget"]);
	});

	it("golden: schema property keys are stable (warren wire format)", () => {
		const schema = configSchema();
		const props = schema.properties as Record<string, Record<string, unknown>>;

		expect(Object.keys(props.project ?? {}).sort()).toEqual(
			["description", "minLength", "title", "type"].sort(),
		);
		expect(Object.keys(props.version ?? {}).sort()).toEqual(
			["default", "description", "title", "type"].sort(),
		);
		expect(Object.keys(props.targets ?? {}).sort()).toEqual(
			["additionalProperties", "description", "examples", "title", "type"].sort(),
		);

		const defs = schema.$defs as Record<string, Record<string, unknown>>;
		const emitTarget = defs.EmitTarget as Record<string, unknown>;
		expect(emitTarget.type).toBe("object");
		expect(emitTarget.required).toEqual(["dir"]);
		expect(emitTarget.additionalProperties).toBe(false);

		const emitProps = emitTarget.properties as Record<string, Record<string, unknown>>;
		expect(Object.keys(emitProps).sort()).toEqual(["default", "dir", "tags"].sort());
		expect(emitProps.dir?.type).toBe("string");
		expect(emitProps.dir?.minLength).toBe(1);
		expect(emitProps.default?.type).toBe("boolean");
		expect(emitProps.tags?.type).toBe("array");
		expect((emitProps.tags?.items as Record<string, unknown>)?.type).toBe("string");
	});

	it("does not surface legacy emitDir/emitDirByTag fields", () => {
		const schema = configSchema();
		const props = schema.properties as Record<string, unknown>;
		expect(props.emitDir).toBeUndefined();
		expect(props.emitDirByTag).toBeUndefined();
	});

	it("targets values reference EmitTarget via $ref", () => {
		const schema = configSchema();
		const props = schema.properties as Record<string, Record<string, unknown>>;
		const targets = props.targets;
		const addl = targets?.additionalProperties as Record<string, unknown> | undefined;
		expect(addl?.$ref).toBe("#/$defs/EmitTarget");
	});

	it("targets.examples illustrates the default + tag-routed shape", () => {
		const schema = configSchema();
		const props = schema.properties as Record<string, Record<string, unknown>>;
		const examples = props.targets?.examples as Array<Record<string, unknown>> | undefined;
		expect(Array.isArray(examples)).toBe(true);
		const first = examples?.[0];
		expect(first).toBeDefined();
		// At least one example target must demonstrate `default: true`
		const hasDefault = Object.values(first ?? {}).some(
			(t) => (t as Record<string, unknown>).default === true,
		);
		expect(hasDefault).toBe(true);
	});
});
