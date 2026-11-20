import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { childEnvironment, commandPath } from './agents.mjs';
import { publicError } from './util.mjs';

/**
 * The coordinator tools, served over MCP on a loopback port of their own.
 * The model reaches them by name; the service decides what each call does.
 * The port is private to this process and the token is new for every start.
 */
export async function openToolServer({ tools, execute, token }) {
  const server = new Server({ name: 'project-ko', version: '0.6.4' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ type, ...tool }) => tool),
  }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const name = request.params?.name;
    const args = request.params?.arguments && typeof request.params.arguments === 'object' ? request.params.arguments : {};
    try {
      if (!tools.some(tool => tool.name === name)) throw new Error('Unknown coordinator tool');
      const value = await execute(name, args);
      return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value ?? null) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: publicError(error) }], isError: true };
    }
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  transport.onerror = () => {};
  await server.connect(transport);
  const httpServer = http.createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401); response.end(); return; }
    if (!request.url || !request.url.startsWith('/mcp')) { response.writeHead(404); response.end(); return; }
    transport.handleRequest(request, response).catch(() => { if (!response.headersSent) response.writeHead(500); response.end(); });
  });
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close() { server.close?.(); httpServer.close(); },
  };
}

/**
 * Claude Code drives Project KO.
 *
 * Claude Code runs headless: it takes one JSON line of input at a time on
 * stdin and answers with JSON lines on stdout. Its tools reach this process
 * over MCP, so the model can only ask the service to act; it never touches a
 * terminal, a file or a shell by itself. The built-in tools are switched off
 * and the permission mode never asks, so a turn can never stall on a prompt
 * the user cannot see.
 */

/** The MCP server name. Claude Code exposes its tools as mcp__<name>__<tool>. */
const SERVER = 'pko';

/** An image larger than this is left as a path instead of being sent inline. */
const MAX_INLINE_IMAGE = 4 * 1024 * 1024;

const MEDIA_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
};

export class ClaudeEngine {
  constructor({ repo, tools, execute, instructions, orientation = async () => '', settings = () => ({}), env = process.env }) {
    this.repo = repo;
    this.tools = tools;
    this.execute = execute;
    this.instructions = instructions;
    this.orientation = orientation;
    this.settings = settings;
    this.env = env;
    this.name = 'claude';
    this.label = 'Claude Code';
    this.note = 'Claude Code CLI';
    this.billing = 'Claude Code for the coordinator; OpenAI API for voice';
    this.model = null;
    this.child = null;
    this.startPromise = null;
    this.turn = null;
    this.operationId = null;
    this.answer = '';
    this.token = randomUUID();
    this.toolServer = null;
  }

  /** True while the model session is up. */
  get alive() { return !!this.child; }

  /** Start the model session once and keep it for later turns. */
  async start() {
    if (this.child) return;
    if (!this.startPromise) this.startPromise = this.startInternal().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async startInternal() {
    const file = commandPath('claude', this.env);
    if (!file) throw new Error('Claude Code is not installed on this computer. Install it and sign in once to use Project KO.');
    const url = await this.openTools();
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--mcp-config', JSON.stringify({ mcpServers: { [SERVER]: { type: 'http', url, headers: { Authorization: `Bearer ${this.token}` } } } }),
      '--strict-mcp-config',
      // No built-in tools: the model may only use the coordinator tools below.
      '--tools', '',
      '--allowedTools', this.tools.map(tool => `mcp__${SERVER}__${tool.name}`).join(','),
      '--permission-mode', 'dontAsk',
      '--permission-prompts', 'none',
      '--setting-sources', 'user',
      '--system-prompt', await this.systemPrompt(),
    ];
    const effort = this.settings().coordinatorEffort;
    if (['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) args.push('--effort', effort);
    const child = spawn(file, args, { cwd: this.repo, env: childEnvironment(this.repo), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    child.stderr.on('data', () => {}); // Diagnostics may contain local account context.
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => this.event(line));
    child.once('error', error => this.disconnected(error));
    child.once('exit', () => this.disconnected(new Error('The coordinator closed. Your terminal chats are still running.')));
    // The process is up and stdin is writable. Claude Code finishes starting
    // only once it has a message to work on, so the first turn is written
    // straight away; waiting for its opening event would wait for a turn that
    // has not been asked for yet.
  }

  /**
   * The coordinator's persona, plus the orientation the service keeps for it.
   * The whole prompt travels as one argument, so it is kept inside a size the
   * command line can carry.
   */
  async systemPrompt() {
    const orientation = String(await this.orientation() || '');
    const room = 24000 - this.instructions.length - 2;
    return `${this.instructions}\n\n${orientation.slice(0, Math.max(0, room))}`;
  }

  /**
   * The coordinator tools, served over MCP on a loopback port of their own.
   * The model reaches them by name; the service decides what each call does.
   */
  async openTools() {
    const server = await openToolServer({
      tools: this.tools,
      execute: (name, args) => this.execute(name, args, this.operationId),
      token: this.token,
    });
    this.toolServer = server;
    return server.url;
  }

  /** One turn. The answer is the model's last word, not the tool calls. */
  async ask({ prompt, images = [], operationId }) {
    await this.start();
    this.operationId = operationId;
    this.answer = '';
    const content = [{ type: 'text', text: prompt }];
    for (const file of images) {
      const block = await this.image(file);
      if (block) content.push(block);
    }
    const turn = new Promise((resolve, reject) => { this.turn = { resolve, reject }; });
    const timer = setTimeout(() => {
      this.turn?.reject(new Error('The coordinator timed out. Inspect your chats before retrying; actions may already have been delivered.'));
    }, 180000);
    try {
      this.child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
      return await turn;
    } finally {
      clearTimeout(timer);
      this.turn = null;
      this.operationId = null;
    }
  }

  /** An image becomes an inline block, unless it is too large to carry. */
  async image(file) {
    try {
      const data = await readFile(file);
      if (data.length > MAX_INLINE_IMAGE) return null;
      const media = MEDIA_TYPES[path.extname(file).toLowerCase()];
      if (!media) return null;
      return { type: 'image', source: { type: 'base64', media_type: media, data: data.toString('base64') } };
    } catch { return null; }
  }

  /** Read one line of Claude Code's output. */
  event(line) {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'system' && event.subtype === 'init') {
      this.model = event.model || null;
      return;
    }
    if (event.type === 'assistant') {
      for (const block of event.message?.content || []) if (block.type === 'text' && block.text) this.answer = block.text;
      return;
    }
    if (event.type !== 'result') return;
    const text = typeof event.result === 'string' ? event.result : this.answer;
    if (event.is_error || event.subtype === 'error_max_turns') {
      this.turn?.reject(new Error(text || 'The coordinator could not finish this request.'));
    } else {
      this.turn?.resolve(text || this.answer || 'Done.');
    }
    this.turn = null;
  }

  /** The model session ended. Anything waiting on it fails now, not later. */
  disconnected(error) {
    this.child = null;
    this.turn?.reject(error);
    this.turn = null;
  }

  close() {
    this.child?.kill();
    this.child = null;
    this.toolServer?.close?.();
    this.toolServer = null;
  }}
