#!/usr/bin/env node
/**
 * Project KO's DeepSeek Harness bridge.
 *
 * The harness ships machine-facing profiles, not an interactive terminal, so
 * this bridge is the terminal: it reads one line per message from stdin, sends
 * it to `dsh --profile sdk` over JSON-RPC, prints the answer as plain text,
 * and appends every session event to a JSONL log the service reads.
 *
 *   node dsh-bridge.mjs --dsh <launcher> --log <file> --cwd <dir> --model <id>
 *                       [--session <id>] [--allow]
 *
 * --allow answers permission requests with "allowed once"; without it the
 * request is asked on stdout and answered by the next line typed.
 *
 * The bridge owns stdout. The harness's stdout belongs to the protocol.
 */

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith('--')) continue;
  const next = process.argv[index + 1];
  args.set(token.slice(2), next && !next.startsWith('--') ? next : true);
}

const launcher = String(args.get('dsh') || 'dsh');
const logFile = String(args.get('log') || '');
const cwd = String(args.get('cwd') || process.cwd());
const model = String(args.get('model') || 'deepseek-v4-flash');
const sessionId = String(args.get('session') || `session-${Date.now().toString(36)}`);
const allow = args.get('allow') === true;
const permission = typeof args.get('permission') === 'string' ? args.get('permission') : null;

const dim = text => `\x1b[2m${text}\x1b[0m`;
const say = text => process.stdout.write(`${text}\r\n`);

if (logFile) mkdirSync(path.dirname(logFile), { recursive: true });
const record = event => {
  if (!logFile) return;
  try { appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), event }) + '\n'); } catch { /* The chat still runs without its log. */ }
};

// The profile reads this before it composes: it sets both the sandbox mode and
// the approval policy, so the chat starts in the mode the picker shows.
const env = { ...process.env };
if (permission) env.DSH_PERMISSION_MODE = permission;
const child = process.platform === 'win32'
  ? spawn('cmd.exe', ['/c', launcher, '--profile', 'sdk'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  : spawn(launcher, ['--profile', 'sdk'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

child.stderr.on('data', () => { /* Startup diagnostics stay out of the chat. */ });
child.on('error', error => { say(`\x1b[31mdsh could not start: ${error.message}\x1b[0m`); process.exit(1); });
child.on('exit', code => { if (code !== 0) say(dim(`dsh exited (${code}).`)); process.exit(code ?? 0); });

let nextId = 0;
const pending = new Map();
let awaitingApproval = null;
let busy = false;

const send = message => { if (child.stdin.writable) child.stdin.write(JSON.stringify(message) + '\n'); };
const request = (method, params) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  send({ jsonrpc: '2.0', id, method, params });
});

const frames = createInterface({ input: child.stdout });
frames.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id !== undefined && !message.method) {
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (!waiter) return;
    if (message.error) waiter.reject(new Error(message.error.message || 'The harness refused the request'));
    else waiter.resolve(message.result);
    return;
  }
  if (message.method === 'session.event') {
    const { event } = message.params;
    if (event) { record(event); show(event); }
    return;
  }
  if (message.method === 'approval/request') {
    const { sessionId: asked, toolName, reason } = message.params;
    if (allow) {
      send({ jsonrpc: '2.0', id: message.id, result: { outcome: 'allowed-once' } });
      return;
    }
    say(`\x1b[33mAllow ${toolName}?${reason ? ` ${reason}` : ''}\x1b[0m ${dim('y/n')}`);
    awaitingApproval = { id: message.id, sessionId: asked };
    return;
  }
});

// What the terminal shows. The conversation view reads the log instead; this
// is the same story in one voice, for anyone who prefers the scrollback.
function show(event) {
  if (event.type === 'assistant/message') {
    const text = (event.data?.message?.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
    if (text) say(`\r\n${text}`);
    return;
  }
  if (event.type === 'tool/call') {
    say(dim(`· ${event.data?.name || 'tool'}`));
    return;
  }
  if (event.type === 'tool/result' && event.data?.message?.isError) {
    say(dim('· tool failed'));
    return;
  }
  if (event.type === 'turn/end') { busy = false; say(dim('›')); return; }
  if (event.type === 'turn/start') busy = true;
}

async function submit(text) {
  if (!text.trim()) return;
  // A native command changes the session; it is not something you said, so it
  // stays out of the transcript the conversation shows.
  if (!/^\/[a-z-]+(?:\s|$)/i.test(text.trim())) record({ type: 'query', data: { text } });
  try {
    await request('session/query', { sessionId, contentBlocks: [{ type: 'text', text }] });
  } catch (error) {
    say(`\x1b[31m${error.message}\x1b[0m`);
  }
}

const lines = createInterface({ input: process.stdin });
lines.on('line', line => {
  if (awaitingApproval) {
    const typed = line.trim();
    const yes = /^(y|yes|1|allow)$/i.test(typed);
    const no = /^(n|no|0|reject)$/i.test(typed);
    // Anything that is not an answer rejects the request and is delivered as a
    // message: a prompt that eats what you typed is worse than a refusal.
    send({ jsonrpc: '2.0', id: awaitingApproval.id, result: { outcome: yes ? 'allowed-once' : 'rejected' } });
    awaitingApproval = null;
    if (!yes && !no) void submit(line);
    return;
  }
  if (busy) { say(dim('… still working on the previous message')); return; }
  void submit(line.replace(/\r/g, ''));
});

let closed = false;
async function finish() {
  if (closed) return;
  closed = true;
  try { await request('shutdown', {}); } catch { /* It may already be gone. */ }
  setTimeout(() => process.exit(0), 300).unref();
}
lines.on('close', finish);
process.on('SIGINT', finish);
process.on('SIGTERM', finish);

async function start() {
  await request('initialize', { cwd, provider: 'deepseek-official', model, approvalRequests: true, capabilities: { userQuestions: false } });
  if (args.get('session')) {
    // A stored chat adopts its session; an unknown id is simply a new one.
    await request('session/resume', { sessionId }).catch(() => {});
  }
  say(dim(`DeepSeek Harness · ${model}`));
  const initial = args.get('initial');
  if (typeof initial === 'string' && initial.trim()) await submit(initial);
}

start().catch(error => { say(`\x1b[31m${error.message}\x1b[0m`); process.exit(1); });
