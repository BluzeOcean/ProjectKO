import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';
import { createService } from '../server.mjs';
import { validateTabDocument, tabText } from '../vault-schema.mjs';
import { Selection } from '../selection.mjs';
import { BoardAgents } from '../board-agents.mjs';

const pinboard = () => ({
  format: 'pko-tab', version: 1, layout: 'pinboard', summary: 'References for the cast.',
  nodes: [
    { kind: 'card', id: 'first', title: 'Silk study', body: 'The dark one.', image: 'media/silk.png', alt: 'A figure in silk' },
    { kind: 'card', id: 'second', title: 'Paper study', body: 'The pale one.', image: 'media/paper.png', feedback: 'Looser folds here.' },
  ],
});

const board = {
  id: 'lab', title: 'Arachne Character Lab', description: '', tags: ['gallery'], status: 'active',
  folder: 'lab', created: '2026-01-01', updated: '2026-01-01',
  pages: [{
    id: 'pinboard', title: 'Pinboard', description: '', tags: ['3d'], created: '2026-01-01', updated: '2026-01-01',
    tabs: [{ id: 'content', name: 'Pinboard', path: 'pinboard/content.tab.json' }],
  }],
};

async function fixture(t) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'pko-pinboard-'));
  await mkdir(path.join(repo, 'workspace', 'lab', 'pinboard', 'media'), { recursive: true });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<!doctype html><title>Test</title>');
  await writeFile(path.join(repo, 'workspace/lab/pinboard/content.tab.json'), JSON.stringify(pinboard(), null, 2) + '\n');
  await writeFile(path.join(repo, 'workspace/lab/pinboard/media/silk.png'), 'png');
  await writeFile(path.join(repo, 'workspace/lab/pinboard/media/paper.png'), 'png');
  await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({ format: 'pko-vault', version: 2, boards: [board] }));
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  t.after(async () => { await service.close(); assert.equal(path.dirname(repo), path.resolve(os.tmpdir())); await rm(repo, { recursive: true, force: true }); });
  const request = (route, body, method, extra = {}) => fetch(service.origin + '/api' + route, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { Authorization: 'Bearer ' + service.token, Origin: service.origin, 'Content-Type': 'application/json', ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = async (route, body, method, extra) => (await request(route, body, method, extra)).json();
  return { repo, service, request, json };
}

const until = async (test, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await test()) return true; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('Timed out waiting for the service.');
};

test('a pinboard card carries the feedback and the marked picture, and nothing else', () => {
  const document = validateTabDocument(pinboard());
  assert.equal(document.layout, 'pinboard');
  assert.equal(document.nodes[1].feedback, 'Looser folds here.');
  // The words the user wrote are part of what an agent reads.
  assert.match(tabText(document), /Looser folds here\./);
  assert.throws(() => validateTabDocument({ ...pinboard(), nodes: [{ ...pinboard().nodes[0], feedback: 'x'.repeat(4001) }] }));
  assert.throws(() => validateTabDocument({ ...pinboard(), nodes: [{ ...pinboard().nodes[0], annotation: '../escape.png' }] }));
  assert.throws(() => validateTabDocument({ ...pinboard(), nodes: [{ ...pinboard().nodes[0], annotation: 'https://remote.example/x.png' }] }));
  assert.doesNotThrow(() => validateTabDocument({ ...pinboard(), nodes: [{ ...pinboard().nodes[0], annotation: 'media/first-marked.png' }] }));
});

test('one click stores one choice, and an agent pulls it', async t => {
  const { service, json } = await fixture(t);
  assert.deepEqual(await json('/workspace/selection'), { selection: null });
  const chosen = await json('/workspace/selection', { boardId: 'lab', pageId: 'pinboard', tabId: 'content', cardId: 'first' });
  const { selection } = chosen;
  assert.equal(selection.boardId, 'lab');
  assert.equal(selection.pageId, 'pinboard');
  assert.equal(selection.tab, 'content');
  assert.equal(selection.cardId, 'first');
  assert.equal(selection.fileName, 'silk.png');
  // The picture is on disk, and the pointer the agent pulls says where.
  assert.ok(selection.picture.endsWith(path.join('workspace', 'lab', 'pinboard', 'media', 'silk.png')));
  assert.equal(selection.feedback, '');
  assert.equal(selection.notes, 'The dark one.');
  // The same choice, read back, is the same choice.
  assert.equal((await json('/workspace/selection')).selection.cardId, 'first');
  // The coordinator pulls the full card, not a stale copy of it.
  const pulled = await service.coordinator.execute('current_selection', {});
  assert.equal(pulled.cardId, 'first');
  assert.equal(pulled.boardTitle, 'Arachne Character Lab');
  assert.equal(pulled.pageTitle, 'Pinboard');
  // Clearing is explicit and empty afterwards.
  assert.deepEqual(await json('/workspace/selection/clear', {}), { selection: null });
  assert.equal(await service.coordinator.execute('current_selection', {}), null);
});

test('a choice that names nothing on the board is refused', async t => {
  const { request, json } = await fixture(t);
  const base = { boardId: 'lab', pageId: 'pinboard', tabId: 'content', cardId: 'first' };
  assert.equal((await request('/workspace/selection', { ...base, cardId: 'missing' })).status, 400);
  assert.equal((await request('/workspace/selection', { ...base, boardId: 'missing' })).status, 404);
  assert.equal((await request('/workspace/selection', { ...base, tabId: 'missing' })).status, 404);
  assert.equal((await request('/workspace/selection', { boardId: 'lab', pageId: 'pinboard', tabId: 'content' })).status, 400);
  assert.equal((await request('/workspace/selection', base, 'POST', { Authorization: '' })).status, 401);
  assert.deepEqual(await json('/workspace/selection'), { selection: null });
});

