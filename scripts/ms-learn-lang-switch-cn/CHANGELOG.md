# Changelog

All notable changes to this script are documented in this file. Format based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/); this script follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.9.0] — 2026-08-30

### Changed
- Version bumped to `0.9.0` to stay on the repo-wide **synchronized
  version** (all userscripts share one `@version`). No functional change
  to this script.

## [0.8.5] — 2026-07-04

### Fixed
- Locale detection/rewrite is now anchored to the **first path segment**
  (`location.pathname` matched with `/^\/(en-us|zh-cn)\//i`) instead of a
  substring match on the whole URL string. This prevents a false positive
  where a locale-looking segment deeper in the path or inside the query
  string (e.g. `.../foo/com/en-US/bar` or `?q=com/en-US/x`) could inject
  the button and rewrite the wrong segment. The rewrite now uses the `URL`
  API, so the query string and hash are preserved.

### Added
- `test/pure-modules.test.js` — hand-ported pure tests for the locale
  toggle: mixed-case + lowercase inputs, query/hash preservation, and
  anchored false-positive rejection. Run with `node`.

## [0.8.3] — 2026-07-04

### Changed
- Adopted repo-wide **synchronized versioning**: all userscripts in this
  repo now share one `@version`. This release aligns the number to
  `0.8.3` (previously on the `0.3.x` line) so it sits at or above the
  highest existing script version. No behaviour change from this bump.

### Fixed
- Locale detection and rewrite are now **case-insensitive**, so the
  toggle button appears on `support.microsoft.com` pages whose URLs use
  mixed-case locale codes — e.g. legacy KB / product articles under
  `/en-US/`, `/zh-CN/` (`.../Forms/...`, `.../topic/...`). Previously the
  regex matched only lowercase `en-us` / `zh-cn`, so no button was
  injected on those pages. The rewritten URL still emits the lowercase
  locale, which both `support.microsoft.com` and `learn.microsoft.com`
  serve, so lowercase pages (Microsoft Learn, the newer support hubs)
  are unaffected. No `@match` change was needed —
  `https://*.microsoft.com/*/*` already covers the `support` subdomain.

## [0.3.1] — 2026-05-13

### Changed
- **Accessibility**: the toggle button is now a real `<button>`
  element (previously a `<div>` with an `onclick` handler), so it's
  reachable via **Tab** and activated with **Enter/Space**. Added an
  `aria-label` that announces the direction of the switch (e.g.
  "Switch to Simplified Chinese (zh-cn)"). The button also gains a
  visible white `:focus` outline so keyboard users can see where
  they are. Mouse / hover behaviour is unchanged.
- **Metadata**: `@run-at` is now explicitly `document-end` (this
  pins the script's existing behaviour — the IIFE already relies on
  `document.body` being available — and prevents accidental drift if
  a future change introduces head-time work).

## [0.3.0] — 2026-05-12

### Added
- Moved from gist `lettucebo/75f05f94b7ee2dace41b5ec06b6bf022` into the `lettucebo/TampermonkeyScripts` repo at `scripts/ms-learn-lang-switch-cn/`.
- Bilingual README (English + 繁體中文).
- Proper Tampermonkey metadata: `@license MIT`, `@homepageURL`, `@supportURL`, repo-based `@namespace`, and `@updateURL` / `@downloadURL` pointing at the repo raw URL so Tampermonkey can auto-update from this repo.

### Changed
- `@author` from `You` to `lettucebo`.
- `@namespace` from `http://tampermonkey.net/` to `https://github.com/lettucebo/TampermonkeyScripts`.
- `@name` from `中英快速切換 - CN` to `MS Learn Lang Switch (zh-CN)`; original Chinese name retained as `@name:zh-TW`.

### Upgrade notes
- The `@namespace` change means Tampermonkey treats this as a different script from the gist version. If you previously installed the script from the gist, uninstall the old entry from the Tampermonkey dashboard before installing from this repo to avoid two copies running.

## [0.2.0]

### Added
- Initial public release on gist `lettucebo/75f05f94b7ee2dace41b5ec06b6bf022`.
