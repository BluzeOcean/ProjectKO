// Isolated workspace; Toxic is stubbed at the service route, no real microphone.
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
const transcript = 'Please review this draft.';
const mic = page => page.getByRole('button', { name: 'Dictate a message', exact: true });
const stop = page => page.getByRole('button', { name: 'Stop dictating' });
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const actions = [];
  let unavailable = false;
  // The service route is the only thing Project KO talks to: the button never
  // opens a microphone of its own.
  // The button reads Toxic's dictation chord from the service so the chat can
  // honour the same shortcut while it has focus.
  await page.route('**/api/dictation', route => route.fulfill({ json: { available: true, provider: 'toxic', maxSeconds: 120, maxBytes: 8388608, shortcut: 'Ctrl+T' } }));
  await page.route('**/api/dictation/listen', route => {
    const action = route.request().postDataJSON()?.action;
    actions.push(action);
    if (action === 'start' && unavailable) return route.fulfill({ status: 503, json: { error: 'Toxic is not installed on this computer. Install Toxic, then press the microphone again.' } });
    if (action === 'start') return route.fulfill({ json: { listening: true } });
    if (action === 'stop') return route.fulfill({ json: { listening: false, text: transcript } });
    if (action === 'status') return route.fulfill({ json: { listening: true, last: null } });
    return route.fulfill({ json: { listening: false } });
  });
  await page.goto(service.urls.chats);
  // The terminal view of a chat: the words are typed into the CLI, and the
  // recorder belongs to Toxic, so no timer or panel of ours appears.
  await expect(mic(page)).toBeEnabled();
  await mic(page).click();
  await expect(stop(page)).toBeVisible();
  await expect(page.getByText(/Recording \d/)).toHaveCount(0);
  await stop(page).click();
  await expect(mic(page)).toBeEnabled();
  assert.deepEqual(actions.slice(0, 2), ['start', 'stop']);
  assert.ok(writes.includes('\x1b[200~' + transcript + '\x1b[201~'));
  assert.ok(!writes.includes('\r'));
  // Ctrl+T stays the chord in the terminal view and drives the same switch.
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.press('Control+t');
  await expect(stop(page)).toBeVisible();
  await page.keyboard.press('Control+t');
  await expect(mic(page)).toBeEnabled();
  assert.equal(writes.filter(text => text === '\x1b[200~' + transcript + '\x1b[201~').length, 2);
  // The conversation composer keeps the words as a draft instead.
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.locator('.conversation-composer textarea')).toBeVisible();
  await mic(page).click();
  await expect(stop(page)).toBeVisible();
  await stop(page).click();
  await expect(page.locator('.conversation-composer textarea')).toHaveValue(transcript);
  // Toxic's own shortcut works inside the chat too, without the button.
  const before = actions.filter(action => action === 'start').length;
  await page.locator('.conversation-composer textarea').focus();
  await page.keyboard.press('Control+t');
  await expect(stop(page)).toBeVisible();
  assert.equal(actions.filter(action => action === 'start').length, before + 1);
  await stop(page).click();
  await expect(mic(page)).toBeEnabled();
  assert.ok(!(await page.locator('.conversation-composer textarea').inputValue()).includes('\t'));
  // A missing Toxic is a prompt to install it, in the composer's status line.
  unavailable = true;
  await mic(page).click();
  await expect(page.locator('.conversation-status')).toContainText('Install Toxic');
  await expect(mic(page)).toBeEnabled();
  await page.screenshot({ path: path.join(repo, 'desktop-dictation.png') });
  console.log(JSON.stringify({ ok: true, screenshot: path.join(repo, 'desktop-dictation.png'), checks: ['switch only', 'no recorder panel', 'draft insert', 'install prompt'] }));
} finally { await browser?.close(); session.process = null; await service.close(); }
