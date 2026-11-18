#!/usr/bin/env node
// Installs the shared status line into GitHub Copilot CLI and/or Claude Code.
// Usage: node install.mjs [--tool copilot|claude|all] [--uninstall] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOME = os.homedir();
const INSTALL_DIR = path.join(HOME, '.ai-statusline');
const TARGET_SCRIPT = path.join(INSTALL_DIR, 'statusline.mjs');
const SOURCE_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'statusline.mjs');

const TOOLS = {
  copilot: {
    name: 'GitHub Copilot CLI',
    home: process.env.COPILOT_HOME || path.join(HOME, '.copilot'),
    sample: { session_id: 'install-test' },
  },
  claude: {
    name: 'Claude Code',
    home: process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'),
    sample: { session_id: 'install-test', cost: { total_cost_usd: 0 } },
  },
};

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes('--dry-run');
const uninstall = args.includes('--uninstall');
const toolArg = opt('--tool') || 'all';

function log(msg) {
  console.log(`${dryRun ? '[dry-run] ' : ''}${msg}`);
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    fail(`Node.js >= 22.5 is required (found ${process.versions.node}).`);
  }
}

function commandFor(tool) {
  return `node --no-warnings "${TARGET_SCRIPT}" --tool ${tool}`;
}

function selectedTools() {
  if (toolArg === 'all') {
    const found = Object.keys(TOOLS).filter((t) => fs.existsSync(TOOLS[t].home));
    if (!found.length) fail(`No supported CLI found (looked for ${Object.values(TOOLS).map((t) => t.home).join(', ')}).`);
    return found;
  }
  if (!TOOLS[toolArg]) fail(`Unknown --tool "${toolArg}". Use copilot, claude or all.`);
  return [toolArg];
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`${file} is not plain JSON (${e.message}). Edit it manually; see README.md.`);
  }
}

function writeSettings(file, data) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, `${file}.bak-${stamp}`);
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function install(tool) {
  const t = TOOLS[tool];
  const file = path.join(t.home, 'settings.json');
  const settings = readSettings(file);
  const prev = settings.statusLine?.command;
  settings.statusLine = { ...(settings.statusLine || {}), type: 'command', command: commandFor(tool) };
  if (tool === 'copilot') settings.footer = { ...(settings.footer || {}), showCustom: true };
  writeSettings(file, settings);
  log(`${t.name}: statusLine -> ${commandFor(tool)}`);
  if (prev && prev !== commandFor(tool)) log(`  (replaced previous command: ${prev}; backup saved next to settings.json)`);
}

function remove(tool) {
  const t = TOOLS[tool];
  const file = path.join(t.home, 'settings.json');
  const settings = readSettings(file);
  if (!settings.statusLine?.command?.includes('.ai-statusline')) {
    log(`${t.name}: no ai-statusline entry, skipped`);
    return;
  }
  delete settings.statusLine;
  writeSettings(file, settings);
  log(`${t.name}: statusLine removed`);
}

function verify(tool) {
  const r = spawnSync(process.execPath, ['--no-warnings', TARGET_SCRIPT, '--tool', tool], {
    input: JSON.stringify(TOOLS[tool].sample),
    encoding: 'utf8',
  });
  const out = (r.stdout || '').trim();
  if (r.status !== 0 || !out || out.startsWith('statusline error')) {
    fail(`${TOOLS[tool].name} test run failed:\n${out}\n${r.stderr || ''}`);
  }
  log(`${TOOLS[tool].name} test output:\n${out}`);
}

checkNode();
const tools = selectedTools();

if (uninstall) {
  tools.forEach(remove);
  log(`Done. ${INSTALL_DIR} was left in place; delete it manually if no longer needed.`);
} else {
  if (!fs.existsSync(SOURCE_SCRIPT)) fail(`statusline.mjs not found next to install.mjs (${SOURCE_SCRIPT}).`);
  if (!dryRun) {
    fs.mkdirSync(INSTALL_DIR, { recursive: true });
    fs.copyFileSync(SOURCE_SCRIPT, TARGET_SCRIPT);
  }
  log(`Copied statusline.mjs -> ${TARGET_SCRIPT}`);
  tools.forEach(install);
  if (!dryRun) tools.forEach(verify);
  log('Done. Restart the CLI (or wait for its next status refresh) to see the new status line.');
}
