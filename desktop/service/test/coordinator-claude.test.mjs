import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ClaudeEngine, openToolServer } from '../coordinator-claude.mjs';

const tools = [
  { type: 'function', name: 'list_chats', description: 'List open terminal chats.', inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { type: 'function', name: 'read_chat', description: 'Read the current terminal screen.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
];

/** The server answers in SSE, the way an MCP client reads it. */
async function readResponse(response) {
  const text = await response.text();
  const data = text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
  return data ? JSON.parse(data) : null;
}

/** A tool server on a loopback port, reached the way Claude Code reaches it. */
async function toolServer(execute) {
  const token = randomUUID();
  const server = await openToolServer({ tools, execute, token });
  const call = async body => {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
    });
    return { status: response.status, session: response.headers.get('mcp-session-id'), value: await readResponse(response) };
  };
  const initialize = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
  const session = initialize.session;
  const send = (body, id) => fetch(server.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Mcp-Session-Id': session },
    body: JSON.stringify({ jsonrpc: '2.0', id, ...body }),
  }).then(readResponse);
  return { server, session, send, token, url: server.url };
}

test('the tool server lists only the coordinator tools and runs them through the service', async () => {
  const calls = [];
  const { server, send, session } = await toolServer(async (name, args) => {
    calls.push({ name, args });
    if (name === 'read_chat') throw new Error('This chat uses bypass permissions.');
    return { id: 'chat-1', name: 'Animation Review' };
  });
  try {
    assert.ok(session, 'the server issues a session id');
    const listed = await send({ method: 'tools/list' }, 2);
    assert.deepEqual(listed.result.tools.map(tool => tool.name), ['list_chats', 'read_chat']);
    assert.equal(listed.result.tools[0].type, undefined, 'MCP tools carry no function type');
    const called = await send({ method: 'tools/call', params: { name: 'list_chats', arguments: { query: 'x' } } }, 3);
    assert.equal(called.result.isError, undefined);
    assert.match(called.result.content[0].text, /chat-1/);
    assert.deepEqual(calls, [{ name: 'list_chats', args: { query: 'x' } }]);
    const refused = await send({ method: 'tools/call', params: { name: 'read_chat', arguments: { id: 'chat-1' } } }, 4);
    assert.equal(refused.result.isError, true);
    assert.match(refused.result.content[0].text, /bypass permissions/);
    const unknown = await send({ method: 'tools/call', params: { name: 'run_shell', arguments: {} } }, 5);
    assert.equal(unknown.result.isError, true);
    assert.match(unknown.result.content[0].text, /Unknown coordinator tool/);
  } finally { server.close(); }
});

test('the tool server refuses a caller without its token', async () => {
  const { server, url } = await toolServer(async () => 'ok');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(response.status, 401);
  } finally { server.close(); }
});

test('the first turn is written without waiting for the session to announce itself', async () => {
  const engine = new ClaudeEngine({ repo: '.', tools, execute: async () => null, instructions: '' });
  const written = [];
  // Claude Code finishes starting only once it has a message, so a turn that
  // waits for the opening event would wait for a turn that never began.
  engine.child = {
    stdin: { write: line => { written.push(line); engine.event(JSON.stringify({ type: 'result', subtype: 'success', result: 'Answer.' })); } },
    kill() {},
  };
  const answer = await engine.ask({ prompt: 'Hello there', images: [], operationId: 'one' });
  assert.equal(answer, 'Answer.');
  assert.equal(written.length, 1);
  assert.match(written[0], /"Hello there"/);
  assert.match(written[0], /"type":"user"/);
});

test('a turn ends on the result event, and a failed turn reports why', async () => {
  const engine = new ClaudeEngine({ repo: '.', tools, execute: async () => null, instructions: 'Be brief.' });
  const settled = [];
  engine.turn = { resolve: value => settled.push({ ok: value }), reject: error => settled.push({ error: error.message }) };
  engine.event(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Two boards are open.' }] } }));
  engine.event(JSON.stringify({ type: 'result', subtype: 'success', result: 'Two boards are open.' }));
  assert.deepEqual(settled, [{ ok: 'Two boards are open.' }]);
  engine.turn = { resolve: value => settled.push({ ok: value }), reject: error => settled.push({ error: error.message }) };
  engine.event(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'The model could not answer.' }));
  assert.equal(settled[1].error, 'The model could not answer.');
});

test('the system prompt keeps the persona and stays inside what a command line can carry', async () => {
  const engine = new ClaudeEngine({ repo: '.', tools, execute: async () => null, instructions: 'You are Project KO.', orientation: async () => 'x'.repeat(60000) });
  const prompt = await engine.systemPrompt();
  assert.ok(prompt.startsWith('You are Project KO.'));
  assert.ok(prompt.length <= 24000, `prompt was ${prompt.length} characters`);
});

test('an image travels inline only when it is small enough and of a known type', async () => {
  const engine = new ClaudeEngine({ repo: '.', tools, execute: async () => null, instructions: '' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvWQAAAAASUVORK5CYII=', 'base64');
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const folder = await mkdtemp(path.join(os.tmpdir(), 'pko-image-'));
  const small = path.join(folder, 'small.png');
  await writeFile(small, png);
  const block = await engine.image(small);
  assert.equal(block.type, 'image');
  assert.equal(block.source.media_type, 'image/png');
  assert.equal(block.source.data, png.toString('base64'));
  const unknown = path.join(folder, 'note.txt');
  await writeFile(unknown, 'not an image');
  assert.equal(await engine.image(unknown), null);
  const huge = path.join(folder, 'huge.png');
  await writeFile(huge, Buffer.alloc(5 * 1024 * 1024));
  assert.equal(await engine.image(huge), null);
});
