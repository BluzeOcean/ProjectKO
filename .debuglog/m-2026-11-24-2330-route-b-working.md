# The chord works in a Project KO terminal (2026-11-24 23:30)

**Taken:** 2026-11-24 23:29-23:31 (Asia/Shanghai).
**By:** the agent that took over the handoff.
**Status:** **Phase 1 is fixed.** The owner confirmed it live.

## What the owner did

`Ctrl+T` in a Project KO terminal: Toxic's listening bar appears, the owner
speaks, the next key ends the take, and **the words land in that terminal**.

## Why it was broken

Two faults that looked like one.

### 1. Toxic's chord hook was never called for the Project KO window

The Project KO window is a Chromium web view. The WebView2 host takes the
keyboard as **raw input** (`WM_INPUT`), so the ordinary keyboard message
(`WM_KEYDOWN`) is never generated - and the low-level hook chain
(`WH_KEYBOARD_LL`), where every global shortcut lives, runs on that message.

| | Project KO | Notepad |
| --- | --- | --- |
| the physical chord | happened (poller, 23:08:33.875) | happened (23:09:13.645) |
| the chain (`WH_KEYBOARD_LL`) | **never called** | called, matched, take opened |
| the app | got a **trusted** DOM keydown (`TRUSTED=1`, `composing=0`) | n/a |
| the words | never typed | typed ("hello hello") |

Nothing else was involved: not elevation (every process at Medium integrity),
not Toxic's code (binary mtime 18:29, `hotkeys.rs` 18:24, config intact), not
the `hex.exe` pile (16 orphans), not Project KO's code (no raw-input
registration, no posted message, no synthesised event, no injected DLL).

### 2. The chord was dead in *every* window for a while

This one was this agent's own instrument. A process that owns a low-level hook
and does file I/O in the callback is removed by Windows
(`LowLevelHooksTimeout`), and **killing such a process takes the chain down
with it** - the chain stops being called machine-wide until a fresh hook is
installed cleanly. The owner's "Chrome does not respond to Ctrl+T any more"
was that, not a change to Toxic.

## What changed

The chord *is* delivered to the page, so the terminal - which already caught it
to keep `^T` away from the CLI - now asks Toxic for the take as well.

| File | Change |
| --- | --- |
| `desktop/service/toxic.mjs` | `ToxicClient.dictation(action)` - the MCP call |
| `desktop/service/toxic-dictation.mjs` | **new** - the adapter: `take`, `stop`, `cancel`, `status` |
| `desktop/service/server.mjs` | `POST /api/dictation/take` |
| `src/desktop/TerminalPane.tsx` | the chord opens the take; the next key ends it; the words go into that terminal's input stream |

Toxic still owns the microphone, the recording and the transcription. A
partner take returns the transcript to the app that asked for it instead of
typing it, so:

- the words land in the terminal that asked - no focus guessing, no 21-second
  wait for whatever window happens to be in front;
- a take made in another application can never type into Project KO;
- the clipboard is never touched;
- the chord in every other application still goes through Toxic's own hook,
  unchanged.

The words are **inserted, never submitted**: they arrive as plain input, so
they can be read and edited before Enter sends them. A newline in a
transcript would submit the line, so it becomes a space. (Changed on
2026-11-25 - see
[m-2026-11-25-0025-insert-not-submit.md](m-2026-11-25-0025-insert-not-submit.md).)

## The checks

- `desktop/service/test/toxic-dictation.test.mjs` - **new**, 5 checks on the
  exchange with Toxic.
- `desktop/service/test/desktop-dictation-ui.mjs` - the old assertion *"this
  app asks Toxic for no take"* encoded the decision the owner has now
  reversed; it now asserts that the chord opens a take, that the words land in
  the terminal, that the CLI never receives the chord and that the clipboard
  is never touched.
- Service suite: **310 tests, 303 pass, 7 skipped, 0 fail.**
- UI scripts: **12 green** (theme, links, voice, clipboard, desktop-dictation,
  groups, unread, context-usage, mobile, workspace-edit, cards, conversation).
- `npx tsc -b`, `npx eslint src`, `npx vite build`: clean.
- Two failures are **pre-existing and unrelated**: `npm run test:template` and
  `npm run test:preview` both want four sample cards in the template and find
  three. They fail the same way on a clean tree.

## The doors are closed

Project KO was restarted without the CDP door, so **9334 is closed**. Toxic's
own door (9333) was closed when the other agent restarted that app. No debug
port is open.

## What is left for the owner

- The engine's garbled transcript (`What are you ggggg`) is Toxic/Hex side and
  is with the other agent.
- Route B is what the owner approved on 2026-11-24, replacing the standing
  decision that Toxic owns the chord alone. That decision rested on the chord
  reaching Toxic, which is measured to be false.
