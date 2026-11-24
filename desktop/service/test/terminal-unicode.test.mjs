// The bridge that lets a web view terminal receive text that Windows typed
// as a unicode packet (Toxic's way of putting words into the focused window).
// It is checked on its own: a packet has to be taken away from the terminal
// before the terminal cancels it, and only that text may be forwarded.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createUnicodeTypingBridge } from '../../../src/desktop/terminalUnicode.ts';

function keyEvent(keyCode, isComposing = false) {
  return { keyCode, isComposing, stopped: false, stopPropagation() { this.stopped = true; } };
}

function textEvent(inputType, data, isComposing = false) {
  return { inputType, data, isComposing, prevented: false, preventDefault() { this.prevented = true; } };
}

test('a packet keydown is taken away from the terminal, which would cancel it', () => {
  const pasted = [];
  const bridge = createUnicodeTypingBridge(data => pasted.push(data));
  const packet = keyEvent(229);
  bridge.keydown(packet);
  assert.equal(packet.stopped, true, 'the terminal must not see the packet and cancel it');
});

test('the words of the packet reach the terminal and stay out of the textarea', () => {
  const pasted = [];
  const bridge = createUnicodeTypingBridge(data => pasted.push(data));
  bridge.keydown(keyEvent(229));
  const text = textEvent('insertText', 'Hello');
  bridge.beforeinput(text);
  assert.deepEqual(pasted, ['Hello'], 'the words are handed to the terminal');
  assert.equal(text.prevented, true, 'the text must not also be inserted into the textarea');
});

test('a normal key is left to the terminal and never typed twice', () => {
  const pasted = [];
  const bridge = createUnicodeTypingBridge(data => pasted.push(data));
  const key = keyEvent(65);
  bridge.keydown(key);
  assert.equal(key.stopped, false, 'an ordinary key belongs to the terminal');
  bridge.beforeinput(textEvent('insertText', 'a'));
  assert.deepEqual(pasted, [], 'the terminal already typed that key');
});

test('a composition is left alone, so an IME keeps working', () => {
  const pasted = [];
  const bridge = createUnicodeTypingBridge(data => pasted.push(data));
  const composing = keyEvent(229, true);
  bridge.keydown(composing);
  assert.equal(composing.stopped, false, 'a real composition belongs to the terminal');
  bridge.beforeinput(textEvent('insertText', '中', true));
  assert.deepEqual(pasted, [], 'a composition is not a packet');
});

test('a packet is forwarded once', () => {
  const pasted = [];
  const bridge = createUnicodeTypingBridge(data => pasted.push(data));
  bridge.keydown(keyEvent(229));
  bridge.beforeinput(textEvent('insertText', 'a'));
  bridge.beforeinput(textEvent('insertText', 'b'));
  assert.deepEqual(pasted, ['a'], 'the second text belongs to another packet');
});

test('a later key closes the packet, so stale text is not forwarded', () => {
  const pasted = [];
  const bridge = createUnicodeTypingBridge(data => pasted.push(data));
  bridge.keydown(keyEvent(229));
  bridge.keydown(keyEvent(13));
  bridge.beforeinput(textEvent('insertText', 'Enter'));
  assert.deepEqual(pasted, [], 'the packet ended with the next key');
});
