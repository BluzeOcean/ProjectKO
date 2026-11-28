import assert from 'node:assert/strict';
import test from 'node:test';
import { isPeak, messagesFrom, priceUsage, processFrom, thinkingPreview, toolCategory, toolDetail, usageFrom } from '../dsh.mjs';

// The harness reports inputTokens as the uncached part of the prompt and puts
// cache reads beside it, so the two are priced apart.
const usage = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 9000, cacheWriteTokens: 0, totalTokens: 10500 };

test('a cached prompt is priced at the cache rate, not the miss rate', () => {
  // Off-peak, per million: hit ¥0.02, miss ¥1, output ¥4.
  // (9000 × 0.02 + 1000 × 1 + 500 × 4) / 1e6 = 0.00318
  assert.equal(Number(priceUsage(usage, 'deepseek-v4-flash', new Date('2026-11-21T20:00:00Z')).toFixed(6)), 0.00318);
});

test('peak doubles the price', () => {
  const off = priceUsage(usage, 'deepseek-v4-flash', new Date('2026-11-21T20:00:00Z'));
  const peak = priceUsage(usage, 'deepseek-v4-flash', new Date('2026-11-23T02:00:00Z'));
  assert.equal(Number((peak / off).toFixed(3)), 2);
});

test('peak is weekdays 01-04 and 06-10 UTC, and never at the weekend', () => {
  assert.equal(isPeak(new Date('2026-11-23T02:30:00Z')), true, 'Monday 02:30 UTC');
  assert.equal(isPeak(new Date('2026-11-23T05:30:00Z')), false, 'between the windows');
  assert.equal(isPeak(new Date('2026-11-23T08:00:00Z')), true, 'Monday 08:00 UTC');
  assert.equal(isPeak(new Date('2026-11-21T02:30:00Z')), false, 'Saturday, all day off-peak');
  assert.equal(isPeak(new Date('2026-11-22T08:00:00Z')), false, 'Sunday, all day off-peak');
});

const at = '2026-11-21T20:00:00.000Z';

test('the log becomes the four facts and the ring', () => {
  const records = [
    { at, event: { type: 'query', data: { text: 'hello' } } },
    { at, event: { type: 'turn/start', data: { turn: 1 } } },
    { at, event: { type: 'request/context', data: { provider: 'deepseek-official', model: 'deepseek-v4-flash', contextWindow: 1000000 } } },
    { at, event: { type: 'assistant/message', data: { usage, message: { content: [{ type: 'text', text: 'hi' }] } } } },
    { at, event: { type: 'step/end', data: { turn: 1, step: 1 } } },
    { at, event: { type: 'turn/end', data: { turn: 1, reason: 'completed' } } },
  ];
  const value = usageFrom(records);
  assert.equal(value.turns, 1);
  assert.equal(value.steps, 1);
  assert.equal(value.tokens, 10500);
  assert.equal(value.model, 'deepseek-v4-flash');
  assert.equal(value.limit, 1000000);
  // The window's occupancy is the whole prompt: fresh input plus the cache read.
  assert.equal(value.contextUsed, 10000);
  assert.equal(value.contextPercent, 1);
  assert.equal(value.cacheHit, 90);
  assert.equal(Number(value.cost.toFixed(6)), 0.00318);
});

test('a chat with no request yet has no window, and says so', () => {
  const value = usageFrom([{ at, event: { type: 'query', data: { text: 'hello' } } }]);
  assert.equal(value.limit, null);
  assert.equal(value.contextPercent, null);
  assert.equal(value.tokens, 0);
  assert.equal(value.cost, 0);
});

test('the log becomes a conversation, tool calls included', () => {
  const records = [
    { at, event: { type: 'query', data: { text: 'why is the footer clipped?' } } },
    { at, event: { type: 'tool/call', data: { callId: 'c1', name: 'run_code', arguments: '{}' } } },
    { at, event: { type: 'tool/result', data: { message: { toolCallId: 'c1', isError: false, content: [] } } } },
    { at, event: { type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'hmm' }, { type: 'text', text: 'The empty state keeps its height.' }] } } } },
  ];
  const { messages, activity } = messagesFrom(records);
  assert.deepEqual(messages.map(item => item.role), ['user', 'assistant']);
  assert.equal(messages[1].text, 'The empty state keeps its height.');
  assert.deepEqual(activity.map(item => [item.name, item.status]), [['run_code', 'completed']]);
});

