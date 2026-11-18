# ai-statusline

GitHub Copilot CLI 與 Claude Code 共用的兩行狀態列：

```
🗨 本次回覆  ⚡ ↑ 21.8k tok/s  ↓ 154 tok/s  │  846.1K tok, 13 calls  │  💳 66.29 cr
📊 總計      💬 本對話 1.61M tok (↑1.59M ↓23.9K) 124.05 cr  │  本月(11/01-11/18) 2.27M tok (↑2.23M ↓40.8K) 227.24 cr
```

| | Copilot CLI | Claude Code | Codex CLI |
|---|---|---|---|
| 支援 | ✅ | ✅ | ❌（只能用內建 `/statusline` 項目） |
| 速度 | ↑ 輸入 / ↓ 輸出 | 只有 ↓（≈ 估計） | |
| 花費單位 | credits（`cr`） | Claude 估算的 USD | |
| 資料來源 | `~/.copilot/session-store.db` | `~/.claude/projects/**/*.jsonl` | |

需求：**Node.js >= 22.5**。

## 安裝

### 方法一：讓 agent 安裝

在 Claude Code、Codex 或 Copilot CLI 裡，把工作目錄切到這個資料夾，然後輸入：

> 請閱讀 AGENTS.md，並依照指示安裝這個 repo

### 方法二：自己安裝

```sh
git clone <this-repo-url> ai-statusline   # 或解壓縮 zip
cd ai-statusline
node install.mjs --dry-run   # 先預覽會改什麼
node install.mjs             # 自動偵測 Copilot / Claude 並安裝
```

- 只裝其中一個：`node install.mjs --tool copilot` 或 `--tool claude`
- 解除安裝：`node install.mjs --uninstall`

安裝程式會做這些事：

1. 把 `statusline.mjs` 複製到 `~/.ai-statusline/`。
2. 先把 `settings.json` 備份成 `settings.json.bak-<時間>`。
3. 寫入 `statusLine` 設定。
4. 實際執行一次腳本，確認可以正常運作。

裝完重開 CLI 就會看到狀態列。

### 手動設定

在 `~/.copilot/settings.json` 或 `~/.claude/settings.json` 加入：

```json
"statusLine": {
  "type": "command",
  "command": "node --no-warnings \"<HOME>/.ai-statusline/statusline.mjs\" --tool claude"
}
```

Copilot 版把 `--tool claude` 改成 `--tool copilot`。

## 注意事項

- Claude Code 只提供整個 session 的累計花費，所以「本回覆」和「本月」的 USD 是腳本自己算差額累計的。只會從安裝之後開始算，以前的花費不會補上。
- Claude 的解析快取存在 `~/.ai-statusline/claude-cache.json`，刪掉也沒關係，下次會自動重建。
