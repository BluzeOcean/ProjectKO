import test from 'node:test';
import assert from 'node:assert/strict';
import { runSpeech, speechChunks, wavSeconds } from '../../../src/mobile/speechPipeline.ts';

// A WAV of known length, shaped like the one the engine writes.
function wav(seconds) {
  const rate = 24000, frames = Math.round(rate * seconds), data = Buffer.alloc(44 + frames * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + frames * 2, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(frames * 2, 40);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

test('a reply is cut at sentences, starting short and growing', () => {
  const text = ('The first thing to say is short. ' + 'A sentence long enough to matter, with a comma in it. '.repeat(9)).trim();
  const parts = speechChunks(text);
  assert.equal(parts.join(' '), text, 'no words are lost between segments');
  assert.ok(parts[0].length <= 130, 'the first segment is short so that sound starts sooner');
  assert.ok(parts.every(part => part.length <= 352), 'no segment is too long to generate in one go');
  assert.ok(parts.length > 3);
});

test('the length of a spoken segment is read from its header', () => {
  assert.equal(wavSeconds(wav(3)), 3);
  assert.equal(wavSeconds(new ArrayBuffer(12)), 8, 'anything else is assumed to be a short segment');
});

// The reason the voice stopped between sentences: the player asked for the next
// segment only when the current one ended, so the generation time was silence.
// The queue is now measured in seconds of audio and filled ahead of the speaker.
test('the queue is filled ahead of the speaker, in seconds of audio', async () => {
  const asked = [], gates = [];
  let live = 0, most = 0, done = false;
  const speech = runSpeech({
    segments: Array.from({ length: 8 }, (_, index) => `Segment ${index}.`),
    target: 30,
    speak: async () => { asked.push(1); live += 1; most = Math.max(most, live); await tick(); live -= 1; return wav(10); },
    play: () => new Promise(resolve => { gates.push(resolve); }),
    cancelled: () => false,
  });
  speech.done.then(() => { done = true; });
  await tick(5);
  assert.equal(asked.length, 4, 'three segments of ten seconds are not enough to reach thirty');
  assert.ok(gates.length <= 1, 'only one segment plays at a time');
  gates.shift()();
  await tick(5);
  assert.equal(asked.length, 4, 'the queue is full at thirty seconds, so nothing more is asked');
  gates.shift()();
  await tick(5);
  assert.equal(asked.length, 5, 'the queue refills as soon as a player takes a segment');
  assert.ok(most <= 6, 'never more than the limit in flight');
  for (let index = 0; index < 40 && !done; index++) { await tick(2); if (gates.length) gates.shift()(); }
  assert.equal(done, true);
  assert.equal(asked.length, 8, 'every segment was spoken exactly once');
});

test('a bigger target asks for more before the first segment plays', async () => {
  const asked = [], gates = [];
  const speech = runSpeech({
    segments: Array.from({ length: 8 }, (_, index) => `Segment ${index}.`),
    target: 48,
    maxInFlight: 8,
    speak: async () => { asked.push(1); await tick(); return wav(10); },
    play: () => new Promise(resolve => { gates.push(resolve); }),
    cancelled: () => false,
  });
  await tick(5);
  assert.equal(asked.length, 6, 'six segments of ten seconds are asked for before the first plays');
  speech.stop();
  for (const gate of gates) gate();
  await speech.done;
});

test('stopping aborts what is in flight and ends the run', async () => {
  const signals = [];
  const speech = runSpeech({
    segments: ['One.', 'Two.', 'Three.'],
    speak: (text, signal) => { signals.push(signal); return new Promise(() => {}); },
    play: async () => {},
    cancelled: () => false,
  });
  await tick(5);
  assert.equal(signals.length, 3);
  speech.stop();
  await speech.done;
  assert.equal(signals.every(signal => signal.aborted), true);
});

test('a failed segment fails the reading instead of hanging', async () => {
  const speech = runSpeech({
    segments: ['One.', 'Two.'],
    speak: async () => { throw new Error('Speech generation failed.'); },
    play: async () => {},
    cancelled: () => false,
  });
  await assert.rejects(speech.done, /Speech generation failed/);
});
