# Project conventions

This repository is `lettucebo/TampermonkeyScripts` — a collection of
Tampermonkey userscripts that are independent in functionality but are
released together under **one synchronized version number** (see
[Versioning](#versioning) below). Each script lives in its own
`scripts/<script-id>/` folder.

## Commands

Run the same checks as CI before opening a PR:

```powershell
node tools\validate.mjs
node --test "tools/test/*.test.mjs"
node tools\run-tests.mjs
```

Targeted checks:

```powershell
# One release-tool test file
node --test tools/test/validateCore.test.mjs

# One named node:test pattern
node --test --test-name-pattern="runReleaseModeCheck" tools/test/validateCore.test.mjs

# One userscript's pure tests
node scripts/ldc-batch-download/test/pure-modules.test.js

# Syntax-check one userscript
node --check scripts/ldc-batch-download/ldc-batch-download.user.js

# Lint GitHub Actions workflows (requires actionlint on PATH)
actionlint .github/workflows/ci.yml .github/workflows/release.yml
```

Release-only commands:

```powershell
node tools\validate.mjs --release-tag vX.Y.Z
node tools\release-notes.mjs X.Y.Z
node tools\verify-release.mjs --tag vX.Y.Z
```

`validate.mjs` accepts only no arguments or exactly
`--release-tag vX.Y.Z`; malformed, misspelled, or extra arguments fail
instead of falling back to the weaker PR/push validation mode.

## Architecture

- `scripts/<script-id>/` contains independent browser userscripts. There
  is no shared runtime bundle: Tampermonkey installs each `.user.js`
  directly from its GitHub raw `main` URL.
- `tools/lib/` contains the reusable, testable, zero-third-party-dependency
  release logic.
  `tools/*.mjs` are thin CLIs for repository validation, test discovery,
  release-note generation, and post-publication verification.
- `.github/workflows/ci.yml` is the read-only PR/`main` gate.
  `.github/workflows/release.yml` separates read-only validation from
  the tag-push-only job that receives `contents: write` and publishes
  the Release.
- Script CHANGELOGs describe script behavior. The root `CHANGELOG.md`
  describes repository-level tooling, CI, documentation, and skill
  changes; `tools/release-notes.mjs` combines both layers.

## Tampermonkey userscript conventions

When adding or modifying a userscript:

- Each userscript's `@version` must follow [SemVer](https://semver.org/)
  and be kept in sync with a matching `## [X.Y.Z] — YYYY-MM-DD` entry in
  the script's own `scripts/<script-id>/CHANGELOG.md`.
- Set `@namespace` to `https://github.com/lettucebo/TampermonkeyScripts`
  on every script in this repo. (Tampermonkey identifies installed
  scripts by `(name, namespace)` — changing namespace splits installs.)
- Set `@updateURL` and `@downloadURL` to the GitHub raw URL of the
  script under its repo path:
  `https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/<script-id>/<script-id>.user.js`.
  Tampermonkey relies on this for auto-update.
- Set `@homepageURL` to
  `https://github.com/lettucebo/TampermonkeyScripts/tree/main/scripts/<script-id>`.
- Set `@supportURL` to
  `https://github.com/lettucebo/TampermonkeyScripts/issues`.
- Always set `@license MIT`.
- For user-facing strings (`@name`, `@description`), provide an English
  version and a `:zh-TW` translation pair when the script has user-facing
  UI in either language.

## Versioning

**All userscripts in this repo share one synchronized `@version`.** Every
release bumps **all** scripts to the same version number — including
scripts with no functional change (give those a CHANGELOG entry noting a
"synchronized version bump, no functional change"). This keeps releases
and tags aligned so the entire repo can be tracked by a single version at
any point in time.

Because Tampermonkey never updates an install to a **lower** `@version`,
the shared version must always be **≥ the highest version any script
currently has** — bump up, never down. (Example: to synchronize a repo
whose scripts were at `0.3.2`, `0.3.0` and `0.8.2`, everything moves to
`0.8.3`, not down to the `0.3.x` line.)

Once a version's `.user.js` content is public on `main`, treat it as
frozen. Prepare a higher PATCH version for a fix; do not silently change
or re-tag the existing version. Only publish when the user explicitly
requests a release, and then follow `.github/skills/release/SKILL.md`.

## Release tag scheme

Because all scripts share one synchronized version, each release is a
**single repo-wide tag** `v<X.Y.Z>` plus **one** GitHub Release covering
all scripts — e.g. `v0.8.5`, `v0.9.0`. Do **not** create per-script
`<script-id>-v<X.Y.Z>` tags (that is the old scheme). Older per-script
tags and the legacy repo-wide tags `v0.4.0` / `v0.5.0` remain for
history. See `RELEASING.md` for the full release procedure.

`v1.0.0` was a legacy repo-wide tag/Release that predated synchronized
versioning and is **permanently retired**: it must never be recreated
or reused, even after deletion, because other clones/forks may still
hold the old annotated tag and a plain `git fetch --tags` will not
overwrite an existing same-name tag — reusing it would make `v1.0.0`
point to different commits for different people. `tools/validate.mjs`
both excludes it from release-baseline selection and rejects
`--release-tag v1.0.0` outright.
Future `1.x` releases must start at `1.0.1` or later, never `1.0.0`
again.

## Release tooling, CI, and the release skill

- `tools/validate.mjs` validates file completeness, userscript syntax
  and metadata, synchronized versions, CHANGELOG structure, and
  non-downgrade release history.
- `tools/run-tests.mjs` discovers every
  `scripts/*/test/*.test.js` and runs each with plain Node; discovering
  zero tests is an error.
  Userscript tests are plain Node scripts, while release-tool tests use
  the built-in `node:test` runner under `tools/test/`. Userscript tests
  hand-port pure logic because `.user.js` files depend on browser and
  Tampermonkey globals; keep the copied logic and production script in
  sync when changing parsers, regexes, or transformations.
- `tools/release-notes.mjs` builds notes from the root and per-script
  CHANGELOGs. `tools/verify-release.mjs` verifies an already-published
  Release's tag, draft/prerelease state, and Latest marker.
- `.github/workflows/ci.yml` (workflow `CI`) runs validation and tests
  on every pull request, on `push` to `main`, and on manual dispatch.
  `.github/workflows/release.yml` (workflow `Release`) runs on `v*.*.*`
  tag pushes and also supports a read-only `workflow_dispatch` dry run.
  Manual dispatch runs only the `contents: read` validation job, without
  `GH_TOKEN`; only a tag push creates the write-enabled publishing job.
  A tag push re-validates in release mode, publishes via
  `gh release create --latest --verify-tag`, and then calls
  `tools/verify-release.mjs`.
- `.github/skills/release/SKILL.md` is the step-by-step release
  procedure. Follow it rather than reconstructing tag, CI identity,
  recovery, or legacy-deletion ordering from memory; use
  `RELEASING.md` as the narrative reference.

## Folder layout per script

```
scripts/<script-id>/
├── <script-id>.user.js
├── README.md
├── README.zh-TW.md        ← if bilingual docs
├── CHANGELOG.md
└── test/                  ← if the script has tests
```

The root `README.md` / `README.zh-TW.md` is an index of all userscripts
in the repo and should be kept up to date when a new script is added or
removed.

## Other conventions

- 若使用 Python 的話，必須使用 uv。
