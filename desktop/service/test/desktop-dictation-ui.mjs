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
  let unavailable = false, toxicOwned = false, listening = false, last = null;
  // The service route is the only thing Project KO talks to: the switch never
  // opens a microphone of its own.
  await page.route('**/api/dictation', route => route.fulfill({ json: { available: true, provider: 'toxic', maxSeconds: 120, maxBytes: 8388608, shortcut: 'Ctrl+T' } }));
  await page.route('**/api/dictation/listen', route => {
    const action = route.request().postDataJSON()?.action;
    actions.push(action);
    if (action === 'status') return route.fulfill({ json: { listening, owner: listening ? 'project-ko' : null, last } });
    if (action === 'start') {
      if (unavailable) return route.fulfill({ status: 503, json: { error: 'Toxic is not installed on this computer. Install Toxic, then press the microphone again.' } });
      // Toxic's own shortcut reached its keyboard hook a moment before this
      // window asked, so the microphone already belongs to a Toxic take.
      if (toxicOwned) return route.fulfill({ json: { listening: true, owner: 'toxic' } });
      listening = true;
      return route.fulfill({ json: { listening: true, owner: 'project-ko' } });
    }
    if (action === 'stop') { listening = false; last = { text: transcript, at: Date.now() }; return route.fulfill({ json: { listening: false, text: transcript, owner: 'project-ko' } }); }
    listening = false;
    return route.fulfill({ json: { listening: false } });
  });
  await page.goto(service.urls.chats);
  await page.bringToFront();
  // A window that reloads while a take is open takes the switch back over,
  // instead of leaving the microphone lit with nothing to close it.
  listening = true;
  // The token lives in memory, so a reload has to go back through the URL that
  // carries it (the desktop window gets it from Tauri, which is why a plain
  // reload works there).
  await page.goto(service.urls.chats);
  await expect(stop(page)).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Escape');
  await expect(mic(page)).toBeEnabled();
  listening = false;
  // The switch opens the microphone, and the same switch closes it.
  await expect(mic(page)).toBeEnabled();
  await mic(page).click();
  await expect(stop(page)).toBeVisible();
  await expect(page.getByText(/Recording \d/)).toHaveCount(0);
  await stop(page).click();
  await expect(mic(page)).toBeEnabled();
  const firstStart = actions.indexOf('start');
  assert.deepEqual(actions.slice(firstStart, firstStart + 2), ['start', 'stop'], 'one press opens the take, the next closes it');
  assert.ok(writes.includes('\x1b[200~' + transcript + '\x1b[201~'), 'the words are pasted into the CLI');
  assert.ok(!writes.includes('\r'), 'nothing is submitted for the person');
  // The chord belongs to Toxic's system-wide hook. This window must leave it
  // alone, and the CLI must never receive ^T if it does arrive here.
  const starts = actions.filter(action => action === 'start').length;
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.press('Control+t');
  await page.waitForTimeout(500);
  assert.equal(actions.filter(action => action === 'start').length, starts, 'the chord never opens a take here');
  await expect(stop(page)).toHaveCount(0);
  assert.ok(!writes.some(chunk => chunk.includes('\x14')), 'the CLI never receives the chord');
  // Escape throws the take away and the switch comes back on its own.
  await mic(page).click();
  await expect(stop(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(mic(page)).toBeEnabled();
  assert.ok(actions.includes('cancel'), 'Escape cancels the take');
  // Toxic can end a take without this app asking - its maximum length, or a
  // cancel from Toxic's own window. The words are still recovered.
  await mic(page).click();
  await expect(stop(page)).toBeVisible();
  listening = false;
  last = { text: 'Words Toxic finished alone.', at: Date.now() + 2000 };
  await expect(mic(page)).toBeEnabled({ timeout: 6000 });
  assert.ok(writes.some(chunk => chunk.includes('Words Toxic finished alone.')), 'the words are kept');
  assert.ok(!writes.some(chunk => chunk.includes('\x14')));
  // The conversation keeps the words as a draft instead.
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  const textarea = page.locator('.conversation-composer textarea');
  await expect(textarea).toBeVisible();
  const conversationStarts = actions.filter(action => action === 'start').length;
  await mic(page).click();
  await expect(stop(page)).toBeVisible();
  await stop(page).click();
  await expect(textarea).toHaveValue(transcript);
  assert.ok(actions.filter(action => action === 'start').length > conversationStarts);
  // Toxic got there first: the switch steps aside and sends no stop that would
  // hand the same sentence back twice.
  toxicOwned = true;
  const stops = actions.filter(action => action === 'stop').length;
  await mic(page).click();
  await expect(mic(page)).toBeEnabled();
  await expect(stop(page)).toHaveCount(0);
  assert.equal(actions.filter(action => action === 'stop').length, stops, 'a take Toxic owns is left alone');
  toxicOwned = false;
  // Toxic types its own takes where the caret is. A web view terminal never
  // receives that typing, so the words arrive from Toxic's history instead -
  // and only when the field does not already hold them.
  await textarea.fill('');
  await textarea.focus();
  last = { text: 'Typed by Toxic elsewhere.', at: Date.now() + 6000 };
  await expect(textarea).toHaveValue('Typed by Toxic elsewhere.', { timeout: 8000 });
  await textarea.fill('Already here: Typed by Toxic twice.');
  last = { text: 'Typed by Toxic twice.', at: Date.now() + 12000 };
  await page.waitForTimeout(2600);
  assert.equal(await textarea.inputValue(), 'Already here: Typed by Toxic twice.', 'words already in the field are not repeated');
  // A missing Toxic is a prompt to install it, in the composer's status line.
  unavailable = true;
  await textarea.fill('');
  await mic(page).click();
  await expect(page.locator('.conversation-status')).toContainText('Install Toxic');
  await expect(mic(page)).toBeEnabled();
  unavailable = false;
  await page.screenshot({ path: path.join(repo, 'desktop-dictation.png') });
  // The terminal cannot receive Toxic's typing at all, so the same words are
  // pasted into the CLI from Toxic's history.
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.locator('.xterm-helper-textarea')).toBeAttached();
  const beforeTerminal = writes.length;
  last = { text: 'Words for the terminal.', at: Date.now() + 9000 };
  await expect.poll(() => writes.slice(beforeTerminal).some(chunk => chunk.includes('Words for the terminal.')), { timeout: 8000 }).toBe(true);
  assert.ok(writes.slice(beforeTerminal).every(chunk => chunk.includes('\x1b[200~')), 'the words are pasted, not submitted');
  console.log(JSON.stringify({ ok: true, screenshot: path.join(repo, 'desktop-dictation.png'), checks: ['switch only', 'open take adopted', 'chord untouched', 'escape cancels', 'external end', 'draft insert', 'Toxic take left alone', 'Toxic words placed', 'install prompt', 'terminal fallback'] }));
} finally { await browser?.close(); session.process = null; await service.close(); }
