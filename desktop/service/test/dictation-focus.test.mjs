// The focus tracker decides whether a take belongs to this window, so it is
// checked on its own: a window event has to beat a document that still claims
// the focus, and a new focus period has to be remembered.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createWindowFocus } from '../../../src/desktop/windowFocus.ts';

function fakeHost(focused = true) {
  const listeners = { focus: [], blur: [] };
  const host = {
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    hasFocus: () => focused,
    fire(type) { for (const listener of listeners[type]) listener(); },
    lose() { focused = false; },
    gain() { focused = true; },
  };
  return host;
}

test('without a window event the document decides, and the focus period starts when it comes back', () => {
  let clock = 1000;
  const host = fakeHost(false);
  const focus = createWindowFocus(host, () => clock);
  assert.equal(focus.focused(), false, 'a document without the focus is not focused');
  clock = 1500;
  host.gain();
  assert.equal(focus.focused(), true, 'the document reports the focus');
  assert.equal(focus.since(), 1500, 'the period began when the focus came back');
  clock = 1600;
  host.lose();
  assert.equal(focus.focused(), false, 'the document lost the focus again');
  clock = 1700;
  host.gain();
  assert.equal(focus.focused(), true);
  assert.equal(focus.since(), 1700, 'a new period began');
});

test('a window event beats a document that still claims the focus', () => {
  let clock = 1000;
  const host = fakeHost(true);
  const focus = createWindowFocus(host, () => clock);
  assert.equal(focus.focused(), true);
  // The document never noticed that another window took over. The window did.
  clock = 1200;
  host.fire('blur');
  assert.equal(focus.focused(), false, 'the window lost the focus');
  assert.equal(host.hasFocus(), true, 'the document still believes otherwise');
  clock = 1400;
  host.fire('focus');
  assert.equal(focus.focused(), true, 'the window has the focus again');
  assert.equal(focus.since(), 1400, 'the period began with that event');
});

test('a focus event without a blur in between does not start a new period', () => {
  let clock = 1000;
  const host = fakeHost(true);
  const focus = createWindowFocus(host, () => clock);
  host.fire('focus');
  assert.equal(focus.since(), 1000);
  clock = 1300;
  host.fire('focus');
  assert.equal(focus.since(), 1000, 'the same period continues');
  clock = 1600;
  host.fire('blur');
  host.fire('focus');
  assert.equal(focus.since(), 1600, 'a blur in between starts a new period');
});
