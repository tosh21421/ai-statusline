<div align="center">

# 📊 ai-statusline

**讓 AI CLI 的狀態列即時顯示：這次回覆有多快、用了多少 token、花了多少錢。**

GitHub Copilot CLI 與 Claude Code 共用｜零相依套件｜一行指令安裝

![preview](docs/preview-copilot.png)

<sub>▲ 在 GitHub Copilot CLI 中的實際畫面（下方兩行就是 ai-statusline）</sub>

</div>

---

## ✨ 功能

- ⚡ **即時速度**：最新一次 API 呼叫的輸入（↑）與輸出（↓）速度，單位 tok/s
- 🗨 **本次回覆**：這次回覆總共用了多少 token、呼叫了幾次 API、花了多少錢（子代理也算在內）
- 💬 **本對話**：整個 session 累計的 token 和花費
- 📅 **本月**：從 1 號到今天的累計用量
- 🪶 **輕量**：只需要 Node.js，不用 `npm install`。Claude 的大型紀錄檔採增量解析，每次刷新約 0.1 秒
- 🛡️ **安全安裝**：修改前自動備份 `settings.json`，也能一鍵解除安裝

## 🖥️ 畫面說明

```
🗨 本次回覆  ⚡ ↑ 18.9k tok/s  ↓ 985 tok/s  │  1.09M tok, 11 calls  │  💳 29.34 cr
📊 總計      💬 本對話 3.77M tok (↑3.73M ↓37.5K) 245.34 cr  │  本月(11/01-11/18) 4.43M tok (↑4.38M ↓54.4K) 348.53 cr
```

| 欄位 | 意思 |
|---|---|
| `↑ 18.9k tok/s` | 輸入處理速度：最新一次呼叫的 input tokens ÷ 首個 token 的等待時間 |
| `↓ 985 tok/s` | 輸出生成速度：最新一次呼叫的 output tokens ÷ 生成時間 |
| `1.09M tok, 11 calls` | 從你送出這則訊息到現在，所有 API 呼叫的 token 總和與呼叫次數 |
| `💳 29.34 cr` | 這次回覆的花費（Copilot 單位是 credits，Claude 是 USD） |
| `本對話 3.77M tok (↑… ↓…)` | 這個 session 的累計 token（↑ 輸入 / ↓ 輸出） |
| `本月(11/01-11/18)` | 本月所有 session 的累計 token 與花費 |

> 💡 輸入 token 包含 prompt cache 的讀寫，所以通常會遠大於輸出 token，這是正常的。

## 🧩 支援的 CLI

| | GitHub Copilot CLI | Claude Code | Codex CLI |
|---|:---:|:---:|:---:|
| 支援 | ✅ | ✅ | ❌ |
| 速度 | ↑ 輸入 + ↓ 輸出 | 只有 ↓（`≈` 估計值） | — |
| 花費單位 | credits（`cr`） | Claude 估算的 USD（`$`） | — |
| 資料來源 | `~/.copilot/session-store.db` | `~/.claude/projects/**/*.jsonl` | — |

> Codex 的狀態列（`tui.status_line`）只能挑內建項目，不能跑自訂腳本。請在 Codex 裡輸入 `/statusline` 選擇內建項目。

## 📦 安裝

**需求：Node.js 22.5 以上**（用 `node --version` 確認）

### 方法一：交給 AI agent 安裝（推薦）

clone 或解壓縮之後，在這個資料夾裡開 Claude Code、Codex 或 Copilot CLI，輸入：

```
請閱讀 AGENTS.md，並依照指示安裝這個 repo
```

agent 會檢查 Node 版本、先預覽變更、安裝，最後回報測試結果。

### 方法二：自己用指令安裝

```sh
git clone https://github.com/tosh21421/ai-statusline.git
cd ai-statusline
node install.mjs --dry-run   # 先預覽會改什麼（不會寫入任何檔案）
node install.mjs             # 自動偵測 Copilot / Claude 並安裝
```

成功的話會看到：

