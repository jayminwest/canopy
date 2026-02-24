import { join } from "node:path";
import { jsonOut } from "../output.ts";

const PRIME_FILE = "PRIME.md";

function defaultPrimeContent(compact: boolean): string {
	if (compact) {
		return compactContent();
	}
	return fullContent();
}

function compactContent(): string {
	return `# Canopy Quick Reference

\`\`\`
cn list                   # List all prompts
cn show <name>            # View prompt record
cn render <name>          # Render prompt (resolve inheritance)
cn emit <name>            # Render and write to file
cn emit --all             # Emit all active prompts
cn create --name "..."    # Create a new prompt
cn update <name>          # Update prompt (new version)
cn import <path>          # Import existing .md as prompt
cn sync                   # Stage + commit .canopy/
\`\`\`

**Do not manually edit emitted files.** Use \`cn update\` to modify prompts.
`;
}

function fullContent(): string {
	return `# Canopy Workflow Context

> **Context Recovery**: Run \`cn prime\` after compaction, clear, or new session

## Core Rules
- **Storage**: Prompts live in \`.canopy/prompts.jsonl\` — never edit this file by hand
- **Emit files are generated**: Do NOT manually edit files in the emit directory; use \`cn update\` instead
- **Composition**: Prompts are composed via sections and inheritance, not duplicated
- **Git-native**: JSONL storage is diffable/mergeable; \`merge=union\` gitattribute handles branch merges

## Essential Commands

### Viewing Prompts
- \`cn list\` — List all prompts (name, version, status, tags)
- \`cn show <name>\` — Show full prompt record (sections, metadata)
- \`cn show <name>@<v>\` — Show specific version
- \`cn render <name>\` — Render full prompt (resolves inheritance chain)
- \`cn tree <name>\` — Show inheritance tree
- \`cn history <name>\` — Show version timeline
- \`cn diff <name> <v1> <v2>\` — Section-aware diff between versions

### Creating & Updating
- \`cn create --name "..." --section "role:You are..." --tag agent\` — Create prompt
- \`cn update <name> --section "role:Updated content"\` — Update (creates new version)
- \`cn import <path>\` — Import existing .md file as a prompt
- \`cn archive <name>\` — Archive a prompt

### Emitting
- \`cn emit <name>\` — Render and write prompt to a file
- \`cn emit --all\` — Emit all active prompts
- \`cn emit --check\` — Check if emitted files are up to date

### Schemas & Validation
- \`cn schema create --name "..." --required "role,task"\` — Create validation schema
- \`cn validate <name>\` — Validate prompt against its schema
- \`cn validate --all\` — Validate all prompts with schemas

### Versioning
- \`cn pin <name>@<version>\` — Pin prompt to a specific version
- \`cn unpin <name>\` — Remove version pin

### Sync
- \`cn sync\` — Stage and commit .canopy/ changes

## Common Workflows

**Viewing what's available:**
\`\`\`bash
cn list                               # See all prompts
cn render <name>                      # See full rendered output
cn tree <name>                        # Understand inheritance
\`\`\`

**Creating a new prompt:**
\`\`\`bash
cn create --name "agent-v1" --section "role:You are a helpful assistant" --tag agent
cn emit agent-v1                      # Write to agents/agent-v1.md
cn sync                               # Commit changes
\`\`\`

**Updating an existing prompt:**
\`\`\`bash
cn show <name>                        # Review current state
cn update <name> --section "role:Updated instructions"
cn emit <name>                        # Re-emit with changes
cn sync                               # Commit changes
\`\`\`

**Importing from an existing file:**
\`\`\`bash
cn import path/to/prompt.md           # Import as canopy prompt
cn emit <name>                        # Verify emit output
\`\`\`
`;
}

export default async function prime(args: string[], json: boolean): Promise<void> {
	if (args.includes("--help") || args.includes("-h")) {
		process.stdout.write(`Usage: cn prime [options]

Outputs canopy workflow context for AI agent sessions.

Options:
  --compact   Output minimal quick-reference
  --export    Output default template (ignores custom PRIME.md)
  --json      Output as JSON
`);
		return;
	}

	const compact = args.includes("--compact");
	const exportMode = args.includes("--export");

	// --export always outputs the default template
	if (exportMode) {
		const content = defaultPrimeContent(false);
		if (json) {
			jsonOut({ success: true, command: "prime", content });
		} else {
			process.stdout.write(content);
		}
		return;
	}

	// Try to find .canopy dir for custom PRIME.md
	let content: string | null = null;
	try {
		const canopyDir = join(process.cwd(), ".canopy");
		const customFile = Bun.file(join(canopyDir, PRIME_FILE));
		if (await customFile.exists()) {
			content = await customFile.text();
		}
	} catch {
		// No .canopy dir — that's fine, use default
	}

	if (!content) {
		content = defaultPrimeContent(compact);
	}

	if (json) {
		jsonOut({ success: true, command: "prime", content });
	} else {
		process.stdout.write(content);
	}
}
