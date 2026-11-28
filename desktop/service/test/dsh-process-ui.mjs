// The work behind a harness chat, in the real window.
//
//   node desktop/service/test/dsh-process-ui.mjs
//
// The DeepSeek Harness reports what it is thinking and calling as it works.
// The service tails the harness's event log and projects that into a process;
// the window shows it. This check drives the whole road: a log on disk, the
// tailer, the projection, the websocket, and the panel that draws it.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'dsh-process-ui-'));
await mkdir(path.join(repo, 'workspace'));
await mkdir(path.join(repo, '.mrmak', 'dsh'), { recursive: true });
await writeFile(path.join(repo, 'workspace/workspace.json'), '{"entities":[]}');

const id = 'dsh-process-chat';
await writeFile(path.join(repo, '.mrmak/sessions.json'), JSON.stringify([{
  id, tabOrder: 0, name: 'Harness', agent: 'dsh', group: null, cwd: repo, open: true,
  status: 'stopped', pinned: false, hasConversation: false, cols: 90, rows: 28,
  permissionMode: 'workspace-write', createdAt: '2026-11-28T08:00:00Z', updatedAt: '2026-11-28T08:00:00Z',
}]));

const log = path.join(repo, '.mrmak', 'dsh', `${id}.jsonl`);
const line = event => JSON.stringify({ at: new Date().toISOString(), event }) + '\n';
// The log grows the way the harness writes it: one story, appended to.
const write = events => appendFile(log, events.map(line).join(''), 'utf8');

const service = await createService({ repo, uiDir: path.join(root, 'dist'), mcpOptions: { home: repo, env: {} } });
let browser;
try {
  // The harness is not started: the log on disk is what the tailer reads.
  service.sessions.launch = session => {
    session.status = 'running'; session.restoreError = null;
    session.process = { resize() {}, write() {}, kill() { session.process = null; } };
    service.sessions.changed(session);
  };
  for (const session of service.sessions.items.values()) {
    await service.sessions.hydrate(session); service.sessions.launch(session);
  }
  service.mobile.transcripts.read = async () => ({
    supported: true, messages: [{ id: 'user-1', role: 'user', text: 'Pre-warm the project.', at: '2026-11-28T08:00:00Z' }], activity: [],
  });
  // The tailer the service uses for a harness chat, pointed at the log.
  const session = service.sessions.get(id);
  service.sessions.watchDsh(session, log);

  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
  page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));

  await page.goto(service.urls.chats);
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Message DeepSeek Harness' })).toBeVisible();

  /* ── The harness thinks: the panel opens with the thinking in it ──────── */
  await write([
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [
      { type: 'reasoning', text: 'The user says pre-warm.\n\nLet me read the module docs first.' },
      { type: 'text', text: 'Reading now.' },
    ] } } },
  ]);

  const panel = page.locator('.dsh-process');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.dsh-process-turn.is-live')).toHaveCount(1);
  // The thinking folds to one line that says what the step was thinking about.
  const thinking = panel.locator('.dsh-process-thinking');
  await expect(thinking).toHaveCount(1);
  await expect(thinking.locator('.dsh-process-preview')).toHaveText('Let me read the module docs first.');
  // Folded, the thinking is there but not on the screen.
  await expect(thinking.locator('p')).toHaveCount(1);
  await expect(thinking.locator('p')).not.toBeVisible();
  // The last line of the box is the status: the model is the one working.
  await expect(panel.locator('.dsh-process-status')).toHaveText('thinking — Let me read the module docs first.');
  // Open it, and the whole of it is there.
  await thinking.locator('summary').click();
  await expect(thinking.locator('p')).toBeVisible();
  await expect(thinking.locator('p')).toHaveText('The user says pre-warm.\n\nLet me read the module docs first.');

  /* ── The tools fire: each one shows what it was asked to do ──────────── */
  await write([
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"file_path":"V:/modules/rules.md"}' } },
    { type: 'tool/result', data: { turn: 1, step: 1, message: { toolCallId: 'c1', isError: false, content: [] } } },
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c2', name: 'pwsh', arguments: '{"command":"Get-ChildItem V:/Vault"}' } },
  ]);
  const tools = panel.locator('.dsh-process-tool');
  await expect(tools).toHaveCount(2);
  await expect(tools.nth(0).locator('.dsh-process-tool-name')).toHaveText('read');
  await expect(tools.nth(0).locator('.dsh-process-tool-detail')).toHaveText('V:/modules/rules.md');
  await expect(tools.nth(1).locator('.dsh-process-tool-detail')).toHaveText('Get-ChildItem V:/Vault');
  // The tool that answered is done; the one still open is running.
  await expect(tools.nth(0).locator('small')).toHaveText('completed');
  await expect(tools.nth(1).locator('small')).toHaveText('running');
  // The summary counts the tools the way the harness counts them.
  await expect(panel.locator('.dsh-process-counts')).toHaveText('read 1 · commands 1');
  // The last line now names the tool in flight, not the thinking.
  await expect(panel.locator('.dsh-process-status')).toHaveText('commands — Get-ChildItem V:/Vault');
  await page.screenshot({ path: path.join(repo, 'working.png') });

  /* ── The turn ends: the panel folds, and the work stays readable ─────── */
  await write([
    { type: 'tool/result', data: { turn: 1, step: 1, message: { toolCallId: 'c2', isError: false, content: [] } } },
    { type: 'turn/end', data: { turn: 1, reason: 'completed' } },
  ]);
  await expect(panel.locator('.dsh-process-turn.is-live')).toHaveCount(0);
  await expect(panel.locator('details.dsh-process-turn')).toHaveCount(1);
  // Folded, but the work is still there to open.
  await expect(panel.locator('.dsh-process-tool')).toHaveCount(2);
  await panel.locator('details.dsh-process-turn > summary').click();
  await expect(panel.locator('.dsh-process-tool').first()).toBeVisible();
  // And the last line says the turn is done.
  await expect(panel.locator('.dsh-process-status')).toHaveText('✓ Done');
  await page.screenshot({ path: path.join(repo, 'folded.png') });

  /* ── A window that arrives late still sees the work ──────────────────── */
  // The harness is idle now and writes nothing, so the process is not pushed
  // again. A window that opens the chat must still be shown what was done.
  const late = await browser.newPage({ viewport: { width: 900, height: 760 } });
  late.setDefaultTimeout(12000);
  await late.goto(service.urls.chats);
  await late.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(late.locator('.dsh-process')).toBeVisible();
  await expect(late.locator('.dsh-process-tool')).toHaveCount(2);
  await expect(late.locator('.dsh-process-preview')).toHaveText('Let me read the module docs first.');
  await late.close();

  assert.deepEqual(errors, []);
  console.log('DSH process passed: the harness\'s thinking and tools reach the window while it works, the thinking folds to one line, and the last line says whether the turn is running or done. Screenshots: ' + repo);
} finally { await browser?.close(); await service.close(); }
