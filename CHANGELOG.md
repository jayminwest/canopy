# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
