# Changelog

All notable changes to this script are documented in this file. Format based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/); this script follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.8.5] — 2026-07-04

### Changed
- Version bumped to `0.8.5` to stay on the repo-wide **synchronized
  version** (all userscripts share one `@version`). No functional change
  to this script.

## [0.8.3] — 2026-07-04

### Changed
- Version bumped to `0.8.3` to adopt repo-wide **synchronized
  versioning** (all userscripts in this repo share one `@version`). No
  functional change to this script.

## [0.3.0] — 2026-05-12

### Added
- Moved from gist `lettucebo/a69c5d5cb2f09bbff962568a8e14206c` into the `lettucebo/TampermonkeyScripts` repo at `scripts/github-docs-lang-switch-cn/`.
- Bilingual README (English + 繁體中文).
- Proper Tampermonkey metadata: `@license MIT`, `@homepageURL`, `@supportURL`, repo-based `@namespace`, and `@updateURL` / `@downloadURL` pointing at the repo raw URL so Tampermonkey can auto-update from this repo.

### Fixed
- **`@updateURL` / `@downloadURL` no longer point at the wrong gist.** The gist version's `@updateURL` and `@downloadURL` pointed at the MS Learn zh-CN gist (`lettucebo/75f05f94...`), which meant Tampermonkey would silently auto-update this script's installs with the MS Learn script's code on the next update check. Fixed to point at this script's own raw URL in the repo.
- **Click handler's URL-replace regex.** The gist version matched the URL with `/com\/(en|zh)\//` but tried to replace using `/com\/(en-us|zh-cn)\//`, which never matches a `docs.github.com` URL. The button rendered but clicking it had no effect. Fixed the replace regex to also use `/com\/(en|zh)\//`.

### Changed
- `@author` from `You` to `lettucebo`.
- `@namespace` from `http://tampermonkey.net/` to `https://github.com/lettucebo/TampermonkeyScripts`.
- `@name` from `GitHub 中英快速切換 - CN` to `GitHub Docs Lang Switch (zh-CN)`; original Chinese name retained as `@name:zh-TW`.
- Floating button element id from `lang-switch` to `gh-lang-switch` so the CSS rule is namespaced.

### Upgrade notes
- The `@namespace` change means Tampermonkey treats this as a different script from the gist version. Uninstall the old gist entry from the Tampermonkey dashboard before installing from this repo to avoid two copies running.

## [0.2.0]

### Added
- Initial public release on gist `lettucebo/a69c5d5cb2f09bbff962568a8e14206c`. (Shipped with two known bugs that were not fixed until v0.3.0; see [0.3.0]'s `### Fixed` section.)
