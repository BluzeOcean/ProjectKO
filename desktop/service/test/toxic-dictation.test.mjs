import test from 'node:test';
import assert from 'node:assert/strict';
import { ToxicDictation } from '../toxic-dictation.mjs';

/**
 * A partner take, driven from Project KO's own terminal.
 *
 * Toxic's system-wide chord hook never fires for a key that goes to a Chromium
 * web view - the WebView2 host takes the keyboard as raw input, so no keyboard
 * message, and no low-level hook, is ever generated for it. The chord is
 * delivered to the page instead, so the terminal asks Toxic for the take.
 *
 * These checks are about the contract with Toxic: the microphone and the
 * recording stay in Toxic, and the transcript comes back to the app that
 * asked for it instead of being typed into whatever has the focus.
 */

const fake = () => {
  const client = {
    calls: [],
    async dictation(action, options) {
      client.calls.push({ action, options });
      if (action === 'start') return 'listening';
      if (action === 'stop') return 'the spoken words';
      if (action === 'cancel') return 'cancelled';
      return JSON.stringify({ listening: false, last: null });
    },
  };
  return client;
};

test('a take opens, and the words come back to the app that asked', async () => {
  const client = fake();
  const dictation = new ToxicDictation({ client });
  assert.deepEqual(await dictation.take({ hint: 'Press any key to finish' }), { listening: true });
  assert.deepEqual(await dictation.stop(), { transcript: 'the spoken words' });
  assert.deepEqual(client.calls.map(call => call.action), ['start', 'stop']);
  assert.equal(client.calls[0].options.hint, 'Press any key to finish');
});

test('a take that is thrown away says nothing', async () => {
  const client = fake();
  const dictation = new ToxicDictation({ client });
  await dictation.take();
  assert.deepEqual(await dictation.cancel(), { listening: false });
  assert.deepEqual(client.calls.map(call => call.action), ['start', 'cancel']);
});

test('the state is asked for, not guessed', async () => {
  const client = fake();
  const dictation = new ToxicDictation({ client });
  assert.deepEqual(await dictation.status(), { listening: false, last: null });
  assert.deepEqual(client.calls.map(call => call.action), ['status']);
});

test('an empty transcript is empty, not a word of noise', async () => {
  const dictation = new ToxicDictation({ client: { async dictation() { return '   '; } } });
  assert.deepEqual(await dictation.stop(), { transcript: '' });
});

test('a Toxic that refuses says so, and the refusal travels', async () => {
  const dictation = new ToxicDictation({
    client: { async dictation() { throw Object.assign(new Error('Toxic is not running.'), { status: 503 }); } },
  });
  await assert.rejects(() => dictation.take(), /Toxic is not running/);
});