test('the choice belongs to one board and is dropped when another is opened', async t => {
  const { service, json } = await fixture(t);
  await json('/workspace/selection', { boardId: 'lab', pageId: 'pinboard', tabId: 'content', cardId: 'first' });
  const ws = new WebSocket(service.origin.replace('http:', 'ws:') + '/events', { origin: service.origin });
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  t.after(() => ws.close());
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type: 'auth', token: service.token, surface: 'workspace' }));
  await until(() => messages.some(message => message.type === 'connected'));
  const send = async message => {
    const before = messages.filter(item => item.type === 'pong').length;
    ws.send(JSON.stringify(message));
    ws.send(JSON.stringify({ type: 'ping' }));
    await until(() => messages.filter(item => item.type === 'pong').length > before);
  };
  await send({ type: 'workspace-route', route: '#/lab/pinboard/content' });
  assert.equal((await json('/workspace/selection')).selection.cardId, 'first');
  // Opening a different board drops the choice, so an agent never pulls a
  // pointer for something the user has walked away from.
  await send({ type: 'workspace-route', route: '#/other' });
  await until(async () => (await json('/workspace/selection')).selection === null);
  assert.deepEqual(await json('/workspace/selection'), { selection: null });
});

test('the board remembers its chat and the hand-off names the page and the tab', async t => {
  const { repo } = await fixture(t);
  const registry = { format: 'pko-vault', version: 2, boards: [JSON.parse(JSON.stringify(board))] };
  const sent = [];
  const chats = new Map();
  const sessions = {
    get: id => { if (!chats.has(id)) throw Object.assign(new Error('Chat no longer exists'), { status: 404 }); return chats.get(id); },
    resume: async id => chats.get(id),
    create: async options => { const session = { id: 'chat-' + (chats.size + 1), agent: options.agent, name: options.name, cwd: options.cwd }; chats.set(session.id, session); return session; },
    input: (id, text, options) => { sent.push({ id, text, options }); },
  };
  const tabs = {
    workspace: {
      registry: async () => registry,
      change: async update => { update(registry); await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify(registry)); },
    },
    resolve: async (boardId, pageId, tabId) => {
      const item = registry.boards.find(value => value.id === boardId);
      return { board: item, page: item.pages[0], tab: item.pages[0].tabs[0], file: path.join(repo, 'workspace/lab/pinboard/content.tab.json'), root: path.join(repo, 'workspace/lab') };
    },
  };
  const agents = new BoardAgents({ repo, tabs, sessions, settings: () => ({ defaultAgent: 'codex' }) });
  await writeFile(path.join(repo, 'workspace/lab/pinboard/content.tab.json'), JSON.stringify({ ...pinboard(), nodes: [{ ...pinboard().nodes[1], annotation: 'media/second-marked.png' }] }));
  const result = await agents.send({ boardId: 'lab', pageId: 'pinboard', tabId: 'content', cardId: 'second' });
  assert.equal(result.sessionId, 'chat-1');
  // The board remembers the chat it opened.
  assert.equal(registry.boards[0].agent.chatId, 'chat-1');
  assert.equal(registry.boards[0].agent.agent, 'codex');
  // The message carries the picture, the marked picture, the notes and the words.
  assert.match(result.message, /Picture: .*media[\\/]paper\.png/);
  assert.match(result.message, /Marked picture: .*media[\\/]second-marked\.png/);
  assert.match(result.message, /Looser folds here\./);
  assert.match(result.message, /The pale one\./);
  // The agent is told which page and tab the card came from.
  assert.match(result.message, /Arachne Character Lab \/ Pinboard \/ Pinboard/);
  assert.equal(sent.length, 1);
  // A second hand-off goes to the same chat; the board keeps one conversation.
  await agents.send({ boardId: 'lab', pageId: 'pinboard', tabId: 'content', cardId: 'second' });
  assert.equal(chats.size, 1);
  assert.equal(sent.length, 2);
  // The binding is on the board's own record, so it travels with the board.
  const written = JSON.parse(await readFile(path.join(repo, 'workspace/workspace.json'), 'utf8'));
  assert.equal(written.boards[0].agent.chatId, 'chat-1');
});

test('the selection store holds one choice and forgets it on request', async t => {
  const { repo } = await fixture(t);
  const file = path.join(repo, 'workspace/lab/pinboard/content.tab.json');
  const tabs = { resolve: async () => ({ board: { title: 'Arachne Character Lab', folder: 'lab' }, page: { title: 'Pinboard' }, tab: { name: 'Pinboard' }, file, root: path.join(repo, 'workspace/lab') }) };
  const changes = [];
  const selection = new Selection({ tabs, changed: value => changes.push(value) });
  assert.equal(selection.state(), null);
  assert.equal(selection.brief(), null);
  await selection.choose({ boardId: 'lab', pageId: 'pinboard', tabId: 'content', cardId: 'first' });
  assert.equal(selection.state().cardId, 'first');
  assert.deepEqual(selection.brief(), { boardId: 'lab', boardTitle: 'Arachne Character Lab', pageId: 'pinboard', pageTitle: 'Pinboard', tab: 'content', tabName: 'Pinboard', cardId: 'first', title: 'Silk study', fileName: 'silk.png' });
  assert.equal(changes.length, 1);
  // A second click replaces the choice; there is only ever one.
  await selection.choose({ boardId: 'lab', pageId: 'pinboard', tabId: 'content', cardId: 'second' });
  assert.equal(selection.state().cardId, 'second');
  assert.equal((await selection.resolve()).feedback, 'Looser folds here.');
  assert.equal(selection.clear(), null);
  assert.equal(selection.state(), null);
  assert.equal(changes.at(-1), null);
});
