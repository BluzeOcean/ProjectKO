import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';
import { createService } from '../server.mjs';
import { validateCard, cardText } from '../card-schema.mjs';
import { Selection } from '../selection.mjs';
import { BoardAgents } from '../board-agents.mjs';

const pinboard = () => ({
  format: 'mrmak-card', version: 1, template: 'pinboard', title: 'Character lab',
  summary: 'References for the cast.',
  items: [
    { id: 'first', title: 'Silk study', body: 'The dark one.', image: 'media/silk.png', alt: 'A figure in silk' },
    { id: 'second', title: 'Paper study', body: 'The pale one.', image: 'media/paper.png', feedback: 'Looser folds here.' },
  ],
});

async function fixture(t) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'mrmak-pinboard-'));
  await mkdir(path.join(repo, 'workspace', 'lab'), { recursive: true });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<!doctype html><title>Test</title>');
  await writeFile(path.join(repo, 'workspace/lab/content.card.json'), JSON.stringify(pinboard(), null, 2) + '\n');
  const entity = { id: 'lab', title: 'Arachne Character Lab', folder: 'lab', type: 'group', category: 'image-gen', status: 'active', created: '2026-01-01', steps: [{ name: 'Pinboard', path: 'content.card.json', viewer: 'card' }] };
  await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({ entities: [entity] }));
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  t.after(async () => { await service.close(); assert.equal(path.dirname(repo), path.resolve(os.tmpdir())); await rm(repo, { recursive: true, force: true }); });
  const request = (route, body, method, extra = {}) => fetch(`${service.origin}/api${route}`, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { Authorization: `Bearer ${service.token}`, Origin: service.origin, 'Content-Type': 'application/json', ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = async (route, body, method, extra) => (await request(route, body, method, extra)).json();
  return { repo, service, request, json, entity };
}

const until = async (test, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await test()) return true; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('Timed out waiting for the service.');
};

test('a pinboard card carries the feedback and the marked picture, and nothing else', () => {
  const card = validateCard(pinboard());
  assert.equal(card.template, 'pinboard');
  assert.equal(card.items[1].feedback, 'Looser folds here.');
  // The words the user wrote are part of what an agent reads.
  assert.match(cardText(card), /Looser folds here\./);
  assert.throws(() => validateCard({ ...pinboard(), items: [{ ...pinboard().items[0], feedback: 'x'.repeat(4001) }] }));
  assert.throws(() => validateCard({ ...pinboard(), items: [{ ...pinboard().items[0], annotation: '../escape.png' }] }));
  assert.throws(() => validateCard({ ...pinboard(), items: [{ ...pinboard().items[0], annotation: 'https://remote.example/x.png' }] }));
  assert.doesNotThrow(() => validateCard({ ...pinboard(), items: [{ ...pinboard().items[0], annotation: 'media/first-marked.png' }] }));
});

test('one click stores one choice, and an agent pulls it', async t => {
  const { service, json } = await fixture(t);
  assert.deepEqual(await json('/workspace/selection'), { selection: null });
  const chosen = await json('/workspace/selection', { entityId: 'lab', step: 0, entryId: 'first' });
  const { selection } = chosen;
  assert.equal(selection.boardId, 'lab'); assert.equal(selection.entryId, 'first'); assert.equal(selection.step, 0);
  assert.equal(selection.fileName, 'silk.png');
  // The picture is on disk, and the pointer the agent pulls says where.
  assert.ok(selection.picture.endsWith(path.join('workspace', 'lab', 'media', 'silk.png')));
  assert.equal(selection.feedback, ''); assert.equal(selection.notes, 'The dark one.');
  // The same choice, read back, is the same choice.
  assert.equal((await json('/workspace/selection')).selection.entryId, 'first');
  // The coordinator pulls the full entry, not a stale copy of it.
  const pulled = await service.coordinator.execute('current_selection', {});
  assert.equal(pulled.entryId, 'first'); assert.equal(pulled.boardTitle, 'Arachne Character Lab');
  assert.equal(pulled.cardTitle, 'Character lab');
  // Clearing is explicit and empty afterwards.
  assert.deepEqual(await json('/workspace/selection/clear', {}), { selection: null });
  assert.equal(await service.coordinator.execute('current_selection', {}), null);
});

test('a choice that names nothing on the board is refused', async t => {
  const { request, json } = await fixture(t);
  // An entry that is not on this board.
  assert.equal((await request('/workspace/selection', { entityId: 'lab', step: 0, entryId: 'missing' })).status, 400);
  // A board that is not there at all.
  assert.equal((await request('/workspace/selection', { entityId: 'missing', step: 0, entryId: 'first' })).status, 404);
  // A tab that is not there.
  assert.equal((await request('/workspace/selection', { entityId: 'lab', step: 9, entryId: 'first' })).status, 404);
  // A choice without an entry.
  assert.equal((await request('/workspace/selection', { entityId: 'lab', step: 0 })).status, 400);
  assert.equal((await request('/workspace/selection', { entityId: 'lab', step: 0, entryId: 'first' }, 'POST', { Authorization: '' })).status, 401);
  // A refused choice leaves nothing behind.
  assert.deepEqual(await json('/workspace/selection'), { selection: null });
});

