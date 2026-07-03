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
all scripts — e.g. `v0.8.5`. Do **not** create per-script
`<script-id>-v<X.Y.Z>` tags (that is the old scheme). Older per-script
tags and the legacy repo-wide tags (`v0.4.0`, `v0.5.0`, `v1.0.0`) remain
for history. See `RELEASING.md` for the full release procedure.

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

- 若使用 Python 的話，必須使用 Python 虛擬環境。