test('a failed tool is reported as failed', () => {
  const { activity } = messagesFrom([
    { at, event: { type: 'tool/call', data: { callId: 'c2', name: 'run_code' } } },
    { at, event: { type: 'tool/result', data: { message: { toolCallId: 'c2', isError: true, content: [] } } } },
  ]);
  assert.equal(activity[0].status, 'failed');
});

// ── The work behind the answer ───────────────────────────────────────────────

// The harness's own shapes, taken from a real log: a turn opens, a step opens,
// the model thinks, tools fire and answer.
const turn = [
  { at, event: { type: 'turn/start', data: { turn: 1 } } },
  { at, event: { type: 'step/start', data: { turn: 1, step: 1 } } },
  { at, event: { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [
    { type: 'reasoning', text: 'The user says pre-warm. Let me read the module docs first.' },
    { type: 'text', text: 'Reading now.' },
  ] } } } },
  { at, event: { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"file_path":"V:/modules/rules.md"}' } } },
  { at, event: { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c2', name: 'pwsh', arguments: '{"command":"Get-ChildItem V:/Vault"}' } } },
  { at, event: { type: 'tool/result', data: { turn: 1, step: 1, message: { toolCallId: 'c1', isError: false, content: [] } } } },
  { at, event: { type: 'step/end', data: { turn: 1, step: 1 } } },
];

test('the thinking is kept, not thrown away with the text blocks', () => {
  const { turns } = processFrom(turn);
  const thinking = turns[0].rows.filter(row => row.kind === 'reasoning');
  assert.equal(thinking.length, 1);
  assert.equal(thinking[0].text, 'The user says pre-warm. Let me read the module docs first.');
  // The reply is the chat's business; the process carries the work.
  assert.equal(turns[0].rows.some(row => row.kind === 'reasoning' && row.text.includes('Reading now')), false);
});

test("a tool's arguments become the one line that says what it did", () => {
  const { turns } = processFrom(turn);
  const read = turns[0].rows.find(row => row.name === 'read');
  assert.equal(read.detail, 'V:/modules/rules.md');
  assert.equal(read.category, 'read');
  const shell = turns[0].rows.find(row => row.name === 'pwsh');
  assert.equal(shell.detail, 'Get-ChildItem V:/Vault');
  assert.equal(shell.category, 'commands');
});

test('a tool that answered is done, and one that failed says so', () => {
  const { turns } = processFrom([...turn, { at, event: { type: 'tool/call', data: { callId: 'c3', name: 'write', arguments: '{}' } } },
    { at, event: { type: 'tool/result', data: { message: { toolCallId: 'c3', isError: true, content: [] } } } }]);
  const rows = turns[0].rows;
  assert.equal(rows.find(row => row.id === 'c1').status, 'completed');
  assert.equal(rows.find(row => row.id === 'c3').status, 'failed');
  // The one still running is the one the harness is waiting on.
  assert.equal(rows.find(row => row.id === 'c2').status, 'running');
});

test('the summary counts the tools by category, in the harness\'s words', () => {
  const { turns } = processFrom(turn);
  assert.deepEqual(turns[0].counts, [{ category: 'read', count: 1 }, { category: 'commands', count: 1 }]);
  assert.deepEqual(turns[0].rows.filter(row => row.kind === 'tool').map(row => row.category), ['read', 'commands']);
});

test('the busiest category comes first, as the harness orders them', () => {
  const records = [{ at, event: { type: 'turn/start', data: { turn: 1 } } }];
  for (const [index, name] of ['read', 'read', 'read', 'pwsh', 'pwsh', 'grep'].entries()) {
    records.push({ at, event: { type: 'tool/call', data: { turn: 1, callId: `c${index}`, name, arguments: '{}' } } });
  }
  const { turns } = processFrom(records);
  assert.deepEqual(turns[0].counts, [{ category: 'read', count: 3 }, { category: 'commands', count: 2 }, { category: 'search', count: 1 }]);
});

test('the last line says what is happening now', () => {
  // A tool in flight: its category and the one line that says what it is doing.
  const busy = processFrom(turn).turns[0];
  assert.equal(busy.now, 'commands — Get-ChildItem V:/Vault');
  assert.equal(busy.running, 'commands');
  // With no tool in flight the model is the one working, and the last thing it
  // thought is the closest thing to a live detail the SDK profile carries.
  const thinking = processFrom(turn.slice(0, 3)).turns[0];
  assert.equal(thinking.now, 'thinking — The user says pre-warm. Let me read the module docs first.');
  assert.equal(thinking.running, null);
  // And when the turn is over, there is nothing to say.
  const over = processFrom([...turn, { at, event: { type: 'turn/end', data: { turn: 1, reason: 'completed' } } }]);
  assert.equal(over.turns[0].now, '');
  assert.equal(over.turns[0].status, 'done');
});

test('the thinking is not cut short', () => {
  const long = 'x'.repeat(90000);
  const { turns } = processFrom([
    { at, event: { type: 'turn/start', data: { turn: 1 } } },
    { at, event: { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'reasoning', text: long }] } } } },
  ]);
  assert.equal(turns[0].rows[0].text.length, 90000, 'the thinking travels whole');
});

