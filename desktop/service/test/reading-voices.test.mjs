import test from 'node:test';
import assert from 'node:assert/strict';
import { readingVoices } from '../../../src/mobile/readingVoices.ts';
import { LocalReadAloud, readAloudRoot } from '../local-read-aloud.mjs';

// The engine is a folder under the user's local app data, not a dependency of
// the app, so "missing" is the normal first state and must read as an offer.
const missing = root => new LocalReadAloud({ LOCALAPPDATA: root });

test('one voice, and the folder it comes from', async () => {
  assert.deepEqual(readingVoices, [{ id: 'chatterbox', label: 'Chatterbox · this machine' }]);
  const empty = missing('V:\\nothing-here');
  assert.equal(await empty.installed(), false);
  const status = await empty.status();
  assert.equal(status.ready, false);
  assert.equal(status.installing, false);
  assert.equal(status.engine, 'chatterbox');
});

test('strict synthesis inputs, and a chat with no engine says so', async () => {
  const speech = missing('V:\\nothing-here');
  await assert.rejects(speech.synthesize('phone', { voice: 'chatterbox', text: '   ' }), error => error.status === 400);
  await assert.rejects(speech.synthesize('phone', { voice: 'chatterbox', text: 'x'.repeat(2001) }), error => error.status === 400);
  await assert.rejects(speech.synthesize('phone', { voice: 'chatterbox', text: 'hello' }), error => error.status === 503);
  speech.close();
});

test('the install lives where the app says it does', () => {
  assert.equal(readAloudRoot({ LOCALAPPDATA: 'V:\\l' }), 'V:\\l\\ProjectKO\\voice\\chatterbox');
});