test('the choice belongs to one board and is dropped when another is opened', async t => {
  const { service, json } = await fixture(t);
  await json('/workspace/selection', { entityId: 'lab', step: 0, entryId: 'first' });
  const ws = new WebSocket(service.origin.replace('http:', 'ws:') + '/events', { origin: service.origin });
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  t.after(() => ws.close());
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type: 'auth', token: service.token, surface: 'workspace' }));
  await until(() => messages.some(message => message.type === 'connected'));
  const send = async message => {
    const before = messages.filter(item => item.type === 'pong').length;
    ws.send(JSON.stringify(message)); ws.send(JSON.stringify({ type: 'ping' }));
    await until(() => messages.filter(item => item.type === 'pong').length > before);
  };
  // The window tells the service which board it is showing.
  await send({ type: 'workspace-route', route: '#/lab/0' });
  assert.equal((await json('/workspace/selection')).selection.entryId, 'first');
  // Opening a different board drops the choice, so an agent never pulls a
  // pointer for something the user has walked away from.
  await send({ type: 'workspace-route', route: '#/other/0' });
  await until(async () => (await json('/workspace/selection')).selection === null);
  assert.deepEqual(await json('/workspace/selection'), { selection: null });
});

test('the board remembers its chat and the hand-off carries the picture, the marks and the words', async t => {
  const { repo, entity } = await fixture(t);
  const registry = { entities: [entity] };
  const sent = [];
  const chats = new Map();
  const sessions = {
    get: id => { if (!chats.has(id)) throw Object.assign(new Error('Chat no longer exists'), { status: 404 }); return chats.get(id); },
    resume: async id => chats.get(id),
    create: async options => { const session = { id: `chat-${chats.size + 1}`, agent: options.agent, name: options.name, cwd: options.cwd }; chats.set(session.id, session); return session; },
    input: (id, text, options) => { sent.push({ id, text, options }); },
  };
  const cards = {
    workspace: { registry: async () => registry },
    resolve: async (id, step) => ({ entity: registry.entities.find(item => item.id === id), file: path.join(repo, 'workspace/lab/content.card.json'), root: path.join(repo, 'workspace/lab') }),
    registryChange: async update => { update(registry); await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify(registry)); },
  };
  const agents = new BoardAgents({ repo, cards, sessions, settings: () => ({ defaultAgent: 'codex' }) });
  await writeFile(path.join(repo, 'workspace/lab/content.card.json'), JSON.stringify({ ...pinboard(), items: [{ ...pinboard().items[1], annotation: 'media/second-marked.png' }] }));
  const result = await agents.send({ entityId: 'lab', step: 0, entryId: 'second' });
  assert.equal(result.sessionId, 'chat-1');
  // The board remembers the chat it opened.
  assert.equal(registry.entities[0].agent.chatId, 'chat-1');
  assert.equal(registry.entities[0].agent.agent, 'codex');
  // The message carries the picture, the marked picture, the notes and the words.
  assert.match(result.message, /Picture: .*media[\\/]paper\.png/);
  assert.match(result.message, /Marked picture: .*media[\\/]second-marked\.png/);
  assert.match(result.message, /Looser folds here\./);
  assert.match(result.message, /The pale one\./);
  assert.equal(sent.length, 1); assert.equal(sent[0].id, 'chat-1'); assert.equal(sent[0].options.submit, true);
  // A second hand-off goes to the same chat; the board keeps one conversation.
  await agents.send({ entityId: 'lab', step: 0, entryId: 'second' });
  assert.equal(chats.size, 1); assert.equal(sent.length, 2);
  // The binding is on the board's own record, so it travels with the board.
  const written = JSON.parse(await readFile(path.join(repo, 'workspace/workspace.json'), 'utf8'));
  assert.equal(written.entities[0].agent.chatId, 'chat-1');
});

test('the selection store holds one choice and forgets it on request', async t => {
  const { repo } = await fixture(t);
  const file = path.join(repo, 'workspace/lab/content.card.json');
  const cards = { resolve: async (id, step) => ({ entity: { title: 'Arachne Character Lab' }, file, root: path.join(repo, 'workspace/lab') }) };
  const changes = [];
  const selection = new Selection({ cards, changed: value => changes.push(value) });
  assert.equal(selection.state(), null); assert.equal(selection.brief(), null);
  await selection.choose('lab', 0, 'first');
  assert.equal(selection.state().entryId, 'first');
  assert.deepEqual(selection.brief(), { boardId: 'lab', boardTitle: 'Arachne Character Lab', step: 0, entryId: 'first', title: 'Silk study', fileName: 'silk.png' });
  assert.equal(changes.length, 1); assert.equal(changes[0].entryId, 'first');
  // A second click replaces the choice; there is only ever one.
  await selection.choose('lab', 0, 'second');
  assert.equal(selection.state().entryId, 'second');
  assert.equal((await selection.resolve()).feedback, 'Looser folds here.');
  assert.equal(selection.clear(), null); assert.equal(selection.state(), null);
  assert.equal(changes.at(-1), null);
});
