English | [繁體中文](./README.zh-TW.md)

# TampermonkeyScripts

> A personal collection of [Tampermonkey](https://www.tampermonkey.net/)
> userscripts by [lettucebo](https://github.com/lettucebo).

Each userscript lives in its own folder under `scripts/<script-id>/`,
with its own README, CHANGELOG, and (when applicable) tests. Click an
**Install** button below to install via Tampermonkey, or open the
script's README for full details.

> **Note on repo history**: this repo was previously `lettucebo/LDC-Tools`
> and only held the LDC Batch Downloader. It was renamed and restructured
> in May 2026 to host multiple userscripts. Existing `LDC-Tools` v0.5.0
> installs of LDC will not auto-update — please re-install from the table
> below to receive 0.6.0+ updates.

## Scripts in this repo

| Script | Description | Install |
|---|---|---|
| **[ldc-batch-download](./scripts/ldc-batch-download/)** | Batch-download Microsoft Learning Download Center courses into a local folder, organized as `{course-code} {course-name}/{course-code}-{language}/`. | [Install](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ldc-batch-download/ldc-batch-download.user.js) |
| **[ms-learn-lang-switch-tw](./scripts/ms-learn-lang-switch-tw/)** | One-click toggle between English (`en-us`) and Traditional Chinese (`zh-tw`) on any `*.microsoft.com` page. | [Install](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-tw/ms-learn-lang-switch-tw.user.js) |
| **[ms-learn-lang-switch-cn](./scripts/ms-learn-lang-switch-cn/)** | One-click toggle between English (`en-us`) and Simplified Chinese (`zh-cn`) on any `*.microsoft.com` page. | [Install](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-cn/ms-learn-lang-switch-cn.user.js) |
| **[github-docs-lang-switch-cn](./scripts/github-docs-lang-switch-cn/)** | One-click toggle between English (`en`) and Simplified Chinese (`zh`) on `docs.github.com`. | [Install](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/github-docs-lang-switch-cn/github-docs-lang-switch-cn.user.js) |

> 💡 **Tip**: GitHub strips `target="_blank"` from README links, so plain clicks navigate this tab away. **Ctrl/Cmd-click** (or middle-click) on the **Install** links above to open them in a new tab — Tampermonkey will still pick up the install dialog there.

> The two `ms-learn-lang-switch-*` scripts are designed to coexist; their
> floating buttons are stacked vertically (`zh-CN` at `top:6px`, `zh-TW`
> at `top:40px`) so you can install both.

## Installing a script

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser
   (available in the Chrome / Edge / Brave / Firefox stores).
2. Click an **Install** link above. Tampermonkey will open an install
   dialog — click **Install**.
3. Open a page that matches the script's `@match` rule and the script
   kicks in.

> **If clicking the link shows raw source instead of an install dialog**:
> - Make sure the Tampermonkey extension is installed and enabled.
> - Chrome 117+ requires **Developer mode** to be enabled at
>   `chrome://extensions` so Tampermonkey can trigger the install dialog.
> - Still no luck? Open the Tampermonkey dashboard →
>   **Utilities** → **Import from URL** and paste the raw URL above.

## Auto-update

Every script's header sets `@updateURL` / `@downloadURL` to this repo's
raw URL. Tampermonkey checks for new versions **once per day** by
default (adjustable in Tampermonkey settings → **Externals** →
*Update interval*).

To trigger a check immediately:

- Tampermonkey dashboard → find the script → click the ⟳ icon in the
  **Last updated** column, or
- Click **Check for userscript updates** from the Tampermonkey icon menu.

## Repo conventions

- Each userscript is in `scripts/<script-id>/` with its own
  `<script-id>.user.js`, `README.md` (+ `README.zh-TW.md` if
  bilingual), and `CHANGELOG.md`.
- Single repo-wide release tag scheme: `v<X.Y.Z>` (e.g. `v0.9.0`) covers
  every script's synchronized version in one tag and one GitHub Release.
  See [RELEASING.md](./RELEASING.md) for the full procedure.
- All scripts in this repo are MIT licensed.

## Contributing

Feel free to open an issue or PR for bug fixes, new scripts, or
improvements to existing ones.

## License

[MIT](./LICENSE)
