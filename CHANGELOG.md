# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
