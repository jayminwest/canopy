---
name: canopy-prompt-workflow
description: Compose a canopy prompt by inheriting from a base prompt and emit the rendered result. Use when an agent needs to author, update, or render canopy prompts inside this repo.
tools:
  - bun
  - git
inputs:
  - prompt-name (kebab-case, e.g. `builder-agent`)
  - parent-name (optional; defaults to no inheritance)
outputs:
  - new or updated record appended to `.canopy/prompts.jsonl`
  - rendered `.md` file under the configured emit target (if `cn emit` is run)
---

# canopy-prompt-workflow

Use this skill when you are an agent working inside the canopy repo and
you need to **compose a new prompt by inheritance, then emit the
rendered result to disk**. It encodes the canonical prompt-authoring
loop documented in `SPEC.md` so an agent can do it from a cold start
without re-reading the full design record.

## Pre-flight

The repo must already be initialised. Verify:

```bash
ls .canopy/                       # config.yaml + prompts.jsonl + schemas.jsonl
bunx cn doctor                    # exits 0 when the store is healthy
```

If `.canopy/` is missing, run `bunx cn init` first. If `cn doctor`
reports problems, fix them (or escalate) before continuing — never
hand-edit `.canopy/prompts.jsonl` to "fix" things; use `cn` commands so
locks + atomic writes are honoured.

## Procedure

### 1. Decide the prompt's shape

A canopy prompt is a JSONL record with named sections. Before touching
the CLI, write down:

- The prompt's stable `name` (kebab-case, must be unique in the store).
- Its **parent** (the `extends:` target), if it inherits. Pick the
  most specific base whose sections you want to inherit.
- The minimum set of `sections` (`name`, `body`, optional `required`)
  the new prompt adds or overrides. Inheriting sections is preferred
  over duplicating them — that is the whole point of canopy.
- The `schema` it should validate against, if any (see
  `.canopy/schemas.jsonl`).

### 2. Inspect existing prompts

```bash
bun run src/index.ts list                   # lists all prompts
bun run src/index.ts show <parent-name>     # see the parent's sections
bun run src/index.ts tree <parent-name>     # full inheritance tree
```

If a sibling prompt already does most of what you want, extend it
instead of forking — every duplicated section is one more place a
future edit will drift.

### 3. Create or update the prompt

To **create** a new prompt by inheritance:

```bash
bun run src/index.ts create \
  --name <prompt-name> \
  --extends <parent-name> \
  --section role:"You are ..." \
  --section constraints:"- Never push to canonical branch"
```

To **update** an existing prompt (appends a new version; never
overwrites):

```bash
bun run src/index.ts update <prompt-name> \
  --section quality-gates:"Run bun test, bun run lint, bun run typecheck before closing."
```

`cn create` and `cn update` both append to `.canopy/prompts.jsonl`
through `src/store.ts` (advisory file lock + atomic write). Two agents
in different worktrees can run them concurrently.

### 4. Render and validate

Before emitting, confirm the rendered prompt resolves cleanly:

```bash
bun run src/index.ts render <prompt-name>             # human-readable
bun run src/index.ts render <prompt-name> --json      # for inspection
bun run src/index.ts validate <prompt-name>           # against its schema
```

`cn render` resolves the inheritance chain (last-write wins per
section name) and prints the merged record. `cn validate` reports any
missing required sections or rule-pattern violations.

### 5. Emit to disk

```bash
bun run src/index.ts emit <prompt-name>               # one prompt
bun run src/index.ts emit --all                       # everything
```

`cn emit` resolves each prompt's target directory in this order:

1. Per-prompt `emitDir` override (if set in frontmatter).
2. First target in `.canopy/config.yaml` whose `tags:` match one of the
   prompt's tags.
3. The target marked `default: true` in `.canopy/config.yaml`.
4. Fallback to `agents/`.

By default canopy emits `.md`; if the resolved target's `emitAs` ends
in `.ts`, the prompt is rendered as a TypeScript string export
instead. **Do not manually edit emitted files** — they are the
projection of the JSONL store and will be overwritten on the next
`cn emit`.

### 6. Stage and commit

```bash
bun run src/index.ts sync                             # stages .canopy/ + emitted files
git diff --cached                                     # review the additions
git commit -m "prompts: add <prompt-name> (extends <parent-name>)"
```

`cn sync` is preferred over `git add .canopy/` because it also stages
the configured emit-target directories so the JSONL truth and the
rendered files stay in lockstep.

## Acceptance

The skill is complete when **all** of the following hold:

- `bun run src/index.ts list` shows `<prompt-name>`.
- `bun run src/index.ts render <prompt-name>` exits 0 and prints the
  merged sections.
- `bun run src/index.ts validate <prompt-name>` exits 0.
- The rendered `.md` (or `.ts`) appears under the resolved target
  directory.
- `git status` is clean after `git commit` lands.
- `bun run check:agents` and `bun run gen:docs:check` still exit 0.

## Failure modes

| Symptom | Likely cause | Remedy |
|---------|--------------|--------|
| `cn render` errors "prompt not found" | Misspelled name, or you ran `cn create` from a directory without `.canopy/`. | Re-run from canopy repo root; double-check the name. |
| `cn validate` reports missing required section | Schema's `requiredSections` not satisfied by the merged result. | Add the missing section via `cn update`, then re-validate. |
| `cn emit` writes to the wrong directory | Target-resolution order picked the wrong target. | Add explicit `tags:` to the prompt or set `emitDir` in frontmatter. |
| Concurrent edits collide | Two agents wrote at once and `cn` couldn't acquire the advisory lock. | Re-run the failed command; the lock is short-lived and the write is atomic, so a retry is safe. |

## Further reading

- `SPEC.md` — canopy's V1 design record (sections, inheritance,
  storage, lifecycle).
- `README.md` — user-facing pitch and command examples.
- `docs/cli-reference.md` — auto-generated reference for every `cn`
  subcommand.
- `docs/architecture.mmd` — flowchart of the prompt-resolution path.
- `AGENTS.md` — repo-wide conventions and quality gates.
