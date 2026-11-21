import assert from 'node:assert/strict';
import test from 'node:test';
import { isPeak, messagesFrom, priceUsage, usageFrom } from '../dsh.mjs';

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
