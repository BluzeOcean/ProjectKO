import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

/**
 * DeepSeek Harness: the launcher, the price of a turn, and the reading of a
 * chat's event log.
 *
 * The harness runs behind desktop/service/dsh-bridge.mjs, which speaks the
 * SDK JSON-RPC profile and appends every session event to a JSONL file beside
 * the chat. Everything here is arithmetic over those records: no model call,
 * no network, nothing to keep in step with the harness beyond the event names
 * a session already reports.
 */

const run = promisify(execFile);

// The three presets the harness ships and the desktop app offers, in the order
// the app shows them: what the chat may read, write, and do without asking.
export const permissionModes = ['read-only', 'workspace-write', 'danger-full-access'];

// The launcher that ships with the DeepSeek Harness desktop app. The shim on
// PATH is not trusted: on this machine it points at a folder that is gone, and
// a name that resolves is not the same as a launcher that starts.
export function dshCli(env = process.env) {
  const candidates = [
    env.DSH_CLI,
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { if (statSync(candidate).isFile()) return candidate; } catch { /* Try the next spelling. */ }
  }
  return null;
}

// DeepSeek's published list prices, CNY per million tokens, off-peak. Peak
// doubles them. Cache writes are charged at the hit rate, as the provider's
// own billing does.
const RATES = {
  'deepseek-v4-flash': { hit: 0.02, miss: 1, out: 4 },
  'deepseek-v4-pro': { hit: 0.15, miss: 4.5, out: 13.5 },
};
const fallbackRate = { hit: 0.02, miss: 1, out: 4 };

