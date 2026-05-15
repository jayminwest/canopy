// JSON Schema for `.canopy/config.yaml`. Wire-format contract for warren V2's
// schema-driven config UI (warren ROADMAP R-10): warren reads this schema,
// renders a form, and writes back via `cn config set <path> <value>`. Locked
// with a golden test (config-schema.test.ts) so any shape change is intentional.
//
// Describes the **canonical** shape produced by loadConfig in src/config.ts:
// `project`, `version`, and a `targets` map of named EmitTargets. The loader
// transparently migrates legacy `emitDir`/`emitDirByTag` configs to this shape
// on read; the first `cn config set` rewrites the file in the canonical form.
// Legacy fields are intentionally absent so warren's UI does not surface
// deprecated knobs.

type JSONSchema = Record<string, unknown>;

export function configSchema(): JSONSchema {
	return {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: "https://github.com/jayminwest/canopy/config.schema.json",
		title: "Canopy project config",
		description:
			"Schema for .canopy/config.yaml. Consumed by warren's schema-driven UI; emit via `cn config schema`.",
		type: "object",
		required: ["project", "version"],
		additionalProperties: false,
		properties: {
			project: {
				type: "string",
				minLength: 1,
				title: "Project name",
				description: "Human-readable project identifier surfaced in `cn list` and warren.",
			},
			version: {
				type: "string",
				title: "Config schema version",
				description: "Internal version tag for the config layout. Bumped when the schema breaks.",
				default: "1",
			},
			targets: {
				type: "object",
				title: "Emit targets",
				description:
					"Map of target name → emit target. `cn emit` resolves a prompt to a target by matching tags, falling back to the target marked `default: true`.",
				additionalProperties: { $ref: "#/$defs/EmitTarget" },
				examples: [
					{
						default: { dir: "agents", default: true },
						docs: { dir: "docs/prompts", tags: ["doc"] },
					},
				],
			},
		},
		$defs: {
			EmitTarget: {
				type: "object",
				required: ["dir"],
				additionalProperties: false,
				properties: {
					dir: {
						type: "string",
						minLength: 1,
						title: "Directory",
						description:
							"Output directory (relative to the repo root) where prompts emitted to this target are written.",
					},
					default: {
						type: "boolean",
						title: "Default target",
						description:
							"When true, prompts with no matching tag-based target are emitted here. At most one target should set this.",
					},
					tags: {
						type: "array",
						items: { type: "string", minLength: 1 },
						title: "Tags",
						description: "Prompts whose `tags` include any of these are routed to this target.",
					},
				},
			},
		},
	};
}
