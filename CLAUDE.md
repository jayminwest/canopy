# Canopy

Git-native prompt management for AI agent workflows. Zero dependencies, JSONL storage, Bun runtime.

## Quick Reference

- **Runtime:** Bun (TypeScript)
- **Storage:** JSONL files (one per record type)
- **CLI prefix:** `cn`
- **Spec:** See `SPEC.md` for full design

## Project Structure

```
.canopy/           # On-disk data (prompts.jsonl, schemas.jsonl, config.yaml)
src/               # Source code (Bun/TypeScript)
SPEC.md            # Detailed specification
```

## Conventions

- Zero runtime dependencies — Bun built-ins only
- Concurrent-safe: advisory file locks + atomic writes
- Git-native: JSONL is diffable/mergeable, `merge=union` gitattribute
- All CLI commands support `--json` flag
- Prompts are composed via sections and inheritance, not duplicated
- `cn emit` renders to plain `.md` for downstream consumption
