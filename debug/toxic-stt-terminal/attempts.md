# Attempts

Every approach that has been tried on this bug, what it was, where it lives and
what came of it. The point is that the next agent skips the road that does not
lead anywhere.

**Verdicts:** `kept` (in the product), `kept as evidence` (it earns its place as
a tool), `removed` (it was taken out for a reason - do not bring it back),
`dead` (it proved nothing), `invalid` (it produced false readings).

---

| # | Attempt | Where | Verdict |
| --- | --- | --- | --- |
| 1 | Project KO answers the chord itself: asks Toxic to listen over MCP, watches the transcript, types the newest sentence into the focused field | `src/desktop/useToxicTranscripts.ts`, `src/desktop/windowFocus.ts`, `src/desktop/DictationButton.tsx` | **removed** - a take made in another application was typed into Project KO too |
| 2 | A partner take: Toxic records, the caller places the words | `POST /api/dictation/listen`, `pkoTake`, `ToxicClient.dictation()` | **removed** - nobody places the words any more |
| 3 | The clipboard as a delivery path | - | **never built** - refused by the owner |
| 4 | The terminal bridge: take the `keyCode 229` packet away from xterm and paste the text into the terminal | `src/desktop/terminalUnicode.ts`, wired in `src/desktop/TerminalPane.tsx` | **kept** - verified by `desktop/service/test/terminal-unicode.test.mjs` and `desktop/service/test/desktop-dictation-ui.mjs`; still never exercised by a real take |
| 5 | The terminal swallows the chord so the CLI never sees `^T` | `src/desktop/dictationChord.ts`, `src/desktop/TerminalPane.tsx` | **kept** - correct by design |
| 6 | The probe: record keys, packets and inserted text per window, keep them in web view storage | `src/desktop/dictationProbe.ts` | **kept as evidence** - now a permanent, agent-toggleable tool |
| 7 | `SendInput` injection of the chord to test without the owner | scratch scripts, since deleted | **invalid** - a 32-byte `INPUT` struct is a silent no-op on x64; every conclusion drawn from it was false |
| 8 | CDP `rawKeyDown` / `char` to fake a packet | scratch, since deleted | **dead** - dropped by Chromium, and it never reaches Toxic's system hook |
| 9 | Reading every on-disk log channel to find out what Toxic saw | `%APPDATA%\app.toxic.desktop\*`, PKO service log, web view storage | **kept as method** - Toxic has no log file; the only durable trace of a take is one row in `history.json`, with no target field |
| 10 | Restarting Toxic to reinstall the hook, then pressing the chord again | - | **kept as method** - the press at 16:31:31 was after a fresh install and still failed, which killed the "Windows removed the hook" theory |
| 11 | Reading Toxic's hook, mask and dictation source end to end | `hotkeys.rs`, `inject.rs`, `input.rs`, `dictation.rs`, `mcp.rs` | **kept as method** - produced the two live hypotheses and the correction to the "control case" |
| 12 | Closing the two leftover chat sessions and their agent processes | service API `DELETE /api/sessions/:id` | **kept** - unrelated to the bug, but the leftovers were holding `claude.exe` and a DSH CLI alive |

---

## 1-2. The takeover, and why it went

Project KO used to own the chord: its terminal swallowed `Ctrl+T` and asked
Toxic for a take over the MCP `dictation` tool, then a watcher polled Toxic's
transcript history and typed the newest sentence into the focused field. A focus
tracker and a freshness guard were added because Toxic's history holds **every
take on the machine**, including takes made in Chrome - and one of them landed
in Project KO.

Toxic owns the chord, the microphone, the recording and the typing. That is the
whole design now. The removal is recorded in
`knowledge/dictation-memory.md`; the reasons it must not come back are in
`knowledge/dictation-failed-attempts.md`.

## 4-5. The bridge, and the chord guard

xterm.js v6 cancels the keydown whose key code is 229, and a cancelled keydown
stops Chromium from inserting the text into the terminal's own field - so
Windows' `VK_PACKET` never became text. `terminalUnicode.ts` stops the event
before xterm sees it and takes over the `insertText` with `terminal.paste()`.
No clipboard is involved, and an IME composition is left alone.

The bridge is **not** the bug in this folder. It is kept, tested, and correct.
What has never happened is a real take arriving to exercise it.

## 6. The probe

It was written as a temporary instrument, and it earned its place: every
measurement in [`evidence.md`](evidence.md) comes from it. It records key-downs
and key-ups of the chord and its modifiers, unicode packets (`keyCode 229`),
`beforeinput` events, and focus changes, with a timestamp, into the web view's
own storage under `mrmak.dictationProbe`.

It is now permanent and the agent can switch it on and off over the service
API - see `knowledge/dictation-probe.md`.

## 7-8. The injection experiments, and why they must not be repeated

A `SendInput` test fired Toxic's chord (the HUD appeared) **only after** the
`INPUT` struct was corrected to 40 bytes. With the 32-byte version every
injection was a silent no-op, and every conclusion drawn from those runs was
invalid - including a confident claim that the chord did nothing.

The owner then forbade keyboard and mouse automation for testing. The rule
stands: **the owner presses the key.**

## 11. Reading Toxic's source, and what it changed

The source read on 2026-11-24 16:36 moved the work from guesswork to two
named hypotheses:

- The MCP `dictation` tool is a **partner** take, and while a partner take is
  recording, Toxic's hook passes **every** key - including the chord - to the
  app that owns the microphone.
- The hook ignores only Toxic's *own* synthetic events, so an injected chord is
  observed exactly like a physical one. Injection is not the variable.
