# Phase 2: the words have to arrive in the chatspace terminal

**Starts only when Phase 1 is done** - a take that never opens cannot deliver
anything. See [phase-1-chord.md](phase-1-chord.md).

## The goal

The take's words are typed into the Project KO chatspace terminal, and the
agent in that terminal receives them.

## The path the words take

1. Toxic finishes the take and types the transcript with `SendInput` and
   `KEYEVENTF_UNICODE`. Windows delivers it to the focused control as a
   `VK_PACKET`.
2. Chromium turns it into a `keydown` with `keyCode === 229` and a
   `beforeinput` of `insertText` carrying the text.
3. xterm.js v6 cancels that keydown, which stops Chromium from inserting the
   text - so the terminal sees nothing at all.
4. `src/desktop/terminalUnicode.ts` is the bridge: it stops the event before
   xterm sees it and takes over the `insertText` with `terminal.paste()`.

Step 4 is written, tested and committed. **It has never been exercised by a
real take** - every test so far used a synthetic packet.

## How it is measured

| Signal | Source |
| --- | --- |
| the packet | the probe: `keydown code=229 key=Unidentified` |
| the text | the probe: `beforeinput type=insertText data="..."` |
| the delivery | the terminal's own output in the chatspace |
| the take itself | Toxic's MCP `dictation status` and `history.json` |

## The known trap

Toxic types into **the window that has the focus when the typing starts**, and
the typing starts only after the speech engine has finished - measured at
**21 seconds** after the chord. If the owner moves on in that time, the words
land in the wrong window. That is a separate Toxic-side defect, ticketed in
`knowledge/request-toxic-typing-target.md`.

So the test is: press the chord, speak, press one key to finish the take, and
**stay in the terminal until Toxic's listening bar clears**. The watcher
(`.cache\phase1-watch.ps1`) shows when the bar clears.

## What must not come back

- No clipboard: the words are typed, not pasted.
- No watcher over Toxic's history, and no focus tracker: the take belongs to
  the window that started it.
- No take asked of Toxic by Project KO: Toxic opens its own.
