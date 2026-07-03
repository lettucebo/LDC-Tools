[English](./README.md) | 繁體中文

# MS Learn Lang Switch (zh-TW)

> 一個小巧的 Tampermonkey 使用者腳本。在 Microsoft Learn（以及任何使用 `/{locale}/` URL 慣例的 `*.microsoft.com` 頁面）右上角加上一個浮動按鈕，一鍵在英文 (`en-us`) 與繁體中文 (`zh-tw`) 之間切換。套用範圍：`https://*.microsoft.com/*/*`。語系比對不分大小寫，因此 `support.microsoft.com` 上的 `en-US` / `zh-TW` 等大寫語系碼也能運作。

## 功能

- 在頁面右上角加上一個固定定位的小按鈕。
- 在 `en-us` 頁面時按鈕顯示「繁」，點一下會以 `zh-tw` 重新載入相同路徑。
- 在 `zh-tw` 頁面時按鈕顯示「EN」，點一下會以 `en-us` 重新載入相同路徑。
- 按鈕位置設在 `top:40px`，會剛好疊在 zh-CN 姊妹腳本（`ms-learn-lang-switch-cn`，位於 `top:6px`）按鈕**下方**，兩個腳本可同時安裝。

## 安裝

👉 **[安裝 ms-learn-lang-switch-tw.user.js](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ms-learn-lang-switch-tw/ms-learn-lang-switch-tw.user.js)**
<br/>💡 _對上方連結 **Ctrl/⌘-click**（或中鍵點擊）以新分頁開啟 — GitHub 會把 README 連結的 `target="_blank"` 剝掉，直接點會讓當前分頁切走。_

請先在瀏覽器中安裝 [Tampermonkey](https://www.tampermonkey.net/)（或其他相容的使用者腳本管理器）。安裝後，Tampermonkey 會讀取 `@updateURL` / `@downloadURL`，所以**已啟用自動更新**，未來版本會自動套用。

## 運作原理

此腳本套用於符合 `https://*.microsoft.com/*/*` 的網址，並用以下正規表示式檢查目前的 URL：

```
/com\/(en-us|zh-tw)\//i
```

`i` 旗標讓比對不分大小寫，因此 `support.microsoft.com` 上的 `en-US` / `zh-TW` 等大寫語系碼也能比對。如果 URL **沒有** `en-us` 或 `zh-tw` 區段（不分大小寫），腳本不會做任何事，也不會插入按鈕，因此不會干擾未使用此語系慣例的頁面。

點擊按鈕時，腳本只會替換 URL 中的單一語系區段（`en-us` ⇄ `zh-tw`）並導向，其餘路徑保持不變。

## 姊妹腳本

- [`ms-learn-lang-switch-cn`](../ms-learn-lang-switch-cn/) — zh-CN（簡體中文）版本。

兩個腳本各自獨立，可並存：

| 腳本 | 切換語系 | 按鈕位置 |
| --- | --- | --- |
| `ms-learn-lang-switch-tw`（本腳本） | `en-us` ⇄ `zh-tw` | `top:40px` |
| `ms-learn-lang-switch-cn` | `en-us` ⇄ `zh-cn` | `top:6px` |

兩個都安裝的話，右上角會看到兩顆按鈕上下堆疊。

## 從 gist 版本升級（≤ v0.2）

如果你之前從原本的 gist <https://gist.github.com/lettucebo/fa14fd6954dfa403c437d02010b9589f> 安裝過此腳本，**請先到 Tampermonkey 後台手動移除舊版**，再從本 repo 安裝。

Tampermonkey 是用 `(@name, @namespace)` 這組合來識別腳本。本版的 `@namespace` 已從 `http://tampermonkey.net/` 改為 `https://github.com/lettucebo/TampermonkeyScripts`，所以 Tampermonkey 會把 repo 版本視為**不同的腳本**。在你移除舊的 gist 安裝之前，可能會在同一個頁面上看到**兩個按鈕**同時執行。

## 授權

MIT
