[English](./README.md) | 繁體中文

# TampermonkeyScripts

> [lettucebo](https://github.com/lettucebo) 個人
> [Tampermonkey](https://www.tampermonkey.net/) userscript 集合。

每支 userscript 各自獨立在 `scripts/<script-id>/` 資料夾下，含自己的
README、CHANGELOG，以及（如適用）測試。下方點 **Install** 直接在
Tampermonkey 安裝，或點 script 名稱開啟詳細說明。

> **Repo 歷史**：本 repo 原名 `lettucebo/LDC-Tools`，只放 LDC Batch
> Downloader 一支 script。2026 年 5 月改名並重構為多 script 集合。
> 既有的 LDC `LDC-Tools` v0.5.0 安裝因路徑變更無法自動更新，請從下表
> 連結重新安裝以取得 0.6.0 後續更新。

## Repo 內的 Scripts

| Script | 用途 | Install |
|---|---|---|
| **[ldc-batch-download](./scripts/ldc-batch-download/)** | 在 Microsoft Learning Download Center 批次下載多門課程到本機資料夾，自動依 `{課程編號} {課程名稱}/{課程編號}-{語言}/` 結構整理。 | [Install](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ldc-batch-download/ldc-batch-download.user.js) |
| **[ms-learn-lang-switch-tw](./scripts/ms-learn-lang-switch-tw/)** | 在任何 `*.microsoft.com` 頁面一鍵切換英文 (`en-us`) ↔ 繁體中文 (`zh-tw`)。 | [Install](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-tw/ms-learn-lang-switch-tw.user.js) |
| **[ms-learn-lang-switch-cn](./scripts/ms-learn-lang-switch-cn/)** | 在任何 `*.microsoft.com` 頁面一鍵切換英文 (`en-us`) ↔ 簡體中文 (`zh-cn`)。 | [Install](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-cn/ms-learn-lang-switch-cn.user.js) |
| **[github-docs-lang-switch-cn](./scripts/github-docs-lang-switch-cn/)** | 在 `docs.github.com` 一鍵切換英文 (`en`) ↔ 簡體中文 (`zh`)。 | [Install](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/github-docs-lang-switch-cn/github-docs-lang-switch-cn.user.js) |

> 💡 **小提示**：GitHub 會把 README 連結的 `target="_blank"` 剝掉，直接點會讓當前分頁切走。請對上方 **Install** 連結 **Ctrl/⌘-click**（或中鍵點擊）以新分頁開啟 — Tampermonkey 在新分頁仍會跳出安裝對話框。

> 兩支 `ms-learn-lang-switch-*` script 設計為可並存，浮動按鈕會垂直
> 堆疊（`zh-CN` 在 `top:6px`、`zh-TW` 在 `top:40px`），可同時安裝。

## 安裝 script

1. 安裝瀏覽器 [Tampermonkey](https://www.tampermonkey.net/) 擴充功能
   （Chrome / Edge / Brave / Firefox 商店均有）。
2. 點上方 **Install** 連結，Tampermonkey 會跳出安裝對話框 → 點
   **Install**。
3. 開啟符合該 script `@match` 規則的頁面，script 自動生效。

> **如果點連結後看到的是原始碼而不是安裝對話框**：
> - 確認 Tampermonkey 擴充功能已啟用
> - Chrome 117+ 需要在 `chrome://extensions` 開啟 **開發者模式**
> - 仍無法安裝？打開 Tampermonkey 儀表板 → **工具** → **從網址匯入**，
>   貼上上方原始 URL 手動匯入

## 自動更新

每支 script 的 header 都設有 `@updateURL` / `@downloadURL` 指向本 repo
的 raw URL。Tampermonkey 預設每日檢查更新一次（可在 Tampermonkey 設定
→ **外部資源** → *更新檢查間隔* 調整）。

立即觸發檢查的方式：

- Tampermonkey 儀表板 → 找到該 script → 點 **最後更新** 欄位的 ⟳ 圖示
- 或從 Tampermonkey 圖示選單點 **檢查使用者腳本更新**

## Repo 慣例

- 每支 userscript 在 `scripts/<script-id>/` 下，有自己的
  `<script-id>.user.js`、`README.md`（雙語另含 `README.zh-TW.md`）、
  `CHANGELOG.md`。
- 單一 repo-wide release tag 方案：`v<X.Y.Z>`（如 `v0.9.0`），一個 tag、
  一個 GitHub Release 涵蓋所有 script 的同步版號。詳見
  [RELEASING.md](./RELEASING.md)。
- 所有 script 採 MIT 授權。

## 貢獻

歡迎開 issue / PR：bug 修復、新 script、既有 script 改進。

## License

[MIT](./LICENSE)
