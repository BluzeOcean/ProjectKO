# Change: the spoken words are inserted, never submitted (2026-11-25)

**Taken:** 2026-11-25 00:20-00:25 (Asia/Shanghai).
**By:** the agent that took over the handoff.
**Status:** implemented, tested, live.

## What the owner asked for

> "right now, although it works, shortcut key press -> toxic bar appear and
> listen -> key press to end the listening -> it have my msg entered into the
> terminal claude without having printed in the text field for me to edit/
> revise ... so i'm wondering, if its possible to first print it on the
> text-input field first, and let me do the enter."

The words were arriving **with a carriage return**, so the agent terminal
submitted the message the moment it arrived and the person never got to read
or correct it.

## What changed

`src/desktop/TerminalPane.tsx`, one line:

```js
// before
sendEvent({ type: 'input', id, data: agent === 'shell' ? words : `${words}\r` })
// after
sendEvent({ type: 'input', id, data: words.replace(/[\r\n]+/g, ' ') })
```

- **the words are inserted, never submitted** - they arrive as plain input, so
  they sit in the terminal's own line where they can be read and edited, and
  the person presses Enter;
- a **newline inside a transcript would submit the line**, so it becomes a
  space - the whole point is that nothing is sent without the person asking;
- the `agent === 'shell'` distinction is gone: every terminal behaves the
  same way, which is both simpler and safer.

The status line now says **"Dictation received - edit and press Enter to
send"**, so the flow is obvious without reading any document.

The key that ends the take is still swallowed - it is the "end the take"
key, and it must not land in the input line. If that key is Enter, the
person presses Enter again to send.

## The return point

The state that worked is tagged, so it can be returned to in one command:

```
git checkout dictation-working-2026-11-24
```

It points at `0f0bba5` - the state the owner verified live.

## The checks

- `desktop/service/test/desktop-dictation-ui.mjs` - the words land in the
  terminal, **and are not submitted** (`assert.ok(!writes.join('').includes('\r'))`).
- Service suite: **310 tests, 303 pass, 7 skipped, 0 fail.**
- `npx tsc -b`, `npx eslint src`, `npx vite build`: clean.
- Project KO restarted so the new build is live.

## What did not change

Toxic still owns the microphone, the recording and the transcription. The
words still land in the terminal that asked. No clipboard, no polling, no
watcher, no focus guessing. The chord in every other application is
untouched, and a take made in another application still cannot type into
Project KO.
