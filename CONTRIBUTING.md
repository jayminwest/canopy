# Contributing to Canopy

Thanks for your interest in contributing to Canopy! This guide covers everything you need to get started.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/canopy.git
   cd canopy
   ```
3. **Install** dependencies:
   ```bash
   bun install
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b fix/description-of-change
   ```

## Branch Naming

Use descriptive branch names with a category prefix:

- `fix/` -- Bug fixes
- `feat/` -- New features
- `docs/` -- Documentation changes
- `refactor/` -- Code refactoring
- `test/` -- Test additions or fixes

## Build & Test Commands

```bash
bun run lint           # Lint with biome
bun run typecheck      # Type-check (tsc --noEmit)
bun test               # Run all tests (bun:test)
bun test src/commands/create.test.ts  # Run a single test file
```

There is no build step -- Canopy runs directly from TypeScript source via Bun.

Always run `bun run lint` and `bun test` before submitting a PR.

## TypeScript Conventions

Canopy is a zero-dependency, ESM-only TypeScript project running on Bun.

### ESM Imports

All relative imports **must** end with the `.ts` extension:

```typescript
import { loadPrompts } from "./utils.ts";
import type { Prompt } from "./types.ts";
```

### Other Rules

- No `any`, no `@ts-ignore`, no `@ts-expect-error`
- Zero runtime dependencies -- use Bun built-ins only
- Use `process.exitCode = 1` instead of `process.exit(1)` for testability

## Testing Conventions

- **No mocks.** Tests use real filesystems.
- Create temp directories with `mkdtemp`, write real config and JSONL files, assert against real file contents.
- Clean up in `afterEach`.
- Test files live alongside source files: `src/commands/create.test.ts` for `src/commands/create.ts`.

Example test structure:

```typescript
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, it, expect } from "bun:test";

describe("my-command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "canopy-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true });
  });

  it("does the thing", async () => {
    // Write real files, run real code, assert real results
  });
});
```

## Adding a New Command

1. Create `src/commands/<name>.ts`
2. Register it in `src/index.ts`
3. Add tests in `src/commands/<name>.test.ts`

## Commit Message Style

Use concise, descriptive commit messages. The project follows a conventional-ish style:

```
fix: resolve schema validation edge case
feat: add --json flag to emit command
docs: update CLI reference in README
```

Prefix with `fix:`, `feat:`, or `docs:` when the category is clear. Plain descriptive messages are also fine.

## Pull Request Expectations

- **One concern per PR.** Keep changes focused -- a bug fix, a feature, a refactor. Not all three.
- **Tests required.** New features and bug fixes should include tests. See the testing conventions above.
- **Passing CI.** All PRs must pass the CI checks (lint + typecheck + test) before merge.
- **Description.** Briefly explain what the PR does and why. Link to any relevant issues.

## Reporting Issues

Use [GitHub Issues](https://github.com/jayminwest/canopy/issues) for bug reports and feature requests. For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
