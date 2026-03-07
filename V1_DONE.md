# Canopy — V1 Scope

## One-Liner
Git-native prompt management with section-based composition and inheritance — create, version, validate, and emit prompts as plain files for AI agent consumption.

## V1 Definition of Done

### Prompt CRUD
- [x] `cn create` — creates prompts with sections, tags, schemas, emit overrides, frontmatter
- [x] `cn show [name|name@version]` — displays raw prompt records
- [x] `cn list` — lists prompts with filtering (--tag, --status, --extends)
- [x] `cn update` — creates new versions (supports --section, --add-section, --remove-section, --tag, --untag, --schema, --extends, --name, --status, --emit-as, --fm, --remove-fm)
- [x] `cn archive` — soft-deletes prompts

### Inheritance & Composition
- [x] `cn render` — resolves inheritance, outputs merged sections (--format md|json)
- [x] Single-level inheritance via `extends` field; child sections override or extend parent
- [x] Depth limit: 5 levels enforced at render time (MAX_DEPTH=5 in render.ts)
- [x] Circular reference detection with descriptive error ("Circular inheritance: A → B → A")
- [x] Section override/append/inherit semantics fully implemented
- [x] Child can remove inherited sections via `cn update --remove-section <name>` (empty body = omit)

### Versioning & History
- [x] `cn history [name]` — shows all versions with timestamps
- [x] `cn diff <name> <v1> <v2>` — section-aware diff (JSON mode shows added/modified/removed)
- [x] `cn pin <name>@<version>` — locks to specific version (stored in prompt metadata)
- [x] `cn unpin [name]` — removes pin
- [x] Version pinning respected by render/emit commands

### Emit Pipeline
- [x] `cn emit <name>` — renders and writes to file (respects emitDir/emitAs per prompt)
- [x] `cn emit --all` — bulk emit all active prompts
- [x] `cn emit --check` — validates emitted files are up-to-date (exit code 1 if stale, for CI)
- [x] `.md` output format (default)
- [x] `.ts` (TypeScript module) output format when `emitAs` ends in `.ts`
- [x] Named emit targets: config `targets` section with tag-based routing (dir, default, tags)
- [x] Legacy `emitDir`/`emitDirByTag` config auto-converts to named targets on load

### Frontmatter (YAML Metadata)
- [x] Extracted from markdown imports (`extractFrontmatter` in import.ts)
- [x] Stored in prompt records (`frontmatter` field)
- [x] Rendered in emit output (YAML block before markdown content)
- [x] `--fm key=value` flag for `cn create`/`cn update` (repeatable)
- [x] `--remove-fm key` to delete individual frontmatter keys

### Schema Validation
- [x] `cn schema create --name <text>` — creates schema with required/optional sections
- [x] `cn schema show [name]` — displays schema
- [x] `cn schema list` — lists all schemas
- [x] `cn schema rule add <schema-name>` — adds regex validation rules (section, pattern, message)
- [x] `cn validate [name]` — validates prompt against its schema
- [x] `cn validate --all` — bulk validation

### Import
- [x] `cn import <path>` — converts markdown file to canopy prompt
- [x] Auto-splits on `##` headers into named sections (configurable with --no-split)
- [x] Extracts YAML frontmatter from markdown before splitting
- [x] Section names derived from headings (lowercased, spaces → hyphens)

### Git Integration
- [x] `cn sync` — stages and commits `.canopy/` changes
- [x] `.gitattributes` configured for union merge strategy on `prompts.jsonl`, `schemas.jsonl`
- [x] Dedup-on-read handles parallel branch merges (last-write-wins by ID+version)

### Agent Integration
- [x] `cn prime` — outputs workflow context (list, create, emit, validation examples) for agents
- [x] `cn onboard` — installs canopy section into CLAUDE.md

