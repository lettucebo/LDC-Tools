English | [繁體中文](./README.zh-TW.md)

# MS Learn Lang Switch (zh-TW)

> A tiny Tampermonkey userscript that adds a floating top-right button to toggle Microsoft Learn (and any `*.microsoft.com` page using the `/{locale}/` URL convention) between English (`en-us`) and Traditional Chinese (`zh-tw`). Scope: `https://*.microsoft.com/*/*`. Locale matching is case-insensitive, so mixed-case codes like `en-US` / `zh-TW` (used by `support.microsoft.com` KB / product articles) work too.

## What it does

- Adds a small fixed-position button to the top-right corner of the page.
- On an `en-us` page the button shows `繁`; one click reloads the same path under `zh-tw`.
- On a `zh-tw` page the button shows `EN`; one click reloads the same path under `en-us`.
- The button is positioned at `top:40px` so it stacks **below** the zh-CN sibling script's button (`ms-learn-lang-switch-cn`, which sits at `top:6px`). You can install both side by side.

## Install

👉 **[Install ms-learn-lang-switch-tw.user.js](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-tw/ms-learn-lang-switch-tw.user.js)**
<br/>💡 _**Ctrl/Cmd-click** (or middle-click) the link above to open it in a new tab — GitHub strips `target="_blank"` from README links so plain clicks navigate this tab away._

You need [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager) installed in your browser first. Once installed, Tampermonkey will pick up the `@updateURL` / `@downloadURL` from this repo, so **auto-update is enabled** — future versions land automatically.

## How it works

The script runs on any URL matching `https://*.microsoft.com/*/*`, then checks `location.pathname` against the regex:

```
/^\/(en-us|zh-tw)\//i
```

This is anchored to the **first path segment** and the `i` flag makes it case-insensitive, so it matches lowercase `en-us` / `zh-tw` and mixed-case `en-US` / `zh-TW` (used by `support.microsoft.com` KB / product articles), while ignoring locale-looking segments elsewhere in the path or query. If the first path segment is not an `en-us` or `zh-tw` locale, the script does nothing — no button is injected. This keeps it out of the way on pages that aren't localized with that convention.

When clicked, the button rewrites that single locale segment via the `URL` API (`en-us` ⇄ `zh-tw`) and navigates, preserving the rest of the path plus the query string and hash.

## Companion scripts

- [`ms-learn-lang-switch-cn`](../ms-learn-lang-switch-cn/) — the zh-CN (Simplified Chinese) sibling.

The two scripts are independent and can coexist:

| Script | Locale toggle | Button position |
| --- | --- | --- |
| `ms-learn-lang-switch-tw` (this one) | `en-us` ⇄ `zh-tw` | `top:40px` |
| `ms-learn-lang-switch-cn` | `en-us` ⇄ `zh-cn` | `top:6px` |

Install both and you get two stacked buttons in the top-right corner.

## Upgrade from gist install (≤ v0.2)

If you previously installed this script from the original gist at <https://gist.github.com/lettucebo/fa14fd6954dfa403c437d02010b9589f>, please **uninstall the old entry from your Tampermonkey dashboard before installing from this repo**.

Tampermonkey identifies userscripts by the pair `(@name, @namespace)`. The `@namespace` has changed from `http://tampermonkey.net/` to `https://github.com/lettucebo/TampermonkeyScripts`, so Tampermonkey treats the repo version as a different script. Until you remove the old gist install, you may end up with **two copies of the button** running on the same page.

## License

MIT
