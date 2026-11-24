// Dictation in Project KO is Toxic's business: Toxic owns the chord, records
// the take and types the words into the focused window. Two things are checked
// here. The terminal has to receive the text that Windows typed as a unicode
// packet, which xterm v6 drops on its own. And this app must not ask Toxic
// for anything at all - no watcher, no transcript, no microphone switch.
import { expect } from '@playwright/test';
import { launchBrowser } from './browser.mjs';
import { mkdtemp, mkdir, cp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createService } from '../server.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache/desktop-dictation-ui-'));
await mkdir(path.join(repo, 'workspace'));
await writeFile(path.join(repo, 'workspace/workspace.json'), '{"entities":[]}');
await cp(path.join(root, 'dist'), path.join(repo, 'ui'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(repo, 'ui/assets'), { recursive: true });
// Toxic is not running in a test, so the take is answered by a stand-in.
// What is checked is the shape of the exchange and where the words land.
const takes = [];
const toxicDictation = {
  async take({ hint } = {}) { takes.push({ action: 'start', hint }); return { listening: true }; },
  async stop() { takes.push({ action: 'stop' }); return { transcript: 'the spoken words' }; },
  async cancel() { takes.push({ action: 'cancel' }); return { listening: false }; },
  async status() { return { listening: false, last: null }; },
};
const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} }, toxicOptions: { dictation: toxicDictation } });
const session = service.sessions.make({ id: 'dictation-test', createdAt: new Date().toISOString(), cols: 90, rows: 32, name: 'Dictation test', agent: 'claude', cwd: repo, open: true });
const writes = [];
session.status = 'running'; session.process = { write: data => writes.push(data), resize() {}, kill() {} };
service.sessions.items.set(session.id, session);
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  // Nothing may reach the clipboard: the words are typed, not pasted.
  await page.addInitScript(() => {
    window.__clipboardCalls = 0;
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    for (const name of ['readText', 'writeText', 'read', 'write']) {
      const original = clipboard[name];
      if (typeof original !== 'function') continue;
      clipboard[name] = (...args) => { window.__clipboardCalls++; return original.apply(clipboard, args); };
    }
  });
  await page.goto(service.urls.chats);
  await page.bringToFront();
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  const textarea = page.locator('.xterm-helper-textarea');
  await expect(textarea).toBeAttached();
  await textarea.focus();

  // An ordinary key is typed once, exactly as before the bridge.
  let before = writes.length;
  await page.keyboard.type('abc');
  await expect.poll(() => writes.slice(before).join(''), { timeout: 5000 }).toContain('abc');
  assert.equal(writes.slice(before).join(''), 'abc', 'an ordinary key is typed once');

  // A unicode packet: the key Chromium reports as 229, then the text itself.
  before = writes.length;
  await page.evaluate(() => {
    const field = document.querySelector('.xterm-helper-textarea');
    field.focus();
    const key = new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, cancelable: true });
    Object.defineProperty(key, 'keyCode', { get: () => 229 });
    field.dispatchEvent(key);
    field.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'Hello', bubbles: true, cancelable: true }));
  });
  await expect.poll(() => writes.slice(before).join(''), { timeout: 5000 }).toContain('Hello');
  assert.equal(writes.slice(before).join(''), 'Hello', 'the words of the packet arrive once');

  // Two packets in a row are two sentences, neither lost nor doubled.
  before = writes.length;
  await page.evaluate(() => {
    const field = document.querySelector('.xterm-helper-textarea');
    const packet = text => {
      const key = new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, cancelable: true });
      Object.defineProperty(key, 'keyCode', { get: () => 229 });
      field.dispatchEvent(key);
      field.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
    };
    packet('One. ');
    packet('Two.');
  });
  await expect.poll(() => writes.slice(before).join(''), { timeout: 5000 }).toContain('Two.');
  assert.equal(writes.slice(before).join(''), 'One. Two.', 'every packet arrives once');

  // A composition is the terminal's own business and stays there.
  before = writes.length;
  await page.evaluate(() => {
    const field = document.querySelector('.xterm-helper-textarea');
    const key = new KeyboardEvent('keydown', { key: 'Process', bubbles: true, cancelable: true });
    Object.defineProperty(key, 'keyCode', { get: () => 229 });
    Object.defineProperty(key, 'isComposing', { get: () => true });
    field.dispatchEvent(key);
    field.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: '中', bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(600);
  assert.equal(writes.slice(before).join(''), '', 'a composition is left to the terminal');

  // The chord opens a take. Over a Chromium web view Toxic's own system-wide
  // hook never fires - the host takes the keyboard as raw input, so no
  // keyboard message and no low-level hook are ever generated for it - so the
  // terminal asks for the take itself. Toxic still owns the microphone, the
  // recording and the transcription.
  before = writes.length;
  await page.keyboard.press('Control+t');
  await expect.poll(() => takes.filter(call => call.action === 'start').length, { timeout: 5000 }).toBe(1);
  assert.ok(!writes.slice(before).some(chunk => chunk.includes('\x14')), 'the CLI never receives the chord');

  // The next key ends the take, and the words land in the terminal that asked
  // for them. Nothing is typed into any other window.
  await page.keyboard.press('Space');
  await expect.poll(() => writes.slice(before).join(''), { timeout: 5000 }).toContain('the spoken words');
  assert.equal(takes.filter(call => call.action === 'stop').length, 1, 'the take is finished once');
  assert.ok(!writes.slice(before).some(chunk => chunk.includes('\x14')), 'the CLI never receives the chord');
  // The words are inserted, never submitted: the person edits them and
  // presses Enter.
  assert.ok(!writes.slice(before).join('').includes('\r'), 'the words are not submitted');

  const clipboardCalls = await page.evaluate(() => window.__clipboardCalls);
  assert.equal(clipboardCalls, 0, 'the clipboard is never touched');

  // The app asks Toxic for a take - and only when the chord is pressed in a
  // terminal. It never polls, and the route that used to carry the microphone
  // is gone. The dictation provider status is a different thing - it says
  // which engine transcribes the phone - and it is asked once, not polled.
  assert.equal(takes.filter(call => call.action === 'start').length, 1, 'one take was asked for');
  assert.deepEqual(requests.filter(url => /api\/dictation\/listen|transcript/.test(url)), [], 'the old microphone route is not used');
  const providerCalls = requests.filter(url => url.includes('/api/dictation')).length;
  await page.waitForTimeout(3000);
  assert.equal(requests.filter(url => url.includes('/api/dictation')).length, providerCalls, 'Toxic is not polled');
  await expect(page.getByRole('button', { name: 'Dictate a message', exact: true })).toHaveCount(0);

  // The route that used to carry the microphone is gone.
  const answer = await fetch(service.origin + '/api/dictation/listen', { method: 'POST', headers: { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) });
  assert.ok(!(await answer.text()).includes('"listening"'), 'the listen endpoint is gone');

  // The probe is a tool, not part of the behaviour: in a release build it
  // records nothing until an agent asks for it, and it stays off the screen
  // until it is asked for that too. An agent switches it over the service, and
  // the lines it writes are read from the window's own storage.
  const probe = (body) => fetch(service.origin + '/api/dictation/probe', { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  assert.deepEqual((await (await probe()).json()).probe, { recording: false, badge: false, mode: 'release' });
  assert.equal(await page.locator('#pko-dictation-probe').count(), 0, 'the badge waits to be asked for');
  assert.equal(await page.evaluate(() => window.localStorage.getItem('mrmak.dictationProbe')), null, 'a release build records nothing until it is asked to');
  await probe({ recording: true, badge: true });
  await expect(page.locator('#pko-dictation-probe')).toHaveCount(1, { timeout: 5000 });
  await page.keyboard.press('Control+t');
  await expect.poll(async () => (await page.evaluate(() => window.localStorage.getItem('mrmak.dictationProbe')) || '').includes('keydown'), { timeout: 5000 }).toBe(true);
  await probe({ badge: false });
  await expect(page.locator('#pko-dictation-probe')).toHaveCount(0, { timeout: 5000 });

  await page.screenshot({ path: path.join(repo, 'desktop-dictation.png') });
  console.log(JSON.stringify({ ok: true, screenshot: path.join(repo, 'desktop-dictation.png'), checks: ['ordinary key typed once', 'packet arrives once', 'packets in a row', 'composition left alone', 'chord opens a take', 'the words land in the terminal', 'the words are not submitted', 'the CLI never receives the chord', 'clipboard untouched', 'one take asked for', 'Toxic is not polled', 'no microphone switch', 'probe stays off until it is asked to, then records and can be shown and hidden'] }));
} finally { await browser?.close(); session.process = null; await service.close(); }
