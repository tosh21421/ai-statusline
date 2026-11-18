// Shared status line for AI CLIs.
// Usage: node --no-warnings statusline.mjs --tool copilot|claude   (session JSON on stdin)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const STATE_DIR = path.join(HOME, '.ai-statusline');

// ---------- formatting ----------

function formatRate(tokPerSec) {
  if (!Number.isFinite(tokPerSec) || tokPerSec <= 0) return '-';
  if (tokPerSec >= 1000) return `${(tokPerSec / 1000).toFixed(1)}k`;
  if (tokPerSec >= 100) return `${Math.round(tokPerSec)}`;
  return tokPerSec.toFixed(1);
}

function formatTokens(n) {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function formatNumber(v) {
  const n = Number(v) || 0;
  if (n >= 1000) return n.toFixed(1);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

const COST_FORMAT = {
  copilot: (v) => `${formatNumber(v)} cr`,
  claude: (v) => `$${formatNumber(v)}`,
};

function render(tool, s) {
  const cost = COST_FORMAT[tool];
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const tok = (t) => `${formatTokens(t.in + t.out)} tok (↑${formatTokens(t.in)} ↓${formatTokens(t.out)})`;
  const up = s.rate.approx ? '' : `↑ ${formatRate(s.rate.up)} tok/s  `;
  const down = `↓ ${s.rate.approx && Number.isFinite(s.rate.down) ? '≈' : ''}${formatRate(s.rate.down)} tok/s`;
  const monthCost = s.month.cost == null ? '' : ` ${cost(s.month.cost)}`;
  return [
    `🗨 本次回覆  ⚡ ${up}${down}  │  ${formatTokens(s.reply.in + s.reply.out)} tok, ${s.reply.calls} calls  │  💳 ${cost(s.reply.cost)}`,
    `📊 總計      💬 本對話 ${tok(s.session)} ${cost(s.session.cost)}  │  本月(${mm}/01-${mm}/${dd}) ${tok(s.month)}${monthCost}`,
  ].join('\n');
}

function emptyStats() {
  return {
    rate: { up: NaN, down: NaN, approx: false },
    reply: { in: 0, out: 0, calls: 0, cost: 0 },
    session: { in: 0, out: 0, cost: 0 },
    month: { in: 0, out: 0, cost: 0 },
  };
}

function monthStartDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// ---------- Copilot CLI (reads ~/.copilot/session-store.db) ----------

async function copilotStats(payload) {
  const { DatabaseSync } = await import('node:sqlite');
  const s = emptyStats();
  const copilotHome = process.env.COPILOT_HOME || path.join(HOME, '.copilot');
  const dbPath = path.join(copilotHome, 'session-store.db');
  if (!fs.existsSync(dbPath)) return s;

  const nano = (v) => (Number(v) || 0) / 1e9;
  const sumSql = `SELECT COUNT(*) AS calls,
      COALESCE(SUM(input_tokens), 0) AS in_tok,
      COALESCE(SUM(output_tokens), 0) AS out_tok,
      COALESCE(SUM(total_nano_aiu), 0) AS nano_aiu
    FROM assistant_usage_events`;
  const fill = (target, row) => {
    if (!row) return;
    target.in = Number(row.in_tok) || 0;
    target.out = Number(row.out_tok) || 0;
    target.cost = nano(row.nano_aiu);
    if ('calls' in target) target.calls = Number(row.calls) || 0;
  };

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    fill(s.month, db.prepare(`${sumSql} WHERE created_at >= ?`).get(monthStartDate().toISOString()));

    const sessionId = payload.session_id;
    const latestSql = `SELECT input_tokens, output_tokens, duration_ms, time_to_first_token_ms, output_ttft_ms
      FROM assistant_usage_events`;
    const latest = sessionId
      ? db.prepare(`${latestSql} WHERE session_id = ? ORDER BY id DESC LIMIT 1`).get(sessionId)
      : db.prepare(`${latestSql} ORDER BY id DESC LIMIT 1`).get();
    if (latest) {
      const inTok = Number(latest.input_tokens) || 0;
      const outTok = Number(latest.output_tokens) || 0;
      const durMs = Number(latest.duration_ms) || 0;
      const ttftMs = Number(latest.time_to_first_token_ms) || Number(latest.output_ttft_ms) || 0;
      if (inTok > 0 && ttftMs > 0) s.rate.up = inTok / (ttftMs / 1000);
      const genMs = durMs - ttftMs;
      if (outTok > 0 && genMs >= 50) s.rate.down = outTok / (genMs / 1000);
      else if (outTok > 0 && durMs > 0) s.rate.down = outTok / (durMs / 1000);
    }

    if (sessionId) {
      fill(s.session, db.prepare(`${sumSql} WHERE session_id = ?`).get(sessionId));
      // A reply = every call since the latest user-initiated call (includes subagents).
      fill(
        s.reply,
        db
          .prepare(
            `${sumSql} WHERE session_id = ?1 AND id >= COALESCE(
               (SELECT MAX(id) FROM assistant_usage_events WHERE session_id = ?1 AND initiator = 'user'), 0)`
          )
          .get(sessionId)
      );
    }
  } finally {
    db.close();
  }
  return s;
}

// ---------- Claude Code (incrementally parses ~/.claude/projects/**/*.jsonl) ----------

const CLAUDE_CACHE = path.join(STATE_DIR, 'claude-cache.json');
const RECENT_IDS = 64;

function claudeUsageTokens(u) {
  return {
    in: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
    out: u.output_tokens || 0,
  };
}

function newFileEntry() {
  return {
    offset: 0,
    total: { in: 0, out: 0 },
    months: {},
    prompts: {}, // promptId -> { in, out, calls }, only the most recent few are kept
    promptOrder: [],
    currentPrompt: null,
    prevTs: null,
    recent: {}, // message id -> { in, out, month, prompt, startTs }
    recentOrder: [],
    last: null, // { id, startTs, endTs, out }
  };
}

// Reads only bytes appended since the last run.
function updateClaudeFile(file, entry) {
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return entry;
  }
  if (size < entry.offset) entry = newFileEntry();
  if (size === entry.offset) return entry;

  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(size - entry.offset);
  fs.readSync(fd, buf, 0, buf.length, entry.offset);
  fs.closeSync(fd);
  const end = buf.lastIndexOf(0x0a);
  if (end < 0) return entry;
  entry.offset += end + 1;

  const addPrompt = (pid, d) => {
    if (!pid) return;
    if (!entry.prompts[pid]) {
      entry.prompts[pid] = { in: 0, out: 0, calls: 0 };
      entry.promptOrder.push(pid);
      while (entry.promptOrder.length > 8) delete entry.prompts[entry.promptOrder.shift()];
    }
    const p = entry.prompts[pid];
    p.in += d.in;
    p.out += d.out;
    p.calls += d.calls;
  };
  const addMonth = (mk, d) => {
    const m = (entry.months[mk] ||= { in: 0, out: 0 });
    m.in += d.in;
    m.out += d.out;
  };

  for (const line of buf.subarray(0, end).toString('utf8').split('\n')) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = e.timestamp ? Date.parse(e.timestamp) : NaN;
    if (e.type === 'user' && e.promptId) entry.currentPrompt = e.promptId;

    const id = e.message?.id;
    const usage = e.message?.usage;
    if (e.type === 'assistant' && id && usage) {
      const t = claudeUsageTokens(usage);
      const prev = entry.recent[id];
      if (prev) {
        // Same message streamed as several blocks; only count the usage difference.
        const d = { in: t.in - prev.in, out: t.out - prev.out, calls: 0 };
        entry.total.in += d.in;
        entry.total.out += d.out;
        addMonth(prev.month, d);
        addPrompt(prev.prompt, d);
        prev.in = t.in;
        prev.out = t.out;
      } else {
        const mk = monthKey(Number.isFinite(ts) ? new Date(ts) : new Date());
        const d = { ...t, calls: 1 };
        entry.total.in += t.in;
        entry.total.out += t.out;
        addMonth(mk, d);
        addPrompt(entry.currentPrompt, d);
        entry.recent[id] = { ...t, month: mk, prompt: entry.currentPrompt, startTs: entry.prevTs };
        entry.recentOrder.push(id);
        while (entry.recentOrder.length > RECENT_IDS) delete entry.recent[entry.recentOrder.shift()];
      }
      const r = entry.recent[id];
      entry.last = { id, startTs: r.startTs, endTs: Number.isFinite(ts) ? ts : null, out: r.out };
      continue;
    }
    if (e.type === 'user' && Number.isFinite(ts)) entry.prevTs = ts;
  }
  return entry;
}

