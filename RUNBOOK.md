# Canopy Operations Runbook

This runbook covers canopy's operational procedures only:

1. Cutting a release of `@os-eco/canopy-cli` to npm.
2. Triaging a failed publish.
3. Rolling back a bad release.

For day-to-day development conventions, see `AGENTS.md`. For the design
record, see `SPEC.md`. For architecture orientation, see
`docs/architecture.mmd`.

## Pre-flight (do once per machine)

- `bun --version` ≥ the version in `package.json` `engines.bun` (≥ 1.0).
- `gh auth status` → authenticated, with `repo` + `workflow` scopes.
- `git remote -v` shows the canonical origin (`github.com/jayminwest/canopy`).
- For npm publish: `npm whoami` → `jayminwest`; 2FA enabled on the
  account.
- Local working tree on `main`, fully up to date, `git status` clean.

The publish flow is fully automated via `.github/workflows/publish.yml`.
You should not need to invoke `npm publish` manually for a normal
release.

## 1. Release procedure

Cut releases from `main` only. Never tag a feature branch.

### 1.1 Decide the version

Follow [SemVer](https://semver.org). Pick:

- **MAJOR** for any backward-incompatible change to the `cn` public CLI
  surface (subcommand removed, flag renamed, JSONL schema breaking
  change).
- **MINOR** for new features or non-breaking additions (new subcommand,
  new optional flag, new emit target type).
- **PATCH** for bug fixes, doc-only changes, internal refactors,
  dependency bumps that don't change canopy's surface.

While canopy is pre-1.0 (current `package.json` "version" starts with
`0.`), breaking changes go in MINOR; additive changes go in PATCH.

### 1.2 Update the version in every source of truth

Canopy's version lives in **two** places, kept in sync manually. The
publish workflow asserts they agree before pushing to npm:

- `package.json` — `"version"` field.
- `src/index.ts` — `export const VERSION = "X.Y.Z"`.

```bash
# Bump both (manual edit is fine; the existing scripts/version-bump.ts
# can also drive this for older versions of the repo).
$EDITOR package.json src/index.ts
git diff package.json src/index.ts   # confirm only the version moved
```

### 1.3 Update the changelog

`CHANGELOG.md` must have a new entry at the top under a `## [X.Y.Z] —
YYYY-MM-DD` heading. The publish workflow extracts this section
verbatim and uses it as the GitHub release body, so format matters.

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- Short description (canopy-XXXX).

### Changed
- Short description.

### Fixed
- Short description (#NNN).
```

Group changes under standard Keep-a-Changelog headings (Added /
Changed / Fixed / Deprecated / Removed / Security). Link each entry to
its `canopy-XXXX` tracker id, `mx-XXXX` cross-repo id, `#NNN` GitHub
issue, or a URL.

### 1.4 Final gate check

```bash
bun install
bun run lint
bun run typecheck
bun test
bun run check:agents
bun run gen:docs:check
```

All must exit 0. If any fails, **stop** — fix locally and re-run
before continuing. Once additional gates land (`check:size`,
`check:debt`, `check:coverage`, eventual `check:all`), run those too.

### 1.5 Commit and push to `main`

```bash
git add package.json src/index.ts CHANGELOG.md
git commit -m "release: canopy X.Y.Z"
git push origin main
```

Pushing triggers `.github/workflows/publish.yml`, which:

1. Re-runs `bun run lint`, `bun run typecheck`, and `bun test` in CI.
2. Compares `package.json` `"version"` against the npm registry's
   current version of `@os-eco/canopy-cli`. If they match, the
   workflow is a no-op (`publish=false`); otherwise it proceeds.
3. Asserts `package.json` and `src/index.ts` agree on `X.Y.Z`.
4. Publishes `@os-eco/canopy-cli@X.Y.Z` to npm with `--access public`.
5. Tags `vX.Y.Z` and pushes the tag to origin.
6. Extracts the matching `CHANGELOG.md` section with an awk script and
   uses it as the GitHub release body. If the section is empty, the
   workflow falls back to `gh release --generate-notes`.

Watch the workflow run live:

```bash
gh run watch
```

### 1.6 Post-release sanity

After the workflow finishes:

```bash
git pull --tags
git tag --list | tail -5                          # confirm vX.Y.Z present
gh release view vX.Y.Z                            # confirm release page renders
npm view @os-eco/canopy-cli version               # confirm published version
```

Smoke-install in a clean dir:

```bash
mkdir /tmp/canopy-smoke && cd /tmp/canopy-smoke
bun install @os-eco/canopy-cli
bunx cn --version    # should print X.Y.Z
bunx cn --help       # should list all subcommands
```

## 2. Triage of a failed publish

When `.github/workflows/publish.yml` exits non-zero:

### 2.1 Read the log

```bash
gh run list --workflow=publish.yml --limit 5
gh run view <run-id> --log-failed
```

Common failures and fixes:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Version mismatch! package.json=... src/index.ts=...` | The "Verify version sync" step failed. | Sync the two files; push a fix commit. |
| `Version X.Y.Z already published, skipping.` | npm already has this version. | Not an error — the workflow short-circuits to a no-op. Bump if you intended to ship something. |
| `npm publish ... 403` | Missing or expired `NPM_TOKEN` secret. | Repo → Settings → Secrets → update `NPM_TOKEN`; re-run the workflow. |
| `npm publish ... E409` | Version already published from a different commit. | Bump to the next patch; do **not** unpublish a live version. |
| `gh release create ... already exists` | Tag `vX.Y.Z` exists but a previous workflow created an incomplete release. | Delete the orphan release in the GitHub UI, then re-run the workflow. |
| `tsc` / `biome` / `bun test` failure in publish.yml | Local greens diverged from CI (env, OS-specific path, race). | Reproduce locally; do **not** force-push to `main`. |
| `gen:docs:check` failure | `docs/cli-reference.md` is stale. | `bun run gen:docs`, commit the diff, push. |
| `check:agents` failure | A backticked path or `bun run X` reference in `AGENTS.md` no longer resolves. | Read the failure detail, fix the reference or add to the script's known-missing allowlist, push. |

### 2.2 Re-run the workflow

After the fix commit lands on `main`:

```bash
gh workflow run publish.yml --ref main
```

Or push a no-op commit if the workflow only triggers on push:

```bash
git commit --allow-empty -m "release: retry publish"
git push origin main
```

### 2.3 If the publish half-succeeded

If `npm publish` completed but `gh release create` failed (or vice
versa), **do not unpublish**. Recover the missing half manually:

- npm version exists but the GitHub release is missing:
  ```bash
  # Extract the changelog section the workflow would have used.
  awk '/^## \[X.Y.Z\]/{found=1; next} found && /^## \[/{exit} found{print}' CHANGELOG.md > /tmp/notes.md
  gh release create vX.Y.Z --title "vX.Y.Z" --notes-file /tmp/notes.md
  ```
- npm has the version but the git tag is missing:
  ```bash
  git tag vX.Y.Z <release-sha>
  git push origin vX.Y.Z
  ```

Record the deviation in a `canopy-XXXX` tracker so future operators
know the half-step happened.

## 3. Rollback

A "rollback" never means unpublishing. npm and git tags are immutable.
Rollback means **publishing a corrective version**.

### 3.1 Decide the severity

- **Critical** (data loss, security regression, total CLI breakage):
  cut a new patch release reverting the change in under 30 minutes.
- **High** (regression on common path: `cn emit` breaks, `cn render`
  silently corrupts): cut a patch within the day.
- **Medium / Low**: fix forward on the next planned release.

### 3.2 Revert the offending commits

```bash
git checkout main
git pull
git log --oneline -10
git revert <bad-sha>           # creates a new commit, preserves history
```

If the bad release is `X.Y.Z`, the revert commit goes into the work
for `X.Y.(Z+1)`. Resolve any merge conflicts that arise from
intervening commits.

### 3.3 Cut a follow-up release

Follow §1.1–§1.5. In `CHANGELOG.md`, note the rollback explicitly:

```markdown
## [X.Y.(Z+1)] — YYYY-MM-DD

### Fixed
- Reverted <one-line bad-commit summary> from X.Y.Z which caused
  <symptom>. Tracking in canopy-XXXX / #NNN.
```

### 3.4 Deprecate the bad version on npm

If `@os-eco/canopy-cli@X.Y.Z` is dangerous to install:

```bash
npm deprecate @os-eco/canopy-cli@X.Y.Z \
  "Critical bug; install X.Y.(Z+1) or later. See CHANGELOG.md."
```

`npm deprecate` does not remove the version (which would break
reproducible installs); it surfaces a warning at install time.

### 3.5 Communicate

- Edit the GitHub release notes for `vX.Y.Z` with a banner at the top:
  `> ⚠️ This release contains a regression. Use vX.Y.(Z+1) or later.`
- File / update `canopy-XXXX` with root cause + remediation links.
- If a downstream consumer (overstory, warren, sapling) pinned the bad
  version, open an issue against that repo recommending the upgrade.

## Appendix — Common commands

```bash
# Inspect recent releases
git tag --sort=-creatordate | head -5
gh release list --limit 5

# Inspect a failing workflow run
gh run list --workflow=publish.yml --limit 5
gh run view <run-id> --log-failed

# Re-run a single failed job
gh run rerun <run-id> --failed

# Inspect what npm has published
npm view @os-eco/canopy-cli versions --json
npm view @os-eco/canopy-cli dist-tags
```

## Appendix — Pre-publish checklist (copy-paste into release PR body)

- [ ] `package.json` and `src/index.ts` agree on `X.Y.Z`.
- [ ] `CHANGELOG.md` has a dated `## [X.Y.Z] — YYYY-MM-DD` section.
- [ ] `bun run lint && bun run typecheck && bun test` exit 0.
- [ ] `bun run check:agents` and `bun run gen:docs:check` exit 0.
- [ ] `gh run watch` confirmed `publish.yml` succeeded.
- [ ] `npm view @os-eco/canopy-cli version` reports `X.Y.Z`.
- [ ] Smoke install in a clean dir succeeds.
- [ ] GitHub release page renders the changelog section correctly.
