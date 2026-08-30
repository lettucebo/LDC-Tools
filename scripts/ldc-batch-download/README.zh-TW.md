[English](./README.md) | 繁體中文

# LDC 批次下載 — Microsoft Learning Download Center

> 一個 Tampermonkey userscript，讓你在
> [Microsoft Learning Download Center](https://learningdownloadcenter.microsoft.com/)
> 一次勾選多門課程並批次下載到本機指定資料夾，自動依
> `{課程編號} {課程名稱}/{課程編號}-{語言}/` 結構整理。

## 它做什麼

預設 LDC 網站的「Download」按鈕一次只能下載一門課程，且每次都要逐一打開。
本 userscript 在原網站上加：

- 每個課程列項旁邊一個 ✅ checkbox
- 頁首一條工具列：選資料夾／全選／清除／🆕 選取已更新／下載／📊 顯示進度
- 浮動進度面板（含失敗重試、複製錯誤清單）
- 下載前的確認對話框（顯示課程數／檔案數／總大小／目的地）
- 上次下載追蹤：`⏱ Last download` 標籤與 `🆕` 標記，標示出上次下載後有更新的
  課程（詳見下方[上次下載追蹤](#上次下載追蹤)）

下載到本機後資料夾結構長這樣：

```
你選的資料夾/
├─ AZ-040 Automate Administration with PowerShell/      ← 注意 T00 已自動省略
│  ├─ AZ-040-English/
│  │  ├─ AZ-040T00A-ENU-Change-Log.pdf                  ← 檔名保留 Microsoft 原命名
│  │  ├─ AZ-040T00A-ENU-Powerpoint.zip
│  │  └─ AZ-040T00A-ENU-TrainerPrepGuide.pdf
│  └─ AZ-040-Japanese/
│     ├─ AZ-040T00-PowerPoint.ja-JP.zip
│     └─ AZ-040T00-Readme.ja-JP.txt
└─ AI-3017 Microsoft AI for business leaders/
   ├─ AI-3017-Arabic/
   ├─ AI-3017-Chinese Simplified/
   └─ ...
```

> **資料夾命名規則**：課程編號若以 `T00` 或 `T00A`（Microsoft 訓練課程版本後綴）結尾，
> 會自動省略，例如 `AZ-040T00` → `AZ-040`、`PL-300T00A` → `PL-300`。
> 沒有 T00 的編號（如 `AZ-1002`、`AI-3017`、`AZ-2003`）維持不變。
> **檔名本身**（如 `AZ-040T00A-ENU-Powerpoint.zip`）會保留 Microsoft 原始命名，
> 不會被改寫。

> **從 0.2.x 升上來的使用者**：先前下載的資料夾（`AZ-040T00 ...`）腳本會把它當成
> 不存在的目錄，重新下載到新名稱（`AZ-040 ...`）。如果想要沿用既有檔案、避免重下，
> 把舊資料夾手動改名（去掉 `T00`、`T00A` 後綴）即可，子資料夾也一併改名。


## 瀏覽器需求

**Chromium 系列瀏覽器（Chrome / Edge / Brave / Opera 等）**。
腳本使用
[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
直接寫入你選的資料夾，目前 Firefox 不支援。

## 安裝

1. 安裝 [Tampermonkey](https://www.tampermonkey.net/)
   （Chrome / Edge / Brave 商店都有）
2. 點以下連結，Tampermonkey 會自動跳出安裝對話框：

   👉 **[安裝 ldc-batch-download.user.js](https://raw.githubusercontent.com/lettucebo/TampermonkeyScripts/main/scripts/ldc-batch-download/ldc-batch-download.user.js)**
   <br/>💡 _對上方連結 **Ctrl/⌘-click**（或中鍵點擊）以新分頁開啟 — GitHub 會把 `target="_blank"` 剝掉，直接點會讓當前分頁切走。_

3. 點 **Install**
4. 打開 <https://learningdownloadcenter.microsoft.com/>
   登入後頁首應該會出現藍色的「LDC Batch Downloader」工具列

> **若點連結沒跳安裝對話框、反而看到原始程式碼**：
>
> - 確認你已安裝 Tampermonkey 擴充並且已啟用
> - Chrome 117+ 需要在 `chrome://extensions` 開啟 Tampermonkey 的 **Developer mode** 才能讓 userscript 觸發安裝對話框
> - 仍不行就改手動：開 Tampermonkey 後台 → **Utilities** → **Import from URL** 貼上面那個 raw URL

## 自動更新

腳本 header 有設定 `@updateURL` / `@downloadURL` 指向 GitHub raw，Tampermonkey
預設**每天**會檢查一次新版（可在 Tampermonkey 設定 → **Externals** → *Update interval*
調整成立刻、每小時或關閉）。

當 GitHub 上的 `@version` 比本地高時，Tampermonkey 會自動下載新版並提示。

立即手動觸發：

- Tampermonkey 後台 → 找到 **LDC Batch Downloader** → 右側 **last updated** 欄
  點 ⟳ icon → 強制檢查
- 或在 Tampermonkey icon 選單點 **Check for userscript updates**

## 使用步驟

1. **第一次使用**：點頁首的 `📁 Choose folder`，選擇要把課程存到哪個本機資料夾
   （例：`D:\OneDrive\MTT\Decks` 或任何位置）
   - 瀏覽器會跳出資料夾選擇器並要求授權
   - 授權之後會記住這個資料夾，下次不用重選
2. **勾選課程**：把想下載的課程列項勾起來（可以跨類別、跨語言）
   - **點擊**勾選框：切換該列
   - **Shift+點擊**另一列：把「上次點擊的列」到目前這一列之間（含兩端）
     所有可見的課程一次全部勾選；範圍限制在**同一個類別內**
3. **下載**：點 `⬇ Download selected`
   - 會先彈出確認對話框（課程數／檔案數／總大小）
   - 點 `Start download` 開始下載
4. 浮動進度面板會即時顯示每個檔案的狀態
   - 已存在且大小相同的檔案會自動跳過（可重跑同一批）
   - 失敗的檔案在面板顯示，可以「複製錯誤清單」

## Tampermonkey 選單命令

點 Tampermonkey icon → LDC Batch Downloader 可看到：

- `LDC: Reset chosen folder` — 清除已記住的資料夾，下次會再問
- `LDC: Set concurrency (1-4)` — 改並行下載數（預設 2）
- `LDC: Token status` — 顯示目前認證 token 還有多久過期
- `LDC: Reset last-download history` — 跳出確認提示後，清除全域
  `⏱ Last download` 時間戳與所有每課程時間戳；清除後所有 `🆕` 標記都會
  消失，直到你下次下載

## 依更新日期排序

工具列右側有一個 `Sort:` 下拉，可切換三種模式：

- `Sort: Default` — 維持 LDC 網站原本的順序
- `Sort: Updated ↓ (newest first)` — 依「最近更新日期」由新到舊排列
- `Sort: Updated ↑ (oldest first)` — 依「最近更新日期」由舊到新排列

行為細節：

- **僅在每個分類內部排序**（不會跨分類重排），分類本身的順序不會被動到。
- 「課程的更新日期」= 該課程旗下所有檔案 `lastModified` 取最新值。
- 沒有日期資訊的課程會穩定排到該分類尾端。
- 切換模式或展開新分類時會即時套用，切回 `Default` 後重新整理頁面即還原原順序。
- 選擇會用 `GM.setValue` 持久化，下次開啟頁面記住上次選擇。
- 若 LDC API 沒有提供任何日期欄位，下拉會自動 disable 並顯示 ⚠️ 提示。

## 上次下載追蹤

工具列會記住你上次成功下載的時間，讓你不用逐列手動核對就能看出哪些課程有新內容。

- **`⏱ Last download: <日期/時間>`**：顯示上一次「完全成功」的批次結束時間。
  只有在批次**全部完成、沒有任何失敗檔案、沒有暫停、也沒有取消**的情況下
  才會前進 — 只要有任何檔案失敗，或你中途取消/暫停，這個標籤都不會更新。
  滑鼠移過去可看到完整本機時間，以及目前追蹤了幾門課程各自的時間戳。
- **每課程時間戳各自獨立前進**。即使同一批次裡其他課程有失敗，只要某課程
  自己的檔案**全部**完成為 `done` 或 `skipped`，該課程的時間戳依然會更新
  — 不會因為別的課程失敗而被拖累。
- **跳過的同大小檔案視為成功**。因為磁碟上已有相同大小的檔案而被跳過的
  檔案，一樣算入該課程／批次的完成度，不會被當成失敗。
- **`🆕` 標記**：當某課程有檔案的 `lastModified` 晚於適用的基準時間時，
  該課程列項旁會顯示 `🆕`。基準時間優先採用該課程自己的上次下載時間戳，
  若沒有則退回採用**全域** `⏱ Last download` 時間戳。從沒下載過的課程
  因此也會有基準時間（退回全域值），而不是完全沒有基準。**第一次使用時**
  — 也就是你還沒完成過任何一次下載 — 尚無任何基準時間，所以**不會顯示
  任何標記**。
- **`🆕 Select updated` 按鈕**：只選取目前**可見**、帶有 `🆕` 標記的課程列
  （收合／隱藏的分類與列項會被略過），並**加入既有選取**而非取代它。
  在還沒有任何追蹤時間戳、或課程清單沒有日期資訊之前，此按鈕維持停用。
- **`LDC: Reset last-download history`**（見上方 Tampermonkey 選單）在確認
  提示後清除全域與每課程的時間戳；清除後所有 `🆕` 標記都會消失，直到你
  下次下載。

### 儲存限制

上次下載紀錄透過 `GM.setValue` / `GM.getValue` 儲存，**僅限於執行本腳本的
瀏覽器 profile**，與你選擇的目的地資料夾**無關**。實務上代表：

- 從**不同的瀏覽器、瀏覽器 profile 或機器**下載到**同一個**目的地資料夾，
  一開始不會有任何紀錄（沒有 `🆕` 標記），即使磁碟上早就有那些檔案。
- 反過來說，在**同一個**瀏覽器/profile 換到**不同的**目的地資料夾，既有的
  上次下載紀錄仍會保留 — `🆕` 標記與 `⏱ Last download` 標籤不受你選哪個
  資料夾影響。

## 行為細節

| 情境 | 處理 |
|---|---|
| 同檔已存在且大小相同 | 跳過 |
| 同檔已存在但大小不同 | 覆寫（v1 預設策略） |
| 大檔（100MB+） | 串流寫入（`response.body.pipeTo`），不會把整檔放進記憶體 |
| 網路錯誤 / 5xx | 自動重試 3 次（1s → 3s → 9s 退避） |
| 429 限流 | 依 `Retry-After` 暫停，並把全域並行降到 1 |
| 401 token 過期 | 暫停整批，提示重新整理頁面 |
| 下載中關掉分頁 | 整批中止；下次重跑會自動跳過已完成檔案 |
| 多分頁同時開 | `navigator.locks` 互斥，第二個分頁會被擋下 |
| 全域 `⏱ Last download` 標籤 | 只有在批次全部完成、無失敗、未暫停、未取消時才會前進 |
| 每課程上次下載時間戳 | 只要該課程自己的檔案全部完成 `done`/`skipped` 就會獨立前進，即使同批次其他課程失敗 |
| 跳過的同大小檔案（就追蹤而言） | 視為成功，計入該課程／批次的完成度 |

## 已知限制

- ❌ 不支援 Firefox（沒有 File System Access API）
- ❌ 不支援跨 session 的中斷續傳（瀏覽器重開後得整批重跑，但已下載的會自動跳過）
- ❌ 不支援個別檔案排除（一旦勾選課程，該課程所有檔案都會下載）
- ❌ 不支援自動展開所有類別「下載全站」（避免誤操作）
- ❌ 上次下載紀錄僅限於執行腳本的瀏覽器/profile/機器，與目的地資料夾無關 —
  詳見上方[儲存限制](#儲存限制)

## 開發

```powershell
# 跑純函式測試
node scripts\ldc-batch-download\test\pure-modules.test.js

# 語法檢查
node --check scripts\ldc-batch-download\ldc-batch-download.user.js
```

## 架構

`scripts/ldc-batch-download/ldc-batch-download.user.js` 是單檔 IIFE，內部模組化：

| 模組 | 職責 |
|---|---|
| `tokenInterceptor` | `document-start` hook `fetch` + XHR，攔截 SPA 的 Bearer token；解 JWT exp 預判過期 |
| `api` | `getSearchTree()` / `downloadStream()`；HTTP error 分類 |
| `courseParser` | 解析 row title (`AZ-040T00: ... (Japanese)`)，轉 canonical 資料夾名 |
| `pathSanitizer` | Windows 非法字元 / reserved name / 長度限制 |
| `treeIndex` | 從 `/api/search` 結果建立 lookup 表，分類 category vs course |
| `fsaWriter` | File System Access API 包裝，IndexedDB 持久化 handle |
| `selection` | 選取狀態（keyed by 穩定 ID） |
| `orchestrator` | 並行 queue、retry、跳過已存在、`navigator.locks` 多分頁鎖 |
| `ui` | 工具列、checkbox 注入、進度面板、preflight 對話框 |

逆向工程出的 LDC API：

- `GET /api/search` — 一次回完整課程樹，含每個檔案的 `versionId/url/language/size`
- `GET /api/download?blobPath=X&versionId=Y` — 回傳檔案 binary（需 `Authorization: Bearer ...`）

## 授權

MIT

## Changelog

請見 [CHANGELOG.md](./CHANGELOG.md)。
