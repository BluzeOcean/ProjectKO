import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readingVoices } from '../../../src/mobile/readingVoices.ts';
import { LocalReadAloud, builtinVoice, readAloudRoot } from '../local-read-aloud.mjs';

// The engine is a folder under the user's local app data, not a dependency of
// the app, so "missing" is the normal first state and must read as an offer.
const missing = root => new LocalReadAloud({ LOCALAPPDATA: root });
const folder = root => path.join(readAloudRoot({ LOCALAPPDATA: root }), 'voices');
const there = file => access(file).then(() => true, () => false);

// A ready engine, without needing five gigabytes of weights: the voice store is
// what these tests are about.
async function installed(root) {
  const speech = missing(root);
  await mkdir(path.join(readAloudRoot({ LOCALAPPDATA: root }), 'venv'), { recursive: true });
  await writeFile(path.join(readAloudRoot({ LOCALAPPDATA: root }), 'ready.json'), JSON.stringify({ engine: 'chatterbox' }));
  speech.python = process.execPath;
  return speech;
}

test('with no recording, the built-in voice is the only one', async () => {
  assert.deepEqual(readingVoices, [{ id: 'chatterbox', label: 'Chatterbox · this machine' }]);
  const empty = missing('V:\\nothing-here');
  assert.equal(await empty.installed(), false);
  const status = await empty.status();
  assert.equal(status.ready, false);
  assert.equal(status.installing, false);
  assert.equal(status.engine, 'chatterbox');
  assert.deepEqual(status.voices, [builtinVoice]);
  assert.equal(status.voice, 'builtin');
});

test('strict synthesis inputs, and a chat with no engine says so', async () => {
  const speech = missing('V:\\nothing-here');
  await assert.rejects(speech.synthesize('phone', { voice: 'chatterbox', text: '   ' }), error => error.status === 400);
  await assert.rejects(speech.synthesize('phone', { voice: 'chatterbox', text: 'x'.repeat(2001) }), error => error.status === 400);
  await assert.rejects(speech.synthesize('phone', { voice: 'chatterbox', text: 'hello' }), error => error.status === 503);
  speech.close();
});

// Two recordings are two voices: adding one must never stand on the other, and
// the first one added is the one that speaks until the owner says otherwise.
test('voices are added side by side and the oldest speaks first', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pko-voices-'));
  const speech = await installed(root);
  const marilyn = path.join(root, 'Marilyn Monroe voice.wav');
  const aiko = path.join(root, '3_female_actress_only.wav');
  await writeFile(marilyn, 'RIFF');
  await writeFile(aiko, 'RIFF');
  assert.equal((await speech.setVoice(marilyn)).id, 'marilyn-monroe');
  await new Promise(resolve => setTimeout(resolve, 5));
  const added = await speech.setVoice(aiko, 'Aiko');
  assert.equal(added.id, 'aiko');
  assert.equal(added.label, 'Aiko');
  const status = await speech.status();
  assert.deepEqual(status.voices.map(voice => voice.label), ['Marilyn Monroe', 'Aiko', 'Chatterbox · built-in voice']);
  assert.equal(status.voice, 'marilyn-monroe', 'the first recording is the default');
  assert.equal((await speech.resolveVoice('aiko')).file, path.join(folder(root), 'aiko.wav'));
  assert.equal((await speech.resolveVoice('chatterbox')).id, 'marilyn-monroe', 'the old id means the first voice');
  assert.equal((await speech.resolveVoice('gone')).id, 'marilyn-monroe', 'a removed voice falls back to the first');
  assert.equal((await speech.resolveVoice('builtin')).file, '');
  assert.equal((await speech.removeVoice('aiko')).removed, 'aiko');
  assert.equal(await there(path.join(folder(root), 'aiko.wav')), false);
  assert.deepEqual((await speech.status()).voices.map(voice => voice.id), ['marilyn-monroe', 'builtin']);
  speech.close();
});

