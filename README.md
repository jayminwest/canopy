# Canopy

[![CI](https://img.shields.io/github/actions/workflow/status/jayminwest/canopy/ci.yml?branch=main)](https://github.com/jayminwest/canopy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)
[![GitHub release](https://img.shields.io/github/v/release/jayminwest/canopy)](https://github.com/jayminwest/canopy/releases)

Git-native prompt management for AI agent workflows. Minimal dependencies, JSONL storage, Bun runtime.

Agents accumulate dozens of prompt files that share 60%+ identical content. Canopy fixes this: prompts are composed via sections and inheritance, versioned automatically, validated against schemas, and emitted to plain `.md` for downstream consumption. No duplication, no drift.

## Install

```bash
# Clone the repository
git clone https://github.com/jayminwest/canopy.git
cd canopy

# Link the CLI globally
bun link
```

## Quick Start

```bash
cn init                                          # Create .canopy/ in your project
cn create --name base-agent \
  --section role="You are a helpful assistant" \
  --section constraints="Follow all safety guidelines"
cn create --name reviewer --extends base-agent \
  --section role="You are a code reviewer"       # Inherits constraints from base
cn render reviewer                               # Resolve inheritance, output sections
cn emit --all                                    # Write all prompts to agents/*.md
```

## How It Works

```
1. cn init                → Creates .canopy/ with JSONL files and config
2. cn create / cn update  → Prompts stored as versioned JSONL records
3. cn render              → Inheritance resolved, sections composed
4. cn emit                → Plain .md files written for agent consumption
5. git push               → Teammates get the same prompts, diffable in PRs
```

Prompts are **composed, not duplicated**. A child prompt inherits all sections from its parent and can override, append, or remove individual sections. Up to 5 levels deep with circular reference detection.

## What's in `.canopy/`

```
.canopy/
├── config.yaml          # Project config (project name, version, emitDir)
├── prompts.jsonl        # All prompt records with full version history
├── schemas.jsonl        # Validation schema definitions
└── .gitignore           # Ignores *.lock files
```

Everything is git-tracked. JSONL is diffable, mergeable (`merge=union` gitattribute), and append-friendly.

## CLI Reference

### Prompt Commands

| Command | Description |
|---------|-------------|
| `cn init` | Initialize `.canopy/` in current directory |
| `cn create --name <text>` | Create a new prompt (`--description`, `--extends`, `--tag`, `--status`, `--section name=body`) |
| `cn show <name>[@version]` | Show prompt record |
| `cn list` | List prompts (`--tag`, `--status`, `--extends` filters) |
| `cn update <name>` | Update a prompt — creates new version (`--section`, `--add-section`, `--remove-section`, `--tag`, `--untag`, `--description`, `--schema`, `--extends`, `--status`, `--name`) |
| `cn archive <name>` | Soft-delete a prompt |
| `cn render <name>[@version]` | Resolve inheritance, output sections (`--format md\|json`) |
| `cn tree <name>` | Show inheritance tree |
| `cn history <name>` | Show version timeline (`--limit`) |
| `cn diff <name> <v1> <v2>` | Section-aware diff between two versions |
| `cn pin <name>@<version>` | Pin prompt to a specific version |
| `cn unpin <name>` | Remove version pin |

### Emit Commands

| Command | Description |
|---------|-------------|
| `cn emit <name>` | Render and write prompt to file (`--out`, `--force`) |
| `cn emit --all` | Emit all active prompts (`--out-dir`, `--force`, `--dry-run`) |
| `cn emit --check` | Check if emitted files are up to date (CI use) |

### Schema & Validation

| Command | Description |
|---------|-------------|
| `cn schema create --name <text>` | Create validation schema (`--required`, `--optional` sections) |
| `cn schema show <name>` | Show schema details |
| `cn schema list` | List all schemas |
| `cn schema rule add <name>` | Add validation rule (`--section`, `--pattern`, `--message`) |
| `cn validate <name>` | Validate a prompt against its schema |
| `cn validate --all` | Validate all prompts with schemas |

### AI Agent Integration

| Command | Description |
|---------|-------------|
| `cn prime` | Output workflow context for AI agents (`--compact`, `--export`) |
| `cn onboard` | Add canopy section to CLAUDE.md (`--check`, `--stdout`) |

### Utility

| Command | Description |
|---------|-------------|
| `cn import <path>` | Import `.md` file as prompt (`--name`, `--no-split`, `--tag`); splits on `##` by default |
| `cn stats` | Show active/draft/archived counts |
| `cn sync` | Stage and commit `.canopy/` changes (`--status`) |
| `cn doctor` | Check project health and data integrity (`--fix`, `--verbose`) |
| `cn upgrade` | Upgrade canopy to the latest npm version (`--check`) |

### Global Options

| Flag | Description |
|------|-------------|
| `--json` | Structured JSON output (all commands) |
| `-q`, `--quiet` | Suppress non-error output |
| `--verbose` | Extra diagnostic output |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |

## Composition Model

Single inheritance with section-level control:

```
base-agent (sections: role, capabilities, workflow, constraints)
  └── reviewer (overrides: role, capabilities; inherits: workflow, constraints)
        └── senior-reviewer (overrides: role; inherits: everything else)
```

**Resolution rules:**
1. Start with parent's rendered sections (recursive)
2. Child section with same name **overrides** parent's
3. Child section with new name **appends**
4. Empty body (`body: ""`) **removes** inherited section

## Concurrency & Multi-Agent Safety

Canopy uses advisory file locking and atomic writes — the same patterns proven in [mulch](https://github.com/jayminwest/mulch) and [seeds](https://github.com/jayminwest/seeds).

- **Advisory locks**: `.jsonl.lock` files with `O_CREAT|O_EXCL`, 50ms polling, 5s timeout, 30s stale cleanup
- **Atomic writes**: Write to temp file, rename over original (POSIX atomic)
- **Git merge**: `merge=union` in `.gitattributes` — parallel branches append-merge without conflicts
- **Dedup on read**: Highest version per ID wins, handles union merge duplicates

## Design Principles

- **JSONL is the database** — No binary files, no export pipeline
- **Minimal dependencies** — chalk + commander only
- **Concurrent-safe** — Advisory locks + atomic writes
- **Git-native** — `merge=union` handles parallel merges, dedup on read
- **Prompts are composed** — Inheritance eliminates duplication
- **Emit to plain files** — Canopy is source of truth, tools consume `.md`

## Development

```bash
# Run tests (92 tests across 13 files)
bun test

# Lint + format check
bun run lint

# Type check
bun run typecheck

# All quality gates
bun test && bun run lint && bun run typecheck
```

### Versioning

Version is maintained in two places that must stay in sync:

1. `package.json` — `"version"` field
2. `src/index.ts` — `VERSION` constant

Use the bump script to update both:

```bash
bun run version:bump <major|minor|patch>
```

Version bumps pushed to `main` trigger the publish workflow: npm publish with provenance, git tag, and GitHub release.

## Project Structure

```
canopy/
  src/
    index.ts               CLI entry point (command router)
    types.ts               Data models
    store.ts               JSONL I/O, locking, atomic writes
    render.ts              Inheritance resolution engine
    validate.ts            Schema validation
    config.ts              YAML config loading
    output.ts              JSON/human output formatting
    yaml.ts                Minimal YAML parser
    id.ts                  ID generation
    markers.ts             Marker-based section management for CLAUDE.md
    commands/              One file per CLI subcommand (22 commands)
  scripts/
    version-bump.ts        Atomic version management
  .canopy/                 On-disk data store
  .github/workflows/       CI + npm publish
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on setting up a development environment, coding conventions, and submitting pull requests.

For security issues, see [SECURITY.md](SECURITY.md).

## License

MIT
