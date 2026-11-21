import { existsSync, readFileSync, statSync } from 'node:fs';
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

export const dshLogPath = (stateDir, id) => path.join(stateDir, 'dsh', `${id}.jsonl`);
