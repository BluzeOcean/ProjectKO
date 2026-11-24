import path from 'node:path';
import os from 'node:os';
import { readFile } from 'node:fs/promises';

/**
 * The Toxic app on this machine, reached through its MCP server.
 *
 * Toxic wraps the speech engines and publishes two JSON files on every launch:
 * mcp.json (endpoint, port, pid) and api.json (HTTP port and token). The MCP
 * endpoint needs no token, is loopback-only, and answers JSON-RPC 2.0 at a
 * single URL. The discovery file is re-read after a failed call because Toxic
 * picks a fresh pid and may use another port after a restart.
 *
 * Tools used here:
 *   transcribe { audio_base64 } -> text (Hex, inside Toxic)
 *   speak      { text, speed }  -> a base64 WAV resource (Pocket TTS, inside Toxic)
 */

const fail = (message, status = 502) => Object.assign(new Error(message), { status });

export const toxicConfigDir = (env = process.env) => env.PKO_TOXIC_DIR
  || path.join(env.APPDATA || path.join(env.USERPROFILE || os.homedir(), 'AppData', 'Roaming'), 'app.toxic.desktop');

const discoveryTtl = 30_000;

// fetch reports a refused loopback connection as TypeError('fetch failed') with
// the real code on the cause; a timeout is an AbortError.
function transportFailure(error, timeoutMs) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return fail(`Toxic did not answer within ${Math.round(timeoutMs / 1000)} seconds.`, 504);
  }
  return fail('Toxic is not running. Open Toxic and try again.', 503);
}

export class ToxicClient {
  constructor({ env = process.env, fetcher = fetch } = {}) {
    this.env = env;
    this.fetcher = fetcher;
    this.found = null;
    this.foundAt = 0;
    this.serial = 0;
  }

  // Read the file Toxic writes on launch, not a remembered address: the token
  // changes every launch and the MCP port can change with it.
  async endpoint(force = false) {
    if (!force && this.found && Date.now() - this.foundAt < discoveryTtl) return this.found;
    let document;
    try {
      document = JSON.parse(await readFile(path.join(toxicConfigDir(this.env), 'mcp.json'), 'utf8'));
    } catch {
      this.found = null;
      throw fail('Toxic is not running. Open Toxic and try again.', 503);
    }
    if (typeof document?.url !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(document.url)) {
      this.found = null;
      throw fail('Toxic is not publishing its MCP address. Open Toxic and try again.', 503);
    }
    this.found = { url: document.url, port: document.port || Number(new URL(document.url).port), version: document.version || null, pid: document.pid || null };
    this.foundAt = Date.now();
    return this.found;
  }

  // /health is the one endpoint without a token. A stopped engine is ready for
  // a first request (Toxic starts it on demand), so only a missing or failed
  // server reads as "not available".
  async health(timeout = 2_500) {
    let endpoint;
    try { endpoint = await this.endpoint(); } catch { return null; }
    try {
      const response = await this.fetcher(new URL('/health', endpoint.url).href, { signal: AbortSignal.timeout(timeout) });
      if (!response.ok) { this.found = null; return null; }
      const info = await response.json();
      return { running: info?.status === 'ok', stt: info?.stt || 'unknown', tts: info?.tts || 'unknown', version: info?.version || endpoint.version };
    } catch {
      this.found = null;
      return null;
    }
  }

  async rpc(method, params, timeout) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const endpoint = await this.endpoint(attempt > 0);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await this.fetcher(endpoint.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++this.serial, method, params }),
          signal: controller.signal,
        });
        if (!response.ok) {
          // A listener that answered is not the old process; do not retry it.
          throw fail(`Toxic refused the request (${response.status}).`, 502);
        }
        const document = await response.json().catch(() => null);
        if (!document) throw fail('Toxic returned an unreadable answer.', 502);
        if (document.error) {
          const message = typeof document.error.message === 'string' ? document.error.message : 'Toxic refused the request.';
          throw fail(message, document.error.code === -32602 ? 400 : 502);
        }
        if (!document.result) throw fail('Toxic returned no result.', 502);
        return document.result;
      } catch (error) {
        last = error;
        // A protocol-level refusal is the server's answer: do not ask twice.
        if (error?.status === 400 || error?.status === 502) throw error;
        this.found = null;
        if (attempt === 1) throw error?.status ? error : transportFailure(error, timeout);
      } finally {
        clearTimeout(timer);
      }
    }
    throw last || fail('Toxic did not answer.', 503);
  }

  async callTool(name, args, timeout) {
    const result = await this.rpc('tools/call', { name, arguments: args }, timeout);
    if (!Array.isArray(result?.content)) throw fail('Toxic returned no tool content.', 502);
    return result.content;
  }

  // A WAV must be 16 kHz mono PCM for Hex, but Toxic accepts whichever WAV it
  // is given. The caller normalizes; this only refuses bytes that are not WAV.
  async transcribeWav(wav, { model, language } = {}) {
    if (!Buffer.isBuffer(wav) || wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
      throw fail('The recording could not be prepared for transcription.', 400);
    }
    const content = await this.callTool('transcribe', {
      audio_base64: wav.toString('base64'),
      ...(model ? { model } : {}),
      ...(language ? { language } : {}),
    }, 180_000);
    const text = content.find(block => block?.type === 'text' && typeof block.text === 'string')?.text?.trim() || '';
    if (!text) throw fail('No speech was recognized. Try recording again.', 422);
    return text;
  }

  // speed 1 keeps Toxic's configured speed out of the result: Project KO
  // stretches playback itself, and applying both would speak too fast.
  async speak(text, speed = 1) {
    if (typeof text !== 'string' || !text.trim()) throw fail('Choose a short text segment.', 400);
    if (text.length > 8000) throw fail('Text is limited to 8000 characters.', 400);
    const content = await this.callTool('speak', { text, speed: Math.min(4, Math.max(0.5, speed)) }, 300_000);
    const resource = content.find(block => block?.type === 'resource' && typeof block.resource?.blob === 'string');
    if (!resource) throw fail('Toxic returned no audio.', 502);
    const audio = Buffer.from(resource.resource.blob, 'base64');
    if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
      throw fail('Toxic returned an empty recording.', 502);
    }
    return audio;
  }
}
