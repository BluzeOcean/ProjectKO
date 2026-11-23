import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';

/**
 * Toxic's transcriber (Hex, inside Toxic) accepts 16 kHz mono PCM WAV. The
 * microphone in the browser produces WebM/Opus, MP4/AAC or OGG/Opus, so the
 * service normalizes every recording before sending it over MCP.
 *
 * ffmpeg is used when it is on PATH (or PKO_FFMPEG names it). A recording that
 * is already WAV needs no converter: it is passed through unchanged, and Hex
 * resamples it if necessary.
 */

const fail = (message, status) => Object.assign(new Error(message), { status });
const maximum = 40 * 1024 * 1024;
const extensions = new Set(['webm', 'm4a', 'mp4', 'ogg', 'wav']);

export const isWav = value => Buffer.isBuffer(value) && value.length >= 44 && value.toString('ascii', 0, 4) === 'RIFF' && value.toString('ascii', 8, 12) === 'WAVE';

// ffmpeg writes to a non-seekable pipe without going back to fill in the RIFF
// and data sizes, so it leaves 0xffffffff there. Hex reads those sizes and
// rejects the file as invalid; fill them in from the bytes we actually have.
export function finalizeWav(buffer) {
  if (!isWav(buffer)) return buffer;
  buffer.writeUInt32LE(buffer.length - 8, 4);
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'data') { buffer.writeUInt32LE(buffer.length - offset - 8, offset + 4); break; }
    if (size === 0xffffffff) break;
    offset += 8 + size + (size & 1);
  }
  return buffer;
}

function run(command, input, audio, { signal, timeout, env }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(fail('Transcription cancelled.', 499)); return; }
    let child;
    try {
      child = spawn(command, ['-hide_banner', '-loglevel', 'error', ...input, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-f', 'wav', 'pipe:1'], {
        windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) { reject(error); return; }
    const chunks = [];
    let size = 0, stderr = '', settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      try { child.kill(); } catch { /* Already gone. */ }
      fn(value);
    };
    const cancel = () => settle(reject, fail('Transcription cancelled.', 499));
    const timer = setTimeout(() => settle(reject, fail('Preparing the recording timed out. Try a shorter message.', 504)), timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > maximum) { settle(reject, fail('The prepared recording is too large.', 413)); return; }
      chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.on('error', error => settle(reject, error));
    child.on('exit', code => {
      if (code !== 0) {
        settle(reject, fail('The recording could not be read. Try recording again.', 415));
        return;
      }
      const audio = finalizeWav(Buffer.concat(chunks));
      if (!isWav(audio)) { settle(reject, fail('The recording could not be read. Try recording again.', 415)); return; }
      settle(resolve, audio);
    });
    child.stdin.on('error', () => { /* ffmpeg may exit before reading all input. */ });
    if (audio) child.stdin.end(audio); else child.stdin.end();
  });
}

async function throughFile(command, audio, extension, options) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'pko-toxic-'));
  try {
    const file = path.join(folder, 'recording.' + extension);
    await writeFile(file, audio, { mode: 0o600 });
    return await run(command, ['-i', file], null, options);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export async function toWav16k(audio, extension = 'webm', { signal, env = process.env, timeout = 60_000, command } = {}) {
  if (!Buffer.isBuffer(audio) || !audio.length) throw fail('The recording is empty.', 400);
  const safe = extensions.has(String(extension)) ? String(extension) : 'webm';
  const exe = command || env.PKO_FFMPEG || 'ffmpeg';
  try {
    return await run(exe, ['-i', 'pipe:0'], audio, { signal, timeout, env });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (isWav(audio)) return audio;
      throw fail('Converting a recording needs ffmpeg on this computer. Install ffmpeg, or set PKO_FFMPEG to its path.', 503);
    }
    if (error?.status === 499 || error?.status === 413 || error?.status === 504) throw error;
    // MP4/M4A readers may require a seekable file; try one before giving up.
    if (signal?.aborted) throw fail('Transcription cancelled.', 499);
    try {
      return await throughFile(exe, audio, safe, { signal, timeout, env });
    } catch (retry) {
      if (retry?.status) throw retry;
      throw error;
    }
  }
}
