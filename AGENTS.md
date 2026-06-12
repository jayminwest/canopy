# AGENTS.md

This file is the canonical entry point for AI coding agents working in
the canopy repo, following the [agents.md](https://agents.md)
convention. It mirrors the essentials from `CLAUDE.md`; when the two
disagree, `CLAUDE.md` is authoritative and this file should be updated
to match.

## What this project is

**Canopy** is git-native prompt management for AI agent workflows.
Prompts are structured records with composable sections, inheritance,
versioning, and schema validation. The JSONL file IS the database;
`cn emit` renders prompts to plain `.md` (or `.ts`) files for any
downstream tool to consume. Minimal runtime dependencies, advisory
file locks for concurrent agents, Bun runtime.

Canopy is part of the **os-eco** ecosystem alongside warren (control
plane), burrow (sandbox), plot (coordination), mulch (expertise), and
seeds (issue tracking). See `SPEC.md` for the full design record.

## Tech stack at a glance

- **Runtime:** Bun (runs TypeScript directly; no build step on the CLI).
- **Language:** TypeScript with strict mode (`noUncheckedIndexedAccess`,
  no `any`).
- **Lint / format:** Biome (`biome.json`). Errors fail CI; the
  `useFilenamingConvention` rule enforces kebab-case filenames.
- **Tests:** `bun test` discovers `*.test.ts` next to the file under
  test; configuration lives in `bunfig.toml`.
- **Storage:** JSONL files under `.canopy/` (one per record type,
  diffable / mergeable, `merge=union` gitattribute).
- **CLI:** `cn` (defined in `src/index.ts`, dispatched via
  [commander](https://github.com/tj/commander.js)).

## Project layout

```
canopy/
├── src/
│   ├── index.ts            # cn CLI entry point + Commander wiring
│   ├── commands/           # one file per subcommand
│   ├── render.ts           # inheritance resolution
│   ├── validate.ts         # schema validation
│   ├── store.ts            # JSONL read/write with advisory locks
│   ├── output.ts           # human + JSON output helpers
│   ├── frontmatter.ts      # YAML frontmatter renderer
│   ├── yaml.ts             # minimal built-in YAML parser
│   └── ...
├── scripts/                # quality-gate scripts (size, debt, coverage, …)
│   ├── check-all.ts            # canonical quiet runner (byte-identical fleet-wide)
│   ├── check-ci-parity.ts      # CI ⇄ check:all parity gate (byte-identical fleet-wide)
│   ├── ci-parity-config.json   # per-repo parity escape hatches (aliases / ciOnly)
│   ├── validate-agents-md.ts   # validates this file's references
│   ├── generate-cli-docs.ts    # emits docs/cli-reference.md
│   ├── check-file-sizes.ts
│   ├── check-debt-markers.ts
│   ├── check-coverage.ts
│   ├── report-test-timing.ts
│   └── report-quality-metrics.ts
├── budgets/                # ratchet budgets (coverage, file-size, debt)
├── docs/
│   ├── cli-reference.md    # auto-generated; do not edit
│   └── architecture.mmd    # mermaid service diagram
├── .canopy/                # canopy's own prompts (dogfood)
├── .factory/skills/        # repo-local agent skills
├── .github/workflows/      # ci.yml + publish.yml + auto-merge.yml
├── SPEC.md                 # V1 design record
├── README.md               # user-facing pitch
├── CHANGELOG.md            # release history
├── RUNBOOK.md              # release / triage / rollback procedures
├── biome.json
├── bunfig.toml
├── tsconfig.json
└── package.json
```

## Commands

All commands run from the repo root unless noted. Bun must be on
`PATH`.

```bash
bun install                       # install dependencies
bun test                          # run all tests
bun test src/render.test.ts       # run a single test file
bun run lint                      # biome check .
bun run lint:fix                  # biome check --write .
bun run typecheck                 # tsc --noEmit
bun run test:ci                   # bun test with coverage + junit reporters
```

Quality gates (each lives in `scripts/`):

```bash
bun run check:all                 # scripts/check-all.ts — canonical quiet runner (10 gates)
bun run verify                    # alias for check:all (agent-facing entry point)
bun run check:size                # scripts/check-file-sizes.ts
bun run check:debt                # scripts/check-debt-markers.ts
bun run check:dups                # jscpd duplication budget
bun run check:deps                # knip unused/undeclared dependencies
bun run check:coverage            # scripts/check-coverage.ts
bun run check:agents              # scripts/validate-agents-md.ts (this file)
bun run check:ci-parity           # scripts/check-ci-parity.ts — CI ⇄ check:all parity
bun run gen:docs                  # emit docs/cli-reference.md from src/index.ts
bun run gen:docs:check            # fail CI when docs/cli-reference.md is stale
bun run report:test-timing        # slowest suites/tests from junit.xml
bun run report:quality-metrics    # consolidated quality summary
```

`check:all` follows the os-eco check:all standard (see
check-all-standard.md under docs/ at the os-eco meta-repo root, not in
this repo): the ordered manifest
is `lint → typecheck → check:agents → check:dups → check:deps →
check:size → check:debt → gen:docs:check → check:coverage →
check:ci-parity`, with quiet one-line-per-gate output and a final
tally. `scripts/check-all.ts` and `scripts/check-ci-parity.ts` are
byte-identical fleet-wide — never edit them in place; per-repo
variation lives in `package.json` scripts and
`scripts/ci-parity-config.json`. `CHECK_ALL_VERBOSE=1` streams full
gate output; `--bail` stops at the first failure.

Each gate either passes silently or prints a remediation pointer. The
ratchet scripts (`check:size`, `check:debt`, `check:coverage`) read
JSON budgets from `budgets/`; the budgets are baselined from the
repo's current state and only tighten over time (size + debt move
down, coverage moves up).

CI invokes `bun run check:all` plus `bun run test:ci` (the same
tests+coverage gate with junit reporters) on every push to `main` and
every pull request (see `.github/workflows/ci.yml`); the
`check:ci-parity` gate proves CI and the local gate surface stay
equivalent.

User-facing `cn` reference:

```bash
bunx cn --help                    # top-level help
bunx cn <subcommand> --help       # per-command help
bunx cn list                      # invoke the CLI from a working tree
```

The full subcommand surface is auto-generated to `docs/cli-reference.md`
by `bun run gen:docs`; consult it when you forget a flag.

## Conventions

### Filenames & directories

- Source files: `kebab-case.ts`. Tests are `<name>.test.ts` next to the
  file under test (e.g., `src/render.test.ts`).
- Directories: `kebab-case` (`src/commands/`, `scripts/`).
- The filename rule is enforced by Biome's
  `style.useFilenamingConvention` (strict kebab-case) in `biome.json`.
- The illustrative placeholder `kebab-case.ts` may appear in this file
  only as a naming-convention example; it is not a real file.

### Identifiers

- `camelCase` for functions, variables, instance fields.
- `PascalCase` for types, interfaces, classes.
- `SCREAMING_SNAKE_CASE` for module-level constants that are true
  constants (e.g., a frozen registry, a version tuple).
- Booleans read as predicates: `isOpen`, `hasPreview`, `shouldRender`.

### TypeScript

- Strict mode with `noUncheckedIndexedAccess` — always handle possible
  `undefined` from indexing.
- No `any`; use `unknown` and narrow, or define a proper type.
- Import with explicit `.ts` extensions (Bun + Node ESM compatibility).
- Tab indentation, 100-char line width. Biome enforces both.
- Output goes through `src/output.ts` helpers (`humanOut`, `jsonOut`,
  `errorOut`, `palette`) so the `--json` flag behaves consistently
  across every subcommand. Never `console.log` directly from command
  handlers.

### Test naming

- `describe("<unitUnderTest>")` + `test("verb-led behaviour
  description")`. No `should`, no `it`.
- Co-locate tests with the file under test. Integration-style tests
  that span multiple modules still use the `*.test.ts` suffix.

### Debt markers

Every `TODO` / `FIXME` / `HACK` / `XXX` on a source line must carry a
tracker reference on the same line. Accepted prefixes:

- `canopy-XXXX` — repo-local tracker (mulch / seeds id).
- `mx-XXXX` — cross-repo mission tracker.
- `#NNN` — GitHub issue.
- A URL (any http link) — external reference.

`bun run check:debt` fails CI on bare markers.

### Log scrubbing

All structured output in canopy goes through `src/output.ts`. Sensitive
values that may appear in arguments or environment (e.g., `npm` tokens,
GitHub PATs, API keys) must never be printed in human or JSON output.

`src/output.ts` exports a `redact()` helper that is applied inside both
`jsonOut()` and `errorOut()`. The helper walks objects/arrays recursively
and replaces any value whose key matches the sensitive policy with
`"[REDACTED]"`. Sensitive keys are matched case-insensitively against:

- exact names: `npmToken`, `apiKey`, `secret`;
- suffix patterns: `*.password`, `*.token`, `*.secret`, `*.apiKey`
  (also matched against `_` and `-` separators, e.g. `admin_password`,
  `github-token`).

The helper additionally scrubs `key=value` and `key: value` pairs
embedded in free-form strings (so `apiKey=sk-...` in an error message
becomes `apiKey=[REDACTED]`). If a new sensitive field shape is
introduced that does not fit the policy above, extend the helper in the
same commit and add a regression test next to `src/output.test.ts`.

Command handlers must NEVER `console.log` / `console.error` directly —
always go through `humanOut` / `jsonOut` / `errorOut` so the `--json`
contract and the redaction pass apply uniformly.

### Configuration

Per-project canopy config lives in `.canopy/config.yaml` (project,
targets, version). Prompts live in `.canopy/prompts.jsonl`; schemas in
`.canopy/schemas.jsonl`. All three are read through `src/store.ts`,
which holds an advisory file lock for the duration of any mutation so
parallel agents in different worktrees never corrupt the JSONL.

## Testing & Validation

### Per-change verification

Before committing any code change run the canonical aggregate from the
repo root:

```bash
bun run verify          # = bun run check:all (10 gates, quiet output)
```

All 10 gates must exit 0. CI runs the same manifest (enforced by the
`check:ci-parity` gate) — local greens are the contract. To iterate on
a single gate, re-run it directly (e.g. `bun run typecheck` or
`bun test src/render.test.ts`). If you added a new `cn` subcommand or changed an existing
flag, `gen:docs:check` will fail until you run `bun run gen:docs` and
commit the updated `docs/cli-reference.md`.

### Coverage discipline

`bun run check:coverage` enforces the per-file floors in
`budgets/coverage-budgets.json` against the "All files" row of Bun's
text coverage reporter. The ratchet only goes **up**: when coverage
improves, edit the budget upward in the same commit. Lowering a floor
requires deleting tests, which must reference a `canopy-XXXX` tracker
in the commit body so the reviewer can audit what was removed.

### File-size and debt ratchets

`bun run check:size` and `bun run check:debt` read
`budgets/file-size-budgets.json` and `budgets/debt-markers-budget.json`
respectively. The ratchet only goes **down**: a file already on the
list can shrink (or be removed once it drops below the global cap)
but not grow. Refactor before raising a budget; if you must raise one,
include the justification in the commit body and link the tracker id.

### AGENTS.md validation

`bun run check:agents` parses this file and asserts:

1. Every `bun run <X>` token inside a fenced bash block is defined in
   `package.json`'s `scripts` map.
2. Every backticked path-shaped token resolves on disk (relative to
   the repo root), except for the explicit known-missing allowlist in
   `scripts/validate-agents-md.ts` (build artifacts like
   `coverage/lcov.info`, gitignored CI outputs like
   `test-results/junit.xml`, and naming-convention placeholders like
   `kebab-case.ts`).

When this check fails, fix the broken reference in the same commit —
do not silently extend the allowlist.

### CLI doc generator

`bun run gen:docs` walks the Commander tree built in `src/index.ts`
and writes a Markdown reference to `docs/cli-reference.md`. The
generator never produces an empty tree (a sanity assertion guards
against accidental misconfiguration). `bun run gen:docs:check` is the
CI variant — it fails if the file is missing or stale.

### CI parity

`.github/workflows/ci.yml` runs the five gates on push to `main` and
on every pull request. The release workflow `.github/workflows/publish.yml`
re-runs the same suite, then publishes to npm and creates a GitHub
release from the matching `CHANGELOG.md` section. Operational
procedures for releases live in `RUNBOOK.md`.

### Validation reports

When canopy is audited via the Agent-Readiness rubric, the user
invokes `/readiness-report` manually from this repo's working
directory inside an interactive `droid` session. Agents do not run
the auditor themselves; they make the repo pass.

## Agent Workflow

When an agent works in canopy, it should:

1. **Prime context.** Read this file (`AGENTS.md`), `CLAUDE.md`,
   `SPEC.md`, the latest `CHANGELOG.md` entry, and (if relevant)
   `docs/cli-reference.md` and `docs/architecture.mmd`. Run
   `cn prime` if Canopy itself is the active project context.
2. **Find unblocked work.** Use the repo's issue tracker (Seeds:
   `sd ready`; GitHub: `gh issue list`).
3. **Make focused changes.** One concern per commit. Preserve
   existing conventions — adapt, do not overwrite.
4. **Run gates locally.** All five of `bun run lint`,
   `bun run typecheck`, `bun test`, `bun run check:agents`, and
   `bun run gen:docs:check` must exit 0 before commit.
5. **Pin debt markers.** Any new `TODO` / `FIXME` must reference a
   tracker id (`canopy-XXXX`, `mx-XXXX`, `#NNN`, or a URL) on the
   same line.
6. **Regenerate generated artifacts.** After touching `src/index.ts`,
   `src/commands/`, or any Commander registration, run
   `bun run gen:docs` and commit the resulting
   `docs/cli-reference.md` diff.
7. **Commit & sync.** Commit message follows `<area>: <summary>`
   (e.g., `quality: ratchet file-size cap`,
   `feat: add cn pin --force`). Do not `git push` unless the user
   asks; leave commits local.
8. **Record insights.** If the project uses Mulch, `ml record` any
   convention discovered or failure encountered.

### Working with prompts (dogfood)

Canopy uses canopy: `.canopy/prompts.jsonl` stores the prompts canopy
itself emits to its consumers. When an agent edits those prompts:

- Always use `cn create` / `cn update` — never hand-edit
  `.canopy/prompts.jsonl`. Hand edits bypass the advisory lock and
  may corrupt the JSONL.
- After changing prompts, run `cn render <name>` and
  `cn validate <name>` to confirm the merge resolves cleanly.
- Run `cn emit --all` to regenerate the rendered files and commit
  both `.canopy/` and the rendered targets in the same commit.

There is a repo-local skill at
`.factory/skills/canopy-prompt-workflow/SKILL.md` that walks an agent
through the full prompt-composition loop with explicit acceptance
criteria. Load it whenever you need to compose a prompt from scratch.

### Session completion protocol

Before ending a session:

1. File issues for remaining work (`sd create --title "..."`).
2. Run the five-gate suite above.
3. Close finished issues (`sd close <id>`).
4. Record session insights (`ml record canopy ...`).
5. Push only when the user requests it; otherwise leave commits local.
6. Verify `git status` is clean.

## Version management

Canopy's version lives in **two** places, kept in sync manually and
verified by the release workflow:

- `package.json` — `"version"` field.
- `src/index.ts` — `export const VERSION = "X.Y.Z"`.

`.github/workflows/publish.yml` fails the release job if they
disagree, then auto-tags `vX.Y.Z` and creates a GitHub release from
the matching `CHANGELOG.md` section. Detailed release procedures —
including triage of a failed publish and rollback — live in
`RUNBOOK.md`.

## Further reading

- `CLAUDE.md` — authoritative long-form version of this file.
- `SPEC.md` — V1 design record.
- `README.md` — user-facing pitch + install instructions.
- `RUNBOOK.md` — release, triage, and rollback procedures.
- `CHANGELOG.md` — release history.
- `docs/cli-reference.md` — auto-generated reference for every `cn`
  subcommand.
- `docs/architecture.mmd` — mermaid diagram of canopy's
  prompt-resolution path.
- `.factory/skills/canopy-prompt-workflow/SKILL.md` — repo-local
  agent skill for composing prompts by inheritance.
- `CONTRIBUTING.md` — contribution conventions.
