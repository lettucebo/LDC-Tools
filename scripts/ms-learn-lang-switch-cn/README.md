English | [繁體中文](./README.zh-TW.md)

# MS Learn Lang Switch (zh-CN)

> Scope: any page matching `https://*.microsoft.com/{en-us|zh-cn}/...` (locale match is case-insensitive) — Microsoft Learn, Docs, Support (`support.microsoft.com`), and the rest of the `*.microsoft.com` family. Mixed-case locale codes such as `en-US` / `zh-CN` are handled too.

## What it does

Injects a small floating button in the top-right corner of the page (`top:6px`, `right:6px`) that toggles the URL locale segment between `en-us` and `zh-cn`:

- On an `en-us` page the button is labeled **`簡`** — click it to jump to the matching `zh-cn` URL.
- On a `zh-cn` page the button is labeled **`EN`** — click it to jump back to the matching `en-us` URL.

The button is mostly transparent (opacity `0.3`) until hovered, so it stays out of the way of the page content.

## Install

[![Install](https://img.shields.io/badge/Tampermonkey-Install-00485B?logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-cn/ms-learn-lang-switch-cn.user.js)
<br/>💡 _**Ctrl/Cmd-click** (or middle-click) the badge above to open it in a new tab — GitHub strips `target="_blank"` from README links so plain clicks navigate this tab away._

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager such as Violentmonkey).
2. Open the install link above — Tampermonkey will pick up the `.user.js` file and show the install prompt.
3. Confirm install. Visit any `https://*.microsoft.com/en-us/...` or `.../zh-cn/...` page and the toggle button should appear in the top-right corner.

## How it works

The script parses the current URL with the regex `/com\/(en-us|zh-cn)\//i` (the `i` flag makes it case-insensitive, so mixed-case codes such as `en-US` / `zh-CN` on `support.microsoft.com` also match). If a match is found, it:

1. Notes the current locale (`en-us` or `zh-cn`).
2. Appends a small `<style>` and `<div id="lang-switch">` to the page.
3. On click, rewrites the locale segment with `location.toString().replace(/com\/(en-us|zh-cn)\//i, ...)` and navigates to the new URL (the rewritten URL always uses the lowercase target locale, which every `*.microsoft.com` site accepts).

Pages outside the `en-us` / `zh-cn` locales are ignored — no button is rendered.

## Companion scripts

- [`ms-learn-lang-switch-tw`](../ms-learn-lang-switch-tw/) — sibling script that toggles between `en-us` and `zh-tw` (Traditional Chinese).

The two scripts are designed to coexist on the same page:

| Script                      | Button position | Locale toggle    |
| --------------------------- | --------------- | ---------------- |
| `ms-learn-lang-switch-cn`   | `top:6px`       | `en-us` ↔ `zh-cn` |
| `ms-learn-lang-switch-tw`   | `top:40px`      | `en-us` ↔ `zh-tw` |

Install both if you want one-click switching to either Chinese variant.

## Upgrade from gist install (≤ v0.2)

Earlier versions of this script were published as a [GitHub gist](https://gist.github.com/lettucebo/75f05f94b7ee2dace41b5ec06b6bf022). Starting with **v0.3.0** the script lives in this repo, and the `@namespace` has changed from `http://tampermonkey.net/` to `https://github.com/lettucebo/TampermonkeyScripts`.

Tampermonkey identifies scripts by `@namespace` + `@name`, so the repo version is treated as a **different** script from the gist version. If you previously installed from the gist:

1. Open the Tampermonkey dashboard.
2. Find the old `中英快速切換 - CN` entry and remove it.
3. Install the new version from the link above.

Otherwise both copies will run and you will see two buttons.

## License

[MIT](https://opensource.org/licenses/MIT)