test('the thinking folds to one line of what it was about', () => {
  assert.equal(thinkingPreview('First thought.\n\nThe last thought, in one line.'), 'The last thought, in one line.');
  assert.equal(thinkingPreview('Only one paragraph.'), 'Only one paragraph.');
  assert.equal(thinkingPreview('**bold** stays plain'), 'bold stays plain');
  assert.equal(thinkingPreview(''), '');
});

test('a turn that ended is done, and the next turn is the one that counts', () => {
  const { turns } = processFrom([...turn, { at, event: { type: 'turn/end', data: { turn: 1, reason: 'completed' } } },
    { at, event: { type: 'turn/start', data: { turn: 2 } } }]);
  assert.equal(turns.length, 2);
  // The newest turn comes first: the panel shows the one that is happening.
  assert.equal(turns[0].turn, 2);
  assert.equal(turns[0].status, 'working');
  assert.equal(turns[1].status, 'done');
});

test('the process travels bounded: two turns, thirty tools, and the thinking whole', () => {
  const many = [];
  for (let turnNumber = 1; turnNumber <= 4; turnNumber += 1) {
    many.push({ at, event: { type: 'turn/start', data: { turn: turnNumber } } });
    many.push({ at, event: { type: 'assistant/message', data: { turn: turnNumber, message: { content: [{ type: 'reasoning', text: 'x'.repeat(9000) }] } } } });
    for (let call = 0; call < 40; call += 1) many.push({ at, event: { type: 'tool/call', data: { turn: turnNumber, callId: `t${turnNumber}-${call}`, name: 'read', arguments: '{}' } } });
  }
  const { turns } = processFrom(many);
  assert.equal(turns.length, 2, 'only the last two turns travel');
  assert.equal(turns[0].turn, 4, 'the newest turn comes first');
  const tools = turns[0].rows.filter(row => row.kind === 'tool');
  assert.equal(tools.length, 30, 'thirty tools a turn');
  // A burst of tools never pushes the thinking out of the panel.
  const thinking = turns[0].rows.filter(row => row.kind === 'reasoning');
  assert.equal(thinking.length, 1);
  assert.equal(thinking[0].text.length, 9000, 'the thinking is not cut short');
});

test('a tool the harness does not know is still a tool', () => {
  assert.equal(toolCategory('read'), 'read');
  assert.equal(toolCategory('grep'), 'search');
  assert.equal(toolCategory('glob'), 'search');
  assert.equal(toolCategory('apply_patch'), 'edit');
  assert.equal(toolCategory('exec_command'), 'commands');
  assert.equal(toolCategory('run_code'), 'code');
  assert.equal(toolCategory('todo_write'), 'plan');
  assert.equal(toolCategory('subagent_fork'), 'subagents');
  assert.equal(toolCategory('fs_inspect'), 'search');
  assert.equal(toolCategory('mystery'), 'tools');
});

test('a tool with nothing worth saying says nothing', () => {
  assert.equal(toolDetail('{}'), '');
  assert.equal(toolDetail('not json'), '');
  assert.equal(toolDetail('{"count":3}'), '');
  assert.equal(toolDetail('{"pattern":"**/*"}'), '**/*');
  assert.equal(toolDetail('{"query":"the footer"}'), 'the footer');
});
