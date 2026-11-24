import test from 'node:test';
import assert from 'node:assert/strict';
import { readingVoices } from '../../../src/mobile/readingVoices.ts';
import { ToxicReadAloud, toxicVoice } from '../toxic-read-aloud.mjs';

// Project KO no longer runs a speech model of its own: the voice belongs to
// Toxic, and this adapter keeps the queue, the cache and the cancel rules.

const health = { running: true, stt: 'ready', tts: 'ready', version: '1.2.0' };

function fake({ speak: answer, ...overrides } = {}) {
  const spoken = [];
  const client = {
    spoken,
    health: async () => health,
    async speak(text, speed) {
      spoken.push({ text, speed });
      return answer ? answer(text, speed) : Buffer.from('RIFF' + text);
    },
    ...overrides,
  };
  return { speech: new ToxicReadAloud({ client }), client };
}

const speak = (speech, text, signal) => speech.synthesize('desktop', { voice: 'toxic', text }, signal);
const until = async (check, label) => { for (let index = 0; index < 200 && !check(); index += 1) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(check(), label); };

test('the one voice is Toxic, and a stopped app reads as unavailable', async () => {
  assert.deepEqual(readingVoices, [{ id: 'toxic', label: 'Toxic' }]);
  assert.deepEqual(toxicVoice, { id: 'toxic', label: 'Toxic' });
  const stopped = new ToxicReadAloud({ client: { health: async () => null } });
  const status = await stopped.status();
  assert.equal(status.engine, 'toxic');
  assert.equal(status.ready, false);
  assert.equal(status.available, false);
  assert.equal(status.voice, 'toxic');
  assert.deepEqual(status.voices, [toxicVoice]);
  stopped.close();
  const ready = await fake().speech.status();
  assert.equal(ready.ready, true);
  assert.equal(ready.available, true);
  assert.equal(ready.label, 'Toxic');
});

test('strict synthesis inputs, and a failed engine fails only that segment', async () => {
  const { speech } = fake({ speak: async () => { throw Object.assign(new Error('Toxic returned no audio.'), { status: 502 }); } });
  await assert.rejects(speak(speech, '   '), error => error.status === 400);
  await assert.rejects(speak(speech, 'x'.repeat(8001)), error => error.status === 400);
  await assert.rejects(speak(speech, 'hello'), error => error.status === 502);
  speech.close();
});

test('an engine that answers with silence says what to do about it', async () => {
  const { speech } = fake({ speak: async () => { throw Object.assign(new Error('The engine returned no audio'), { status: 502 }); } });
  await assert.rejects(speak(speech, 'hello'), error => {
    assert.equal(error.status, 502);
    assert.match(error.message, /Restart engines/);
    return true;
  });
  speech.close();
  // Any other failure keeps its own words.
  const other = fake({ speak: async () => { throw Object.assign(new Error('Toxic is not running.'), { status: 503 }); } });
  await assert.rejects(speak(other.speech, 'hello'), error => {
    assert.equal(error.message, 'Toxic is not running.');
    return true;
  });
  other.speech.close();
});

test('segments are spoken one at a time, in order, and the same words are reused', async () => {
  let live = 0, most = 0;
  const { speech, client } = fake({
    speak: async (text, speed) => {
      live += 1; most = Math.max(most, live);
      await new Promise(resolve => setTimeout(resolve, 10));
      live -= 1;
      return Buffer.from('RIFF' + text);
    },
  });
  const first = speak(speech, 'One sentence.');
  const second = speak(speech, 'Another sentence.');
  assert.equal(Buffer.from(await first).toString(), 'RIFFOne sentence.');
  assert.equal(Buffer.from(await second).toString(), 'RIFFAnother sentence.');
  assert.equal(most, 1, 'Toxic synthesizes one segment at a time');
  assert.deepEqual(client.spoken.map(item => item.text), ['One sentence.', 'Another sentence.']);
  assert.equal(client.spoken[0].speed, 1, 'Project KO applies its own playback speed');

  const again = await speak(speech, 'One sentence.');
  assert.equal(Buffer.from(again).toString(), 'RIFFOne sentence.');
  assert.equal(client.spoken.length, 2, 'the same words need no new request');
  speech.close();
});

test('a stopped player gives up its place in line', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { speech, client } = fake({ speak: async text => { await gate; return Buffer.from('RIFF' + text); } });
  const playing = speak(speech, 'First.');
  await until(() => client.spoken.length === 1, 'the first segment is in flight');
  const controller = new AbortController();
  const abandoned = speak(speech, 'Second.', controller.signal);
  controller.abort();
  await assert.rejects(abandoned, error => error.status === 499);
  release();
  await playing;
  assert.deepEqual(client.spoken.map(item => item.text), ['First.'], 'the abandoned segment was never sent');
  speech.close();
});

test('revoking a phone leaves the desktop segment alone', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { speech } = fake({ speak: async text => { await gate; return Buffer.from('RIFF' + text); } });
  const desktop = speak(speech, 'Desktop.');
  await until(() => speech.running !== null, 'the desktop segment is in flight');
  const phone = speech.synthesize('phone', { voice: 'toxic', text: 'Phone.' });
  await until(() => speech.queue.length > 0, 'the phone segment is waiting in line');
  const rejected = assert.rejects(phone, error => error.status === 499);
  speech.revoke('phone');
  await rejected;
  release();
  assert.equal(Buffer.from(await desktop).toString(), 'RIFFDesktop.');
  speech.close();
});
