# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.8] - 2026-02-25

### Added
- Per-prompt `--emit-dir` flag on `cn create` and `cn update` — routes individual prompts to a custom output directory
- Tag-based emit routing via `emitDirByTag` config — map tags to output directories (e.g., `slash-command: .claude/commands`)
- `resolveEmitDir()` function in `emit.ts` — centralizes emit directory resolution with priority: per-prompt > tag-based > global > default
- One-level nested map support in YAML parser (`parseYaml` / `serializeYaml`) for `emitDirByTag` config
- Tests for `resolveEmitDir` (6 unit tests) and emit routing integration (5 tests covering tag routing, per-prompt override, `--out-dir` override, `--dry-run`, `--check`)
- Tests for nested YAML parsing and serialization (8 tests)

### Changed
- `cn emit` now resolves output directory per-prompt instead of using a single global directory
- `cn doctor` emit staleness check respects per-prompt routing
- YAML parser upgraded from flat key-value only to support one-level nested maps

## [0.1.7] - 2026-02-25

### Added
- Integration tests for `update` command (22 tests covering section add/remove/replace, tags, description, rename, status, schema, extends)
- Integration tests for `sync` command (git repo setup, staging, commit verification)
- Concurrent lock access tests for `store.ts` (5 parallel acquire/write operations)
- Integration tests for `show` command (name lookup, `--json` output, not-found handling)
- Integration tests for `list` command (filtering by tag, status, extends; archived visibility)
- Integration tests for `archive` command (archive/unarchive, not-found, `--json`)
- Integration tests for `pin`/`unpin` commands (pin to version, resolve pinned, unpin, `--json`)
- Integration tests for `history` command (version timeline, `--limit`, `--json`)
- Integration tests for `tree` command (inheritance tree rendering, cycle detection, `--json`)

## [0.1.6] - 2026-02-24

### Added
- `cn doctor` command — checks project health and data integrity (config, JSONL integrity, schema validation, inheritance chains, emit staleness, stale locks, version sync) with `--fix` and `--verbose` flags
- `cn upgrade` command — upgrades canopy to the latest npm version (`--check` for dry-run)
- Global `--quiet` / `-q` flag — suppresses non-error output across all commands
- Global `--verbose` flag — enables extra diagnostic output
- Rich `--version --json` output — returns name, version, runtime, and platform metadata
- `setQuiet()` function in `output.ts` for programmatic quiet mode control

## [0.1.5] - 2026-02-24

### Added
- Brand palette in `output.ts` (`palette.brand`, `palette.accent`, `palette.muted`) with deep green, amber, and stone gray colors
- Status icons (`icons.pending`, `icons.active`, `icons.done`, `icons.blocked`) for terminal-compatible list indicators
- Message format helpers (`fmt.success`, `fmt.error`, `fmt.warning`, `fmt.id`, `fmt.info`) for consistent CLI output
- Style A custom help screen on `cn --help` with brand colors, structured command listing, and argument display

### Changed
- All 12 command files migrated from inline color calls to `fmt.*` / `icons.*` helpers for consistent visual output
- `c.green` now maps to `palette.brand` (deep green) instead of plain chalk green
- `c.yellow` now maps to `palette.accent` (amber) instead of plain chalk yellow

## [0.1.4] - 2026-02-24

### Added
- `--add-section` and `--remove-section` flags are now repeatable in `cn update` — add/remove multiple sections in a single command

### Fixed
- `--remove-section` splices section out entirely for non-inheriting prompts (previously set empty body for all prompts)
- `cn init` checks for canopy-specific path in `.gitattributes` instead of broad `merge=union` string (avoids skipping setup when other tools already have merge=union)
- `package.json` formatted for biome 2.4.4 compatibility

### Changed
- Package renamed to `@os-eco/canopy-cli` with npm publish config (`main`, `files`, `publishConfig`)
- CI: replaced auto-tag workflow with npm publish workflow (version-check, publish with provenance, auto-tag, GitHub release)

## [0.1.3] - 2026-02-24

