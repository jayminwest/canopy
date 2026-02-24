import { join } from "node:path";
import { c, humanOut, jsonOut } from "../output.ts";
import { dedupById, dedupByIdLast, readJsonl } from "../store.ts";
import type { Prompt, Schema } from "../types.ts";

export default async function stats(_args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();

	if (_args.includes("--help") || _args.includes("-h")) {
		humanOut(`Usage: cn stats [options]

Options:
  --json    Output as JSON`);
		return;
	}

	const promptsPath = join(cwd, ".canopy", "prompts.jsonl");
	const schemasPath = join(cwd, ".canopy", "schemas.jsonl");

	const allPromptRecords = await readJsonl<Prompt>(promptsPath);
	const allSchemaRecords = await readJsonl<Schema>(schemasPath);

	const prompts = dedupById(allPromptRecords);
	const schemas = dedupByIdLast(allSchemaRecords);

	const active = prompts.filter((p) => p.status === "active").length;
	const draft = prompts.filter((p) => p.status === "draft").length;
	const archived = prompts.filter((p) => p.status === "archived").length;
	const total = prompts.length;
	const totalVersions = allPromptRecords.length;
	const withSchema = prompts.filter((p) => p.schema).length;
	const withParent = prompts.filter((p) => p.extends).length;

	if (json) {
		jsonOut({
			success: true,
			command: "stats",
			prompts: { total, active, draft, archived, withSchema, withParent, totalVersions },
			schemas: schemas.length,
		});
	} else {
		humanOut(c.bold("Canopy Stats"));
		humanOut("");
		humanOut("Prompts:");
		humanOut(`  ${c.green(String(active))} active`);
		humanOut(`  ${c.yellow(String(draft))} draft`);
		humanOut(`  ${c.dim(String(archived))} archived`);
		humanOut(`  ${c.dim(`${totalVersions} total versions in JSONL`)}`);
		humanOut("");
		humanOut(`  ${withSchema} with schema  |  ${withParent} with parent (inheritance)`);
		humanOut(`  ${schemas.length} schema(s) defined`);
	}
}
