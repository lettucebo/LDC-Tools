# Project conventions

This repository is `lettucebo/TampermonkeyScripts` — a collection of
Tampermonkey userscripts that are independent in functionality but are
released together under **one synchronized version number** (see
[Versioning](#versioning) below). Each script lives in its own
`scripts/<script-id>/` folder.

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
hard-excludes it from release-baseline selection via `RETIRED_TAGS`.
Future `1.x` releases must start at `1.0.1` or later, never `1.0.0`
again.

## Release tooling, CI, and the release skill

- `tools/` holds dependency-free Node.js scripts shared by local use and
  CI: `tools/validate.mjs` (metadata/version/CHANGELOG validation, plus
  PR/push-mode and `--release-tag`-gated release-mode non-downgrade
  checks), `tools/run-tests.mjs` (discovers and runs every
  `scripts/*/test/*.test.js`), and `tools/release-notes.mjs` (builds
  combined release notes from the root and per-script CHANGELOGs).
- `.github/workflows/ci.yml` (workflow `CI`) runs validation and tests
  on every pull request and on `push` to `main`.
  `.github/workflows/release.yml` (workflow `Release`) runs on `v*.*.*`
  tag pushes, re-validates in release mode, and publishes the GitHub
  Release via `gh release create --verify-tag`.
- `.github/skills/release/SKILL.md` is the step-by-step release
  procedure for an assistant to follow, including the ordering rules
  above and failure recovery; see `RELEASING.md` for the full narrative
  reference.

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

## Repo root layout

```
.github/
├── copilot-instructions.md
├── skills/<skill-id>/SKILL.md   ← includes skills/release/SKILL.md
└── workflows/                   ← ci.yml, release.yml
tools/                           ← validate.mjs, run-tests.mjs, release-notes.mjs, lib/
scripts/<script-id>/             ← one folder per userscript, see below
CHANGELOG.md                     ← repo-level (CI/tooling/docs/skills) changes
README.md / README.zh-TW.md      ← index of all userscripts
RELEASING.md                     ← full release procedure reference
```

## Other conventions

- 若使用 Python 的話，必須使用 uv。