// The first version kept one clip as voices/voice.wav. It is still a voice, so
// an upgrade renames it instead of losing it.
test('the single clip of the first version becomes a named voice', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pko-legacy-'));
  const speech = await installed(root);
  const voices = folder(root);
  await mkdir(voices, { recursive: true });
  await writeFile(path.join(voices, 'voice.wav'), 'RIFF');
  await writeFile(path.join(voices, 'voice.json'), JSON.stringify({ name: 'Marilyn Monroe', addedAt: '2026-11-22T01:20:00.000Z' }));
  await writeFile(path.join(voices, 'clip-used.wav'), 'RIFF');
  const status = await speech.status();
  assert.deepEqual(status.voices.map(voice => voice.label), ['Marilyn Monroe', 'Chatterbox · built-in voice']);
  assert.equal(status.voice, 'marilyn-monroe');
  assert.equal(await there(path.join(voices, 'voice.wav')), false, 'the old name is gone, not duplicated');
  assert.equal(await there(path.join(voices, 'clip-used.wav')), false, 'the working copy of a clip is not a voice');
  const info = JSON.parse(await readFile(path.join(voices, 'marilyn-monroe.json'), 'utf8'));
  assert.equal(info.addedAt, '2026-11-22T01:20:00.000Z', 'the voice keeps the day it was added');
  assert.deepEqual((await readdir(voices)).sort(), ['marilyn-monroe.json', 'marilyn-monroe.wav']);
  speech.close();
});

// The worker speaks one segment at a time. The app relies on that being a
// line rather than a refusal: it asks for the next sentence while the current
// one plays, which is what turns separate files into a continuous voice.
function fakeSpeech() {
  const speech = missing('V:\\nothing-here');
  speech.installed = async () => true;
  speech.start = () => {}; // no engine: the test answers for the worker
  const written = [];
  speech.child = { stdin: { write: line => written.push(JSON.parse(line)) } };
  return { speech, written };
}
const speak = (speech, text, signal) => speech.synthesize('desktop', { voice: 'chatterbox', text }, signal);
const wav = value => JSON.stringify({ audio: Buffer.from(value).toString('base64') });
// Preparing a segment reads the voice folder, so "handed to the worker" is a
// few milliseconds away rather than immediate; wait for it instead of guessing.
const until = async (check, label) => { for (let index = 0; index < 200 && !check(); index += 1) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(check(), label); };

test('segments wait their turn, and a spoken segment is remembered', async () => {
  const { speech, written } = fakeSpeech();
  const first = speak(speech, 'One sentence.');
  const second = speak(speech, 'Another sentence.');
  await until(() => written.length >= 1, 'the first segment is handed to the worker');
  assert.equal(written.length, 1, 'one segment at a time');
  assert.equal(written[0].text, 'One sentence.');
  speech.spoke(wav('first'));
  assert.equal(Buffer.from(await first).toString(), 'first');
  await until(() => written.length >= 2, 'the next segment follows immediately');
  speech.spoke(wav('second'));
  assert.equal(Buffer.from(await second).toString(), 'second');
  const again = await speak(speech, 'One sentence.');
  assert.equal(Buffer.from(again).toString(), 'first', 'the same words need no GPU');
  assert.equal(written.length, 2);
  speech.close();
});

test('a stopped player gives up its place in line', async () => {
  const { speech, written } = fakeSpeech();
  const playing = speak(speech, 'First.');
  await until(() => written.length >= 1, 'the first segment is handed to the worker');
  const controller = new AbortController();
  const abandoned = speak(speech, 'Second.', controller.signal);
  controller.abort();
  await assert.rejects(abandoned, error => error.status === 499);
  speech.spoke(wav('first'));
  await playing;
  assert.equal(written.length, 1, 'the abandoned segment was never generated');
  speech.close();
});

test('a worker that dies fails the line, not just the current segment', async () => {
  const { speech, written } = fakeSpeech();
  const playing = speak(speech, 'First.');
  const waiting = speak(speech, 'Second.');
  await until(() => written.length >= 1, 'the first segment is handed to the worker');
  await new Promise(resolve => setTimeout(resolve, 20)); // the second joins the line
  speech.dropAll(Object.assign(new Error('Read aloud stopped.'), { status: 502 }));
  await assert.rejects(playing, error => error.status === 502);
  await assert.rejects(waiting, error => error.status === 502);
  speech.close();
});

test('the install lives where the app says it does', () => {
  assert.equal(readAloudRoot({ LOCALAPPDATA: 'V:\\l' }), 'V:\\l\\ProjectKO\\voice\\chatterbox');
});