```
Copied statusline.mjs -> C:\Users\you\.ai-statusline\statusline.mjs
GitHub Copilot CLI: statusLine -> node --no-warnings "...\statusline.mjs" --tool copilot
Claude Code: statusLine -> node --no-warnings "...\statusline.mjs" --tool claude
GitHub Copilot CLI test output:
🗨 本次回覆  ⚡ ↑ - tok/s  ↓ - tok/s  │  0 tok, 0 calls  │  💳 0.000 cr
...
Done. Restart the CLI (or wait for its next status refresh) to see the new status line.
```

**重開 CLI** 就會看到狀態列。

### 安裝程式的參數

| 指令 | 作用 |
|---|---|
| `node install.mjs` | 自動偵測已安裝的 CLI，全部設定 |
| `node install.mjs --tool copilot` | 只裝 Copilot CLI |
| `node install.mjs --tool claude` | 只裝 Claude Code |
| `node install.mjs --dry-run` | 只預覽，不寫入 |
| `node install.mjs --uninstall` | 解除安裝（只移除指向 ai-statusline 的設定） |

安裝程式會：

1. 把 `statusline.mjs` 複製到 `~/.ai-statusline/`
2. 把 `settings.json` 備份成 `settings.json.bak-<時間>`
3. 寫入 `statusLine` 設定
4. 實際執行一次腳本，確認能正常運作

### 手動設定

不想用安裝程式的話，把 `statusline.mjs` 放到任意位置，然後在 `~/.copilot/settings.json` 或 `~/.claude/settings.json` 加入：

```json
"statusLine": {
  "type": "command",
  "command": "node --no-warnings \"<路徑>/statusline.mjs\" --tool claude"
}
```

Copilot 版把 `--tool claude` 改成 `--tool copilot`。

## 🔄 更新

```sh
cd ai-statusline
git pull
node install.mjs
```

## ❓ 常見問題

**狀態列沒出現？**
- 重開 CLI。
- 手動執行看看有沒有錯誤：`echo {} | node --no-warnings ~/.ai-statusline/statusline.mjs --tool copilot`
- Copilot CLI：確認 `settings.json` 裡的 `footer.showCustom` 不是 `false`。

**顯示 `statusline error: ...`？**
- 多半是 Node.js 版本太舊。Copilot 版需要 Node 22.5 以上內建的 `node:sqlite`。

**安裝程式說 `settings.json is not plain JSON`？**
- 你的 `settings.json` 裡有註解或格式錯誤。安裝程式為了安全不會覆寫，請改用上面的「手動設定」。

**Claude 的「本回覆」或「本月」花費是 $0？**
- Claude Code 只提供整個 session 的累計花費，這兩個數字是腳本自己算差額累計的，只會從安裝之後開始算。
- token 數則會讀取完整的歷史紀錄，不受影響。

**狀態列太長、換行了？**
- 終端機視窗拉寬一點，或改 `statusline.mjs` 裡的 `render()` 函式調整顯示內容。

## 🗂️ 檔案結構

```
ai-statusline/
├── statusline.mjs   # 狀態列腳本（--tool copilot|claude）
├── install.mjs      # 安裝 / 解除安裝程式
├── AGENTS.md        # 給 AI agent 看的安裝說明（Codex、Copilot）
├── CLAUDE.md        # Claude Code 讀這個檔，內容引用 AGENTS.md
└── docs/            # README 用的截圖
```

## ⚙️ 運作原理

- CLI 每次刷新狀態列時，會執行 `statusline.mjs`，並透過 stdin 傳入 session 資訊（JSON）。
- **Copilot**：以唯讀方式查詢 `~/.copilot/session-store.db` 的 `assistant_usage_events`。從最近一筆使用者發起的呼叫開始，算到現在為止，就是「本次回覆」。
- **Claude**：增量解析對話紀錄 JSONL，同一則訊息拆成多個區塊時只算一次。解析位置記在 `~/.ai-statusline/claude-cache.json`，這個檔可以隨時刪除，下次會自動重建。