function listClaudeTranscripts() {
  const root = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'projects');
  const out = [];
  const walk = (dir) => {
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const p = path.join(dir, it.name);
      if (it.isDirectory()) walk(p);
      else if (it.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(root);
  return out;
}

function claudeStats(payload) {
  const s = emptyStats();
  s.rate.approx = true; // transcripts have no time-to-first-token, so only output speed is estimated
  const cache = readJson(CLAUDE_CACHE, {});
  cache.files ||= {};
  cache.sessions ||= {};
  cache.monthCost ||= {};

  const mStart = monthStartDate().getTime();
  const mk = monthKey(new Date());
  const transcript = payload.transcript_path ? path.resolve(payload.transcript_path) : null;
  const sessionDir = transcript ? transcript.replace(/\.jsonl$/i, '') : null;

  const files = listClaudeTranscripts();
  const seen = new Set();
  for (const f of files) {
    seen.add(f);
    let mtime;
    try {
      mtime = fs.statSync(f).mtimeMs;
    } catch {
      continue;
    }
    const isSession = transcript && (f === transcript || f.startsWith(sessionDir + path.sep));
    if (!cache.files[f] && mtime < mStart && !isSession) continue;
    cache.files[f] = updateClaudeFile(f, cache.files[f] || newFileEntry());
  }
  for (const f of Object.keys(cache.files)) if (!seen.has(f)) delete cache.files[f];

  for (const [f, e] of Object.entries(cache.files)) {
    const m = e.months[mk];
    if (m) {
      s.month.in += m.in;
      s.month.out += m.out;
    }
    const isSession = transcript && (f === transcript || f.startsWith(sessionDir + path.sep));
    if (!isSession) continue;
    s.session.in += e.total.in;
    s.session.out += e.total.out;
    const pid = payload.prompt_id || (f === transcript ? e.currentPrompt : null);
    const p = pid && e.prompts[pid];
    if (p) {
      s.reply.in += p.in;
      s.reply.out += p.out;
      s.reply.calls += p.calls;
    }
    if (f === transcript && e.last && e.last.startTs && e.last.endTs > e.last.startTs) {
      s.rate.down = e.last.out / ((e.last.endTs - e.last.startTs) / 1000);
    }
  }

  // Cost: Claude Code only reports the cumulative session estimate, so reply/month cost are deltas tracked here.
  const total = Number(payload.cost?.total_cost_usd) || 0;
  const sid = payload.session_id;
  if (sid) {
    let st = cache.sessions[sid];
    if (!st) {
      const started = cache.files[transcript]?.months;
      const startedThisMonth = !started || Object.keys(started).every((k) => k >= mk);
      st = { lastCost: startedThisMonth ? 0 : total, promptId: null, promptBase: total };
    }
    if (total < st.lastCost) st.lastCost = 0;
    cache.monthCost[mk] = (cache.monthCost[mk] || 0) + (total - st.lastCost);
    const pid = payload.prompt_id || null;
    if (pid !== st.promptId) {
      st.promptBase = st.lastCost <= total ? st.lastCost : 0;
      st.promptId = pid;
    }
    st.lastCost = total;
    st.seen = Date.now();
    cache.sessions[sid] = st;
    s.reply.cost = Math.max(0, total - st.promptBase);
  }
  s.session.cost = total;
  s.month.cost = cache.monthCost[mk] || 0;

  const cutoff = Date.now() - 45 * 86400_000;
  for (const [k, v] of Object.entries(cache.sessions)) if ((v.seen || 0) < cutoff) delete cache.sessions[k];
  writeJsonAtomic(CLAUDE_CACHE, cache);
  return s;
}

// ---------- main ----------

function readStdinSafe() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const i = process.argv.indexOf('--tool');
  const tool = i >= 0 ? process.argv[i + 1] : 'copilot';
  let payload = {};
  try {
    payload = JSON.parse(readStdinSafe().trim() || '{}');
  } catch {
    payload = {};
  }

  let stats;
  if (tool === 'copilot') stats = await copilotStats(payload);
  else if (tool === 'claude') stats = claudeStats(payload);
  else throw new Error(`unknown --tool ${tool}`);
  console.log(render(tool, stats));
}

main().catch((err) => console.log(`statusline error: ${err?.message || 'unknown'}`));
