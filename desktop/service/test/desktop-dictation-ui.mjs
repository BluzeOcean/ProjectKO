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
const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} } });
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

  // The chord is Toxic's. It may still reach the window when Toxic is in its
  // double tap mode, and the CLI must never see it.
  before = writes.length;
  await page.keyboard.press('Control+t');
  await page.waitForTimeout(400);
  assert.ok(!writes.slice(before).some(chunk => chunk.includes('\x14')), 'the CLI never receives the chord');

  const clipboardCalls = await page.evaluate(() => window.__clipboardCalls);
  assert.equal(clipboardCalls, 0, 'the clipboard is never touched');

  // This app asks Toxic for no take: no microphone, no transcript, no watcher.
  // The dictation provider status is a different thing - it says which engine
  // transcribes the phone - and it is asked once, not polled.
  const takeCalls = requests.filter(url => /listen|transcript|take/.test(url));
  assert.deepEqual(takeCalls, [], 'the app asks for no take');
  const providerCalls = requests.filter(url => url.includes('/api/dictation')).length;
  await page.waitForTimeout(3000);
  assert.equal(requests.filter(url => url.includes('/api/dictation')).length, providerCalls, 'Toxic is not polled');
  await expect(page.getByRole('button', { name: 'Dictate a message', exact: true })).toHaveCount(0);

  // The route that used to carry the microphone is gone.
  const answer = await fetch(service.origin + '/api/dictation/listen', { method: 'POST', headers: { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) });
  assert.ok(!(await answer.text()).includes('"listening"'), 'the listen endpoint is gone');

  await page.screenshot({ path: path.join(repo, 'desktop-dictation.png') });
  console.log(JSON.stringify({ ok: true, screenshot: path.join(repo, 'desktop-dictation.png'), checks: ['ordinary key typed once', 'packet arrives once', 'packets in a row', 'composition left alone', 'chord swallowed', 'clipboard untouched', 'no take requested', 'Toxic is not polled', 'no microphone switch'] }));
} finally { await browser?.close(); session.process = null; await service.close(); }
