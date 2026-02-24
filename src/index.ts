#!/usr/bin/env bun
import { errorOut, isJsonMode, jsonOut } from "./output.ts";
import { ExitError } from "./types.ts";

export const VERSION = "0.1.2";

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
	printHelp();
	process.exit(0);
}

if (args[0] === "--version" || args[0] === "-v") {
	console.log(VERSION);
	process.exit(0);
}

const command = args[0];
const rest = args.slice(1);
const json = isJsonMode(args);

async function run() {
	switch (command) {
		case "init": {
			const mod = await import("./commands/init.ts");
			await mod.default(rest, json);
			break;
		}
		case "create": {
			const mod = await import("./commands/create.ts");
			await mod.default(rest, json);
			break;
		}
		case "show": {
			const mod = await import("./commands/show.ts");
			await mod.default(rest, json);
			break;
		}
		case "list": {
			const mod = await import("./commands/list.ts");
			await mod.default(rest, json);
			break;
		}
		case "update": {
			const mod = await import("./commands/update.ts");
			await mod.default(rest, json);
			break;
		}
		case "archive": {
			const mod = await import("./commands/archive.ts");
			await mod.default(rest, json);
			break;
		}
		case "render": {
			const mod = await import("./commands/render.ts");
			await mod.default(rest, json);
			break;
		}
		case "tree": {
			const mod = await import("./commands/tree.ts");
			await mod.default(rest, json);
			break;
		}
		case "history": {
			const mod = await import("./commands/history.ts");
			await mod.default(rest, json);
			break;
		}
		case "diff": {
			const mod = await import("./commands/diff.ts");
			await mod.default(rest, json);
			break;
		}
		case "pin": {
			const mod = await import("./commands/pin.ts");
			await mod.default(rest, json);
			break;
		}
		case "unpin": {
			const mod = await import("./commands/pin.ts");
			await mod.defaultUnpin(rest, json);
			break;
		}
		case "emit": {
			const mod = await import("./commands/emit.ts");
			await mod.default(rest, json);
			break;
		}
		case "schema": {
			const mod = await import("./commands/schema.ts");
			await mod.default(rest, json);
			break;
		}
		case "validate": {
			const mod = await import("./commands/validate.ts");
			await mod.default(rest, json);
			break;
		}
		case "import": {
			const mod = await import("./commands/import.ts");
			await mod.default(rest, json);
			break;
		}
		case "sync": {
			const mod = await import("./commands/sync.ts");
			await mod.default(rest, json);
			break;
		}
		case "stats": {
			const mod = await import("./commands/stats.ts");
			await mod.default(rest, json);
			break;
		}
		default: {
			if (json) {
				jsonOut({ success: false, error: `Unknown command: ${command}` });
			} else {
				errorOut(`Unknown command: ${command}\nRun "cn --help" for usage.`);
			}
			throw new ExitError(1);
		}
	}
}

run().catch((err: unknown) => {
	// ExitError: message already printed, just exit with the code
	if (err instanceof ExitError) {
		process.exit(err.exitCode);
	}
	const msg = err instanceof Error ? err.message : String(err);
	if (json) {
		jsonOut({ success: false, error: msg });
	} else {
		errorOut(`Error: ${msg}`);
	}
	process.exit(1);
});

function printHelp() {
	console.log(`cn v${VERSION} — Git-native prompt management

Usage: cn <command> [options]

Prompt Commands:
  init                   Initialize .canopy/ in current directory
  create                 Create a new prompt
  show <name>[@v]        Show prompt record
  list                   List prompts
  update <name>          Update a prompt (creates new version)
  archive <name>         Archive a prompt
  render <name>[@v]      Render full prompt (resolve inheritance)
  tree <name>            Show inheritance tree
  history <name>         Show version timeline
  diff <name> <v1> <v2>  Section-aware diff between two versions
  pin <name>@<version>   Pin prompt to a specific version
  unpin <name>           Remove version pin

Emit Commands:
  emit <name>            Render and write prompt to a file
  emit --all             Emit all active prompts
  emit --check           Check if emitted files are up to date

Schema Commands:
  schema create          Create a validation schema
  schema show <name>     Show schema details
  schema list            List all schemas
  schema rule add <name> Add a validation rule

Validation:
  validate <name>        Validate a prompt against its schema
  validate --all         Validate all prompts with schemas

Utility:
  stats                  Show prompt statistics
  sync                   Stage and commit .canopy/ changes
  import <path>          Import an existing .md file

Global Options:
  --json                 Output as JSON
  --help                 Show this help
  --version              Show version`);
}