### Utility Commands
- [x] `cn tree [name]` — shows inheritance tree (parent + children)
- [x] `cn stats` — prompt statistics (active/draft/archived counts)
- [x] `cn doctor` — diagnostic checks (.canopy/ integrity, file permissions, data consistency)
- [x] `cn upgrade` — self-upgrade mechanism
- [x] `cn completions` — shell completions (bash/zsh)
- [x] `cn init` — initializes .canopy/ directory

### CLI Standards
- [x] `--json` flag produces structured output on all commands
- [x] Global flags: `-v/--version`, `-q/--quiet`, `--verbose`, `--timing`
- [x] ANSI colors with NO_COLOR environment variable support
- [x] Human-readable non-JSON output with error recovery suggestions

### Quality Gates
- [x] All 257 tests pass across 22 test files (`bun test`)
- [x] TypeScript strict mode clean (`bun run typecheck`)
- [x] Linting passes from canonical directory (`bun run lint`)
- [x] CI pipeline runs lint + typecheck + test on push/PR to main (actions/checkout@v6)
- [x] Published to npm as `@os-eco/canopy-cli` at v0.2.2

## Explicitly Out of Scope for V1

- LLM-powered prompt optimization or rewriting
- A/B testing or prompt experimentation framework
- Remote prompt registry or sharing
- Prompt analytics (usage tracking, performance metrics)
- Visual prompt editor or web UI
- Conditional sections (if/else logic in prompts)
- Template variable interpolation (mustache/handlebars-style `{{var}}` substitution) — tracked separately in `greenhouse-04a7`
- Multi-repo prompt federation
- Prompt dependency graph beyond single-level inheritance
- Auto-versioning based on git commits
- JSONL garbage collection / compaction (version history is intentionally append-only for audit trail)

## Current State

Canopy is **V1-complete**. All 22 CLI commands are implemented and tested (archive, completions, create, diff, doctor, emit, history, import, init, list, onboard, pin, prime, render, schema, show, stats, sync, tree, update, upgrade, validate). 257 tests pass with zero failures across 22 test files. Lint and typecheck are clean. CI is green. Published to npm at v0.2.2.

The tool handles the full prompt lifecycle: create, compose via inheritance, version, validate against schemas, emit to files, and integrate with agents. The emit pipeline supports both markdown and TypeScript module output.

**Estimated completion: ~98-99%.** Fully functional for all V1 scope items.

### Infrastructure Notes

**Concurrent safety**: Advisory file locks (`.canopy/*.jsonl.lock`) with 30-second stale detection, 5-second timeout, and POSIX atomic writes (tmp+rename). Same pattern proven in production across seeds and mulch.

**JSONL growth**: Append-only by design. Version history is the append log; no cleanup mechanism exists. ~27 prompt records after 6 weeks of development — growth rate is manageable.

**Config format**: Legacy `emitDir`/`emitDirByTag` formats auto-convert to named `targets` on load. Canonical `.canopy/config.yaml` still uses legacy format; it upgrades transparently on next `cn sync`.

**Inheritance depth**: 5-level limit is hardcoded in render.ts. No production use case has exceeded 3 levels in 176 commits of development. Sufficient for V1.

**Lint from worktrees**: `bun run lint` fails when run from inside `.overstory/` worktrees due to nested biome.json conflicts — this is an ecosystem-wide tooling issue, not a canopy bug. Lint passes when run from the canonical project root.

**TypeScript emit**: Backtick double-escaping edge case (code blocks in prompts emitted as `.ts`) was fixed in v0.2.2.

## Open Questions

- **Template variable interpolation** (`{{var}}`): Explicitly out of scope here, but greenhouse's supervisor prompt needs it (see `greenhouse-04a7`). Should canopy own variable substitution, or should consumers handle it at render time?
- **Max inheritance depth**: The current 5-level limit is sufficient for V1 real-world usage (max observed: 3 levels). Should it be made configurable, or documented as a hard constraint in help text and SPEC?
- **JSONL garbage collection**: Append-only growth is intentional for full audit trail. Is compaction of old/unreferenced versions ever needed, or is current growth rate acceptable long-term?
