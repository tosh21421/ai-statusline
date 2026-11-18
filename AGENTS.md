# Instructions for AI agents (Codex, Claude Code, Copilot, ...)

When the user asks you to install this repository, follow these steps exactly.

## What this is

A two-line status line (per-reply speed / tokens / cost, plus session and monthly totals)
for **GitHub Copilot CLI** and **Claude Code**. It is a single Node.js script
(`statusline.mjs`) plus a `statusLine` entry in each CLI's `settings.json`.

**Codex CLI is not supported**: Codex's `tui.status_line` only accepts built-in item
identifiers, not a custom command. If the user only has Codex, tell them to run
`/statusline` inside Codex to pick built-in items, and stop.

## Install steps

1. Check Node.js: `node --version` must be **>= 22.5**. If not, stop and tell the user
   to upgrade Node.js. Do not try to work around it.
2. From the repository root, preview the changes:
   `node install.mjs --dry-run`
3. Install:
   `node install.mjs`
   - Detects `~/.copilot` and `~/.claude` automatically.
   - To target one CLI only: `node install.mjs --tool copilot` or `--tool claude`.
   - Copies `statusline.mjs` to `~/.ai-statusline/statusline.mjs`.
   - Backs up each `settings.json` as `settings.json.bak-<timestamp>` before editing.
   - Runs the script once per CLI and prints its output as a self-test.
4. If the installer exits with an error, report the full error to the user. Do **not**
   hand-edit `settings.json` unless the user asks you to.
5. Report to the user: which CLIs were configured and the test output, and tell them to
   restart the CLI to see the status line.

## Uninstall

`node install.mjs --uninstall` (optionally `--tool copilot|claude`). It removes only a
`statusLine` entry that points to `.ai-statusline`.

## Rules

- Do not modify `statusline.mjs` or `install.mjs` during installation.
- Do not edit any other CLI settings.