// 01:00-04:00 and 06:00-10:00 UTC are peak on a weekday; the rest of the week,
// weekends included, is off-peak.
export function isPeak(at = new Date()) {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = at.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

// inputTokens is the uncached part of the prompt: the harness reports cache
// reads beside it, not inside it. Fresh and cached input are priced apart,
// which is the whole reason a 99% cache share costs three fen and not thirty.
export function priceUsage(usage, model, at = new Date()) {
  if (!usage) return 0;
  const rate = RATES[model] || fallbackRate;
  const cached = Number(usage.cacheReadTokens || 0) + Number(usage.cacheWriteTokens || 0);
  const fresh = Number(usage.inputTokens || 0);
  const output = Number(usage.outputTokens || 0);
  const cny = (cached * rate.hit + fresh * rate.miss + output * rate.out) / 1_000_000;
  return cny * (isPeak(at) ? 2 : 1);
}

// What the footer needs, read off the log. The last request's input is the
// window's occupancy; the limit arrives with the request context.
export function usageFrom(records) {
  let turns = 0, steps = 0, tokens = 0, cost = 0, cacheHit = 0, used = 0, limit = null, model = null, last = null;
  for (const record of records) {
    const event = record && record.event;
    if (!event) continue;
    if (event.type === 'turn/start') turns += 1;
    else if (event.type === 'step/end') steps += 1;
    else if (event.type === 'request/context') {
      if (typeof event.data?.model === 'string') model = event.data.model;
      if (Number.isFinite(event.data?.contextWindow)) limit = event.data.contextWindow;
    } else if (event.type === 'assistant/message') {
      const usage = event.data?.usage;
      if (!usage) continue;
      const cached = Number(usage.cacheReadTokens || 0) + Number(usage.cacheWriteTokens || 0);
      const input = Number(usage.inputTokens || 0);
      const output = Number(usage.outputTokens || 0);
      tokens += Number(usage.totalTokens || input + output + cached);
      // The prompt is what occupies the window: fresh input plus what came from cache.
      used = input + cached;
      if (used > 0) cacheHit = Math.round(cached / used * 100);
      cost += priceUsage(usage, model, record.at ? new Date(record.at) : new Date());
      last = usage;
    }
  }
  return {
    turns, steps, tokens, cost, cacheHit, model, limit,
    contextUsed: used,
    contextPercent: limit ? Math.min(100, Math.round(used / limit * 100)) : null,
    updatedAt: records.length ? records[records.length - 1].at || null : null,
    last,
  };
}

// The chat's own transcript: what was asked, what was answered, what ran.
export function messagesFrom(records) {
  const messages = [], activity = [];
  for (const record of records) {
    const event = record && record.event;
    if (!event) continue;
    const at = record.at || new Date().toISOString();
    if (event.type === 'query') {
      messages.push({ id: `u-${messages.length}`, role: 'user', text: String(event.data?.text || ''), at });
    } else if (event.type === 'assistant/message') {
      const text = (event.data?.message?.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
      if (text) messages.push({ id: `a-${messages.length}`, role: 'assistant', text, at });
    } else if (event.type === 'tool/call') {
      activity.push({ id: String(event.data?.callId || `t-${activity.length}`), name: String(event.data?.name || 'tool'), status: 'running', at });
    } else if (event.type === 'tool/result') {
      const id = String(event.data?.message?.toolCallId || '');
      const entry = activity.find(item => item.id === id);
      if (entry) entry.status = event.data?.message?.isError ? 'failed' : 'completed';
    }
  }
  return { messages, activity: activity.slice(-12) };
}

export function readRecords(file) {
  try {
    return readFileSync(file, 'utf8').split('\n').flatMap(line => {
      if (!line.trim()) return [];
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch { return []; }
}

// ── The process behind the answer ────────────────────────────────────────────
//
// The harness reports what it is doing while it does it: a turn opens, a step
// opens, the model thinks, tools fire and answer, the step closes. The chat
// reads the answers out of the same log; this reads the work.
//
// The thinking arrives with the step that produced it, and the tools arrive as
// they run. The categories and the live detail are the harness's own
// vocabulary, so a summary here reads the way the harness's own chat reads:
// "read 2 · commands 1".

const TOOL_CATEGORIES = {
  read: 'read', read_image: 'readImage',
  grep: 'search', glob: 'search',
  write: 'write', edit: 'edit', apply_patch: 'edit',
  bash: 'commands', pwsh: 'commands', exec_command: 'commands', write_stdin: 'commands',
  run_code: 'code',
  web_search: 'webSearch', web_fetch: 'webFetch',
  todo_write: 'plan', create_goal: 'plan', update_goal: 'plan', get_goal: 'plan',
  ask_user_question: 'questions', request_user_input: 'questions',
};

// The argument worth showing for a tool, in the harness's order of preference.
const DETAIL_KEYS = ['title', 'description', 'objective', 'task', 'task_name', 'name', 'question', 'questions', 'prompt', 'message', 'command', 'cmd', 'queries', 'query', 'pattern', 'url', 'uri', 'file_path', 'path', 'target', 'action', 'status'];

// How much of the story travels to the window: two turns, thirty tools and six
// steps of thinking each, and four thousand characters of thinking per turn.
// The full text stays on disk in the log; this is what the chat needs to show.
const PROCESS_TURNS = 2;
const PROCESS_ROWS = 30;
const PROCESS_THINKING = 6;
const PROCESS_REASONING = 4000;
const DETAIL_LIMIT = 160;

/** The category a tool belongs to, in the harness's terms. */
export function toolCategory(name) {
  const key = String(name || '');
  if (TOOL_CATEGORIES[key]) return TOOL_CATEGORIES[key];
  if (key === 'subagent' || key.startsWith('subagent_')) return 'subagents';
  if (key.startsWith('terminal_')) return 'commands';
  if (key.endsWith('_inspect')) return 'search';
  return 'tools';
}

const oneLine = (text, max) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

/** The one line of a tool call that says what it is doing. */
export function toolDetail(args) {
  let parsed;
  try { parsed = typeof args === 'string' ? JSON.parse(args) : args; } catch { return ''; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
  for (const key of DETAIL_KEYS) {
    const value = parsed[key];
    if (typeof value === 'string' && value.trim()) return oneLine(value, DETAIL_LIMIT);
    if (Array.isArray(value) && value.length && value.every(item => typeof item === 'string')) return oneLine(value.join(', '), DETAIL_LIMIT);
  }
  return '';
}

/**
 * The work behind the chat, read off the same log the chat itself is read
 * from. One entry per turn: the thinking it wrote, the tools it called, what
 * each tool answered, and what it is doing right now.
 */
export function processFrom(records) {
  const turns = [];
  let current = null;
  for (const record of records || []) {
    const event = record && record.event;
    if (!event) continue;
    const data = event.data || {};
    const at = record.at || new Date().toISOString();
    if (event.type === 'turn/start') {
      current = { turn: Number(data.turn) || turns.length + 1, status: 'working', step: 0, rows: [], calls: new Map(), at };
      turns.push(current);
      continue;
    }
    if (!current) continue;
    if (event.type === 'step/start') { current.step = Number(data.step) || current.step; continue; }
    if (event.type === 'turn/end') { current.status = 'done'; continue; }
    if (event.type === 'assistant/message') {
      // The thinking of this step, whole. It is the one thing the harness
      // reports that the answer itself never says.
      for (const block of data.message?.content || []) {
        if (block?.type !== 'reasoning') continue;
        const text = String(block.text || '').trim();
        if (text) current.rows.push({ id: `r-${current.turn}-${current.rows.length}`, kind: 'reasoning', at, text: text.slice(0, PROCESS_REASONING) });
      }
      continue;
    }
    if (event.type === 'tool/call') {
      const id = String(data.callId || `t-${current.rows.length}`);
      const row = { id, kind: 'tool', at, name: String(data.name || 'tool'), category: toolCategory(data.name), detail: toolDetail(data.arguments), status: 'running' };
      current.rows.push(row);
      current.calls.set(id, row);
      continue;
    }
    if (event.type === 'tool/result') {
      const row = current.calls.get(String(data.message?.toolCallId || ''));
      if (row) row.status = data.message?.isError ? 'failed' : 'completed';
    }
  }
  return { turns: turns.slice(-PROCESS_TURNS).reverse().map(turn => {
    // The tools and the thinking are kept apart, so a burst of tool calls can
    // never push the thinking out of the panel.
    const tools = new Set(turn.rows.filter(row => row.kind === 'tool').slice(-PROCESS_ROWS));
    const thinking = turn.rows.filter(row => row.kind === 'reasoning').slice(-PROCESS_THINKING);
    // The newest thinking is the one that matters; older thinking gives way to it.
    let budget = PROCESS_REASONING;
    const kept = [];
    for (let index = thinking.length - 1; index >= 0; index -= 1) {
      const row = thinking[index];
      if (budget <= 0) break;
      if (row.text.length > budget) { row.text = row.text.slice(0, budget); budget = 0; }
      else budget -= row.text.length;
      kept.unshift(row);
    }
    const keptThinking = new Set(kept);
    const rows = turn.rows.filter(row => tools.has(row) || keptThinking.has(row));
    const counts = [];
    for (const row of rows) {
      if (row.kind !== 'tool') continue;
      const found = counts.find(item => item.category === row.category);
      if (found) found.count += 1;
      else counts.push({ category: row.category, count: 1 });
    }
    const running = [...rows].reverse().find(row => row.kind === 'tool' && row.status === 'running');
    // What it is doing right now. A tool in flight says so in its own row, so
    // the line is only for the times between them: the model is working.
    const now = running ? '' : (turn.status === 'working' ? 'Thinking' : '');
    return { turn: turn.turn, status: turn.status, step: turn.step, at: turn.at, rows, counts, now };
  }) };
}


export const dshLogPath = (stateDir, id) => path.join(stateDir, 'dsh', `${id}.jsonl`);

// ── The briefing channel ────────────────────────────────────────────────────
// The harness assembles one system prompt per model step. Its `system-prompt`
// plugin owns the persona slots, and a patch entry can fill the suffix slot.
// The loader applies a patch to the running tree exactly as `--dump-config`
// prints it, so the dump is the proof that a patch took.

export const overlayPath = (stateDir, id) => path.join(stateDir, 'dsh', `briefing-${id}.patch.yml`);

const DEFAULT_PERSONA = 'You are a coding agent powered by the {{model}} model.';

/** The persona prefix the harness profile carries, read from its own dump. */
export function personaFromDump(dump) {
  const lines = String(dump || '').split(/\r?\n/);
  let inRow = false;
  for (const line of lines) {
    if (/^\s*-\s+id:\s*system-prompt\s*$/.test(line)) { inRow = true; continue; }
    if (inRow && /^\s*-\s+id:/.test(line)) break;
    if (!inRow) continue;
    const match = /^\s*personaPrefix:\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const value = match[1];
    return /^['"]/.test(value) ? value.replace(/^['"]|['"]$/g, '') : value;
  }
  return null;
}

/**
 * The patch that gives the harness the briefing as a persona suffix. A patch
 * replaces the whole config of the row it targets, so the persona prefix the
 * profile already carries is restated. The persona strings are `{{variable}}`
 * templates that fail on an unknown group, so the briefing is made literal.
 */
export function dshOverlay(text, personaPrefix = DEFAULT_PERSONA) {
  const safe = String(text || '').replace(/\{\{([\s\S]*?)\}\}/g, '{ {$1} }');
  const body = safe.split(/\r?\n/).map(line => `      ${line}`).join('\n');
  return [
    '- id: system-prompt',
    "  name: '@deepseek-ai/dsh-system-prompt'",
    '  config:',
    `    personaPrefix: ${JSON.stringify(personaPrefix)}`,
    '    personaSuffix: |-',
    body,
    '',
  ].join('\n');
}

/** Run the launcher and return what it printed. */
export async function dshProfile(env = process.env, args = []) {
  const launcher = dshCli(env);
  if (!launcher) return '';
  const windows = process.platform === 'win32';
  const file = windows ? 'cmd.exe' : launcher;
  const argv = windows ? ['/c', launcher, ...args] : args;
  const { stdout } = await run(file, argv, { env, windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 }).catch(error => ({ stdout: error.stdout || '' }));
  return stdout;
}

/**
 * Whether the harness can take the briefing in its own prompt, and the persona
 * it keeps. Probed once per machine and cached: the dump is boot-free, so the
 * probe costs no model call.
 */
export async function dshBriefingChannel(env = process.env, stateDir) {
  const cache = path.join(stateDir, 'dsh-briefing.json');
  const cached = JSON.parse(await readFile(cache, 'utf8').catch(() => 'null'));
  if (cached && typeof cached.persona === 'string') return cached;
  if (cached && cached.ok === false) return null;
  const dump = await dshProfile(env, ['--profile', 'sdk', '--dump-config']);
  const persona = personaFromDump(dump);
  if (!persona) {
    await writeFile(cache, JSON.stringify({ ok: false }), 'utf8').catch(() => {});
    return null;
  }
  // The proof: a patch that carries a marker must show it in the composed tree.
  const marker = 'pko-briefing-probe';
  const sample = path.join(stateDir, 'dsh-briefing-probe.patch.yml');
  await mkdir(stateDir, { recursive: true });
  await writeFile(sample, dshOverlay(marker, persona), 'utf8').catch(() => {});
  const patched = await dshProfile(env, ['--profile', 'sdk', '--dump-config', '--patch', sample]);
  await rm(sample, { force: true }).catch(() => {});
  if (!patched.includes(marker)) {
    await writeFile(cache, JSON.stringify({ ok: false }), 'utf8').catch(() => {});
    return null;
  }
  const result = { persona };
  await writeFile(cache, JSON.stringify(result), 'utf8').catch(() => {});
  return result;
}

/** Write the overlay that carries one chat's briefing into the harness prompt. */
export async function writeBriefingOverlay(stateDir, id, text, persona) {
  const file = overlayPath(stateDir, id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, dshOverlay(text, persona), 'utf8');
  return file;
}
