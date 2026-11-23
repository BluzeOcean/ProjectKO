import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeWav, isWav } from '../audio-format.mjs';

// ffmpeg writes 0xffffffff into the RIFF and data sizes when its output is a
// pipe. Hex rejects that file as invalid-audio, so the sizes are filled in from
// the bytes that actually arrived, past any LIST chunk ffmpeg wrote first.

function pipedWav(payload = 'audio') {
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(16000, 12); fmt.writeUInt32LE(32000, 16);
  fmt.writeUInt16LE(2, 20); fmt.writeUInt16LE(16, 22);
  const list = Buffer.alloc(8 + 26);
  list.write('LIST', 0, 'ascii'); list.writeUInt32LE(26, 4);
  list.write('INFOISFT', 8, 'ascii');
  const data = Buffer.alloc(8 + payload.length);
  data.write('data', 0, 'ascii'); data.writeUInt32LE(0xffffffff, 4); data.write(payload, 8, 'ascii');
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(0xffffffff, 4); header.write('WAVE', 8, 'ascii');
  return Buffer.concat([header, fmt, list, data]);
}

test('the RIFF and data sizes are filled in past a LIST chunk', () => {
  const wav = finalizeWav(pipedWav('five!'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  const dataAt = wav.indexOf(Buffer.from('data'));
  assert.ok(dataAt > 12);
  assert.equal(wav.readUInt32LE(dataAt + 4), wav.length - dataAt - 8);
  assert.equal(wav.toString('ascii', dataAt + 8), 'five!');
});

test('a finished WAV is recognized and left alone', () => {
  const wav = finalizeWav(pipedWav('abc'));
  assert.equal(isWav(wav), true);
  const again = finalizeWav(Buffer.from(wav));
  assert.deepEqual(again, wav);
});

test('anything that is not WAV is not mistaken for audio', () => {
  assert.equal(isWav(Buffer.from('RIFF....not-wav')), false);
  assert.equal(isWav(Buffer.alloc(0)), false);
  assert.equal(finalizeWav(Buffer.from('plain text')).toString(), 'plain text');
});
