import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { codexBinary, childEnvironment } from './agents.mjs';
import { publicError } from './util.mjs';

/**
 * Codex drives Project KO.
 *
 * Codex runs its app-server over a JSON-RPC pipe: the service starts a thread,
 * sends turns, and answers the tool calls Codex asks for. This engine is the
 * fallback when Claude Code is not installed on the machine.
 */

export class CodexEngine extends EventEmitter {
  constructor({ repo, tools, execute, instructions, orientation = async () => '', settings = () => ({}), model = null }) {
    super();
    this.repo = repo;
    this.tools = tools;
    this.execute = execute;
    this.instructions = instructions;
    this.orientation = orientation;
    this.settings = settings;
    this.name = 'codex';
    this.label = 'Codex';
    this.note = 'Codex subscription';
    this.billing = 'Codex subscription for the coordinator; OpenAI API for voice';
    this.model = model;
    this.pending = new Map();
    this.nextId = 1;
    this.child = null;
    this.threadId = null;
    this.startPromise = null;
    this.active = null;
    this.queue = Promise.resolve();
    this.operations = new Map();
  }

  /** True while the model session is up. */
  get alive() { return !!this.child; }

  send(value) { if (!this.child?.stdin.writable) throw new Error('The coordinator is disconnected'); this.child.stdin.write(JSON.stringify(value) + '\n'); }

  rpc(method, params, timeout = 35000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`The coordinator did not answer ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  async start() {
    if (this.threadId && this.child) return;
    if (!this.startPromise) this.startPromise = this.startInternal().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async startInternal() {
    const command = codexBinary();
    const env = childEnvironment(this.repo);
    // Keep the user's Codex sign-in. The OpenAI voice key is never given to Codex.
    this.child = spawn(command.file, [...command.args, 'app-server', '--stdio'], { cwd: this.repo, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child.stderr.on('data', () => {}); // Diagnostics may contain local account context.
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => { try { this.message(JSON.parse(line)).catch(error => this.emit('error-detail', publicError(error))); } catch { /* Non-protocol diagnostics are not forwarded. */ } });
    const disconnected = error => {
      this.child = null;
      this.threadId = null;
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
      this.pending.clear();
      this.active?.reject(error);
      this.active = null;
    };
    this.child.once('error', disconnected);
    this.child.once('exit', () => disconnected(new Error('The coordinator closed. Your terminal chats are still running.')));
    try {
      await this.rpc('initialize', { clientInfo: { name: 'mrmak_desktop', title: 'Project KO Desktop', version: '0.1.0' }, capabilities: { experimentalApi: true } });
      this.send({ method: 'initialized', params: {} });
      const result = await this.rpc('thread/start', {
        cwd: this.repo, ...(this.model ? { model: this.model } : {}), baseInstructions: this.instructions + '\n\n' + await this.orientation(),
        dynamicTools: this.tools, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
        config: { 'features.shell_tool': false, 'features.multi_agent': false },
      }, 60000);
      this.threadId = result.thread.id;
    } catch (error) { this.child?.kill(); throw error; }
  }

  async ask({ prompt, images = [], operationId }) {
    await this.start();
    const completion = new Promise((resolve, reject) => { this.active = { resolve, reject, text: '', finalText: '', calls: new Map(), operationId }; });
    // Install the completion listener before turn/start (notifications may arrive first).
    const timer = setTimeout(() => this.active?.reject(new Error('The coordinator timed out. Inspect chats before retrying; actions may already have been delivered.')), 180000);
    try {
      const started = await this.rpc('turn/start', { threadId: this.threadId, input: [{ type: 'text', text: prompt }, ...images.map(file => ({ type: 'localImage', path: file }))], effort: this.settings().coordinatorEffort || 'medium' });
      this.active.turnId = started.turn.id;
      return await completion;
    } catch (error) {
      if (this.active?.turnId && this.threadId) await this.rpc('turn/interrupt', { threadId: this.threadId, turnId: this.active.turnId }).catch(() => {});
      throw error;
    } finally { clearTimeout(timer); this.active = null; }
  }

  async message(message) {
    if (message.id != null && !message.method) {
      const request = this.pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
      return;
    }
    if (message.id != null && message.method === 'item/tool/call') {
      const { tool: name, arguments: args, callId } = message.params;
      if (!this.active || !this.tools.some(item => item.name === name)) {
        this.send({ id: message.id, result: { success: false, contentItems: [{ type: 'inputText', text: 'No active authorized request or unknown tool.' }] } }); return;
      }
      let result;
      if (this.active.calls.has(callId)) result = await this.active.calls.get(callId);
      else {
        const action = this.execute(name, args, this.active.operationId).then(value => ({ success: true, contentItems: [{ type: 'inputText', text: JSON.stringify(value) }] })).catch(error => ({ success: false, contentItems: [{ type: 'inputText', text: publicError(error) }] }));
        this.active.calls.set(callId, action); result = await action;
      }
      this.send({ id: message.id, result });
      return;
    }
    if (message.id != null && message.method) {
      // Unknown requests cannot hang the protocol or silently approve actions.
      this.send({ id: message.id, error: { code: -32601, message: 'This coordinator only supports its registered workspace tools.' } });
      return;
    }
    const params = message.params || {};
    if (!this.active || params.threadId !== this.threadId) return;
    if (message.method === 'item/agentMessage/delta') this.active.text += params.delta || '';
    if (message.method === 'item/completed' && params.item?.type === 'agentMessage') this.active.finalText = params.item.text || this.active.finalText;
    if (message.method === 'turn/completed') {
      if (params.turn.status === 'completed') this.active.resolve(this.active.finalText || this.active.text || 'Done.');
      else this.active.reject(new Error(params.turn.error?.message || `The coordinator turn ${params.turn.status}`));
    }
  }

  close() { this.child?.kill(); this.child = null; this.threadId = null; }
}
