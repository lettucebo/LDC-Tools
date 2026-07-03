[English](./README.md) | 繁體中文

# MS Learn Lang Switch (zh-CN)

> 適用範圍：任何符合 `https://*.microsoft.com/{en-us|zh-cn}/...`（語系比對不分大小寫）的頁面 —— Microsoft Learn、Docs、Support（`support.microsoft.com`），以及其他 `*.microsoft.com` 系列站點。像 `en-US` / `zh-CN` 這類大寫語系碼也能處理。

## 功能說明

在頁面右上角注入一顆小型浮動按鈕（`top:6px`、`right:6px`），用來在 URL 的語系區段 `en-us` 與 `zh-cn` 之間切換：

- 在 `en-us` 頁面時，按鈕顯示 **`簡`** —— 點下後跳到對應的 `zh-cn` 網址。
- 在 `zh-cn` 頁面時，按鈕顯示 **`EN`** —— 點下後跳回對應的 `en-us` 網址。

按鈕平常呈半透明（opacity `0.3`），滑鼠移到上面才會變得明顯，以免影響頁面瀏覽。

## 安裝方式

[![安裝](https://img.shields.io/badge/Tampermonkey-Install-00485B?logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-cn/ms-learn-lang-switch-cn.user.js)
<br/>💡 _對上方安裝徽章 **Ctrl/⌘-click**（或中鍵點擊）以新分頁開啟 — GitHub 會把 README 連結的 `target="_blank"` 剝掉，直接點會讓當前分頁切走。_

1. 先安裝 [Tampermonkey](https://www.tampermonkey.net/)（或相容的使用者腳本管理器，例如 Violentmonkey）。
2. 點擊上方安裝連結 —— Tampermonkey 會自動辨識 `.user.js` 並彈出安裝視窗。
3. 確認安裝。接著前往任一 `https://*.microsoft.com/en-us/...` 或 `.../zh-cn/...` 頁面，右上角即會出現切換按鈕。

## 運作原理

腳本以正則 `/com\/(en-us|zh-cn)\//i`（`i` 旗標讓比對不分大小寫，因此 `support.microsoft.com` 上的 `en-US` / `zh-CN` 等大寫語系碼也能比對）解析目前的網址。比對成功時：

1. 紀錄當前語系（`en-us` 或 `zh-cn`）。
2. 將一段 `<style>` 與一顆 `<div id="lang-switch">` 注入頁面。
3. 點擊按鈕時，以 `location.toString().replace(/com\/(en-us|zh-cn)\//i, ...)` 改寫語系區段並導向新網址（改寫後一律使用小寫的目標語系碼，各 `*.microsoft.com` 站點皆可接受）。

若頁面不屬於 `en-us` 或 `zh-cn`，腳本不會渲染按鈕。

## 搭配腳本

- [`ms-learn-lang-switch-tw`](../ms-learn-lang-switch-tw/) —— 同系列腳本，負責 `en-us` 與 `zh-tw`（繁體中文）之間的切換。

兩支腳本設計上可在同一頁面共存：

| 腳本                        | 按鈕位置   | 切換語系          |
| --------------------------- | --------- | ----------------- |
| `ms-learn-lang-switch-cn`   | `top:6px`  | `en-us` ↔ `zh-cn` |
| `ms-learn-lang-switch-tw`   | `top:40px` | `en-us` ↔ `zh-tw` |

需要一鍵跳到簡體與繁體中文兩種版本時，可以兩支同時安裝。

## 從舊版 gist (≤ v0.2) 升級

舊版腳本原本以 [GitHub gist](https://gist.github.com/lettucebo/75f05f94b7ee2dace41b5ec06b6bf022) 發佈。從 **v0.3.0** 起，腳本搬到本 repo，`@namespace` 也由 `http://tampermonkey.net/` 改為 `https://github.com/lettucebo/TampermonkeyScripts`。

Tampermonkey 以 `@namespace` + `@name` 辨識腳本，因此 repo 版會被視為與 gist 版**不同**的腳本。如果你先前是從 gist 安裝的：

1. 開啟 Tampermonkey 管理面板。
2. 找到舊的 `中英快速切換 - CN` 並移除。
3. 再從上方連結安裝新版。

否則兩份腳本會同時執行，你會看到兩顆按鈕。

## 授權

[MIT](https://opensource.org/licenses/MIT)
