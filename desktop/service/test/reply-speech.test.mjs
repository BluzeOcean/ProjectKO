import test from 'node:test';
import assert from 'node:assert/strict';
import { lastReply, lastReplyIndex, speakingPlan, spokenMarkdown } from '../../../src/mobile/replySpeech.ts';

// The note before a tool call is not the reply: reading the work over again from
// the top is what the button used to do.
test('the reply is the answer, not the notes written on the way to it', () => {
  const messages = [
    { role: 'user', text: 'first question' },
    { role: 'assistant', text: 'An older answer.' },
    { role: 'user', text: 'commit it' },
    { role: 'assistant', text: 'Let me review the diff.' },
    { role: 'assistant', text: 'No credentials in the changes.' },
    { role: 'assistant', text: 'All checks pass. Committing.' },
    { role: 'assistant', text: 'Committed as abc123.' },
    { role: 'system', text: 'Background task finished' },
  ];
  assert.equal(lastReply(messages), 'Committed as abc123.', 'one answer, not four notes');
  assert.equal(lastReply([{ role: 'user', text: 'hello' }]), '', 'nothing has been said yet');
  assert.equal(lastReply([]), '');
});

// The reason the bar went missing: a notice the CLI appended after the reply was
// read as the last thing on the page, and the reply lost its button.
test('a notice after the reply does not hide the reply', () => {
  const messages = [
    { role: 'user', text: 'commit it' },
    { role: 'assistant', text: 'Committed as abc123.' },
    { role: 'system', text: 'Background task finished' },
  ];
  assert.equal(lastReplyIndex(messages, 0), 1);
  assert.equal(lastReplyIndex([{ role: 'user', text: 'hi' }, { role: 'assistant', text: '   ' }], 0), -1, 'an empty message is not a reply');
  assert.equal(lastReplyIndex([{ role: 'user', text: 'hi' }], 0), -1, 'the person spoke last');
});

// The same exclusions the page makes: code, tables and images are not read out.
test('markdown becomes what is worth hearing', () => {
  const text = [
    'Fixed the **pause** between [the replies](https://example.com/a?b=1).',
    '',
    '- the queue is filled ahead',
    '- `speed` scales it',
    '',
    '| column | value |',
    '| --- | --- |',
    '| a | 1 |',
    '',
    '## Steps',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '![screenshot](shot.png)',
    '',
    '> _Quietly_ done.',
  ].join('\n');
  const spoken = spokenMarkdown(text);
  assert.match(spoken, /Fixed the pause between the replies\./);
  assert.match(spoken, /the queue is filled ahead/);
  assert.match(spoken, /speed scales it/, 'an inline name is the noun the sentence is about');
  assert.match(spoken, /Quietly done\./);
  assert.doesNotMatch(spoken, /\*\*|\[|\]|https:|column|const x|screenshot|#|\|/, 'nothing is left to pronounce as punctuation: ' + spoken);
});
// The engine returns sound, not word timings, so each word's share of a segment
// is estimated: long words take longer, a full stop takes a breath.
test('every word gets a share of its segment, in reading order', () => {
  const plan = speakingPlan(['One two three.', 'Four, five']);
  assert.deepEqual(plan.map(part => part.start), [0, 3], 'the second segment starts at the fourth word');
  assert.deepEqual(plan.map(part => part.weights.length), [3, 2]);
  assert.ok(plan[0].weights[2] > plan[0].weights[0], 'a full stop holds the voice longer than a plain word');
  assert.ok(plan[1].weights[0] > plan[1].weights[1], 'a comma holds it longer than nothing');
  assert.equal(plan[0].total, plan[0].weights.reduce((sum, weight) => sum + weight, 0));
});