### Added
- `cn prime` command — outputs workflow context for AI agent sessions (`--compact`, `--export`, custom `PRIME.md` support)
- `cn onboard` command — adds canopy section to CLAUDE.md for AI agent discovery (`--check`, `--stdout`)
- `src/markers.ts` — marker-based section management for CLAUDE.md onboarding (start/end markers, version detection, replace)
- `chalk` dependency for colorized terminal output with automatic `NO_COLOR` and TTY detection
- `commander` dependency for structured CLI argument parsing
- AGENTS.md file for multi-agent coordination context

### Changed
- Migrated entire CLI from custom arg-parsing router to Commander register pattern — each command exports `register(program)`
- `src/index.ts` rewritten: Commander-based entry point with typed options, replaces manual `switch` dispatch
- `src/output.ts` now uses chalk for color helpers (`c.bold`, `c.dim`, `c.green`, `c.red`, `c.yellow`, `c.cyan`, `c.blue`)
- No longer zero-dependency — chalk and commander are now runtime dependencies
- CLAUDE.md updated with canopy onboarding section

### Fixed
- `--body` support wired into `--add-section` for `cn update` command (body was declared but never assigned)
- `cn import` now preserves original section heading casing (was lowercasing)
- `Record<string, unknown>` type annotations added to Commander action `opts` params (fixes TypeScript strict mode)

### Removed
- `.beads/` directory and all bead-related configuration

## [0.1.2] - 2026-02-23

### Added
- `--help` / `-h` flag on all subcommands (archive, create, diff, emit, history, import, init, list, pin, unpin, render, schema, show, stats, sync, tree, update, validate)
- `--description` flag for `cn create` and `cn update`
- `description` field on the `Prompt` type
- `cn show` displays description when present
- README with full CLI reference, composition model docs, and development guide

### Fixed
- All remaining `process.exit()` calls replaced with `ExitError` (prevents error duplication in lock-guarded blocks)
- `cn import` now splits on `##` headings by default (`--no-split` to disable, replacing `--split`)
- Unused import cleanup (`dedupById` in diff.ts, `Section` in update.ts, `errorOut` in list.ts, `join` in sync.ts)
- Import statement ordering to satisfy Biome linter

### Changed
- `@biomejs/biome` upgraded from 1.9.4 to 2.4.4
- `biome.json` updated for v2 configuration format

## [0.1.1] - 2026-02-23

### Added
- `--section name=body` shorthand for `cn create` and `cn update`
- `ExitError` class for safe error exits inside lock-guarded blocks
- Open source governance: LICENSE (MIT), CONTRIBUTING.md, SECURITY.md, CODEOWNERS
- GitHub templates: bug report, feature request, PR template, dependabot, funding
- Package metadata: description, keywords, author, license, repository, engines

### Fixed
- `cn emit --check` now implies `--all` (previously required both flags)
- `cn emit` resolves pinned versions correctly (uses full record history)
- `cn schema create` accumulates `--required`/`--optional` sections instead of replacing
- Lock files are always released on error (ExitError replaces `process.exit` in guarded blocks)

### Changed
- CI workflows updated to `actions/checkout@v6`

## [0.1.0] - 2026-02-23

### Added
- Initial release
- Prompt CRUD (`cn create`, `cn show`, `cn list`, `cn update`, `cn archive`)
- Section-based composition with single inheritance (`extends`)
- Section removal via empty body override
- Version history with structured diffing (`cn history`, `cn diff`)
- Version pinning (`cn pin`, `cn unpin`)
- Schema validation with required sections and regex rules
  (`cn schema create/show/list/rule`, `cn validate`)
- Emit to plain `.md` files (`cn emit`, `cn emit --all`, `cn emit --check`)
- Import from existing `.md` files with auto-split by `##` headings (`cn import`)
- Inheritance tree visualization (`cn tree`)
- Project statistics (`cn stats`)
- Advisory file locking for concurrent access (30s stale, 5s timeout, 50ms retry)
- Atomic writes with dedup-on-read (highest version per ID wins)
- YAML config (`config.yaml`), JSONL storage (`prompts.jsonl`, `schemas.jsonl`)
- `merge=union` gitattributes for parallel branch merges
- `cn sync` — stage and commit `.canopy/` changes
- `--json` flag on all commands for structured output
- Zero runtime dependencies (Bun built-ins only)
- `scripts/version-bump.ts` for atomic version management
- CI: lint + typecheck + test, auto-tag on version bump

### Fixed
- Added `.beads` and `.claude` to biome.json ignore patterns
