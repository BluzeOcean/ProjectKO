# Request: Toxic types a take into whatever has the focus, not into the window that started it

**Status:** open. **Raised:** 2026-11-24 by Project KO (this repository).
**Addressed to:** whoever owns the **Toxic** repository at `V:\04_Projects\Toxic`.

This is a ticket, not a change. Project KO cannot edit Toxic; it can only report
what was measured and what has to change.

## The defect

Toxic opens a take in the window that has the focus, records, transcribes, and
then types the transcript into **the window that has the focus at that moment**
- which is a different window if the user moved on while the transcription ran.

The gap is not small. Measured on 2026-11-24:

| Moment | Clock |
| --- | --- |
| Owner presses `Ctrl+T` in the Project KO terminal | 15:46:47 |
| Owner presses a key to finish the take | 15:46:48 |
| Transcript ready (`history.json`, `at = 1795506428181`) | **15:47:08** |
| `type_text` waits for modifiers to clear | +1.5 s, so ~15:47:09.5 |

**Twenty-one seconds** between the chord and the words arriving, and the words
go wherever the user is looking by then. The user cannot sit in a terminal
for 21 seconds after a dictation without wanting to do something else, so the
words are delivered to the wrong window - or to nothing that matters.

## What was measured

The owner pressed `Ctrl+T` in a Project KO terminal at 15:46:47, spoke, and
pressed the chord again at 15:46:48 to finish. Project KO's probe recorded
the chord arriving intact (`ctrl=1 shift=0 alt=0`, balanced key-ups) and
**nothing else at all** - no key with the code 229, no `beforeinput`, no
inserted text, in either Project KO window.

Toxic's own record shows the take existed and was a hotkey take:

```
{"id":1795506428181,"at":1795506428181,"text":"How about him","engine":"hex"}
```

and `dictation status` over MCP answered
`{"listening":false,"last":{"at":1795506428181,"text":"How about him"}}`.

`Owner::Hotkey` takes are typed by `dictation::finish()` ->
`input::type_text()` (`src-tauri/src/dictation.rs`, `src-tauri/src/inject.rs`).
`type_text` documents itself as "Type text into the focused control" and it
does exactly that: it never asks which window started the take.

The transcript is one fragment ("How about him") because the second chord press
ended the recording after about one second. The words were typed about 21
seconds later, into whatever had the focus then - not the Project KO terminal
that started the take.

## Why this matters more than it looks

Toxic is a machine-wide tool, so "the words go to the focused window" is
usually right. It stops being right the moment the wait is long enough for
the user to move on, and the wait is 21 seconds on this machine because the
speech engine has to load and transcribe before anything is typed.

Project KO cannot fix this from its side. It deliberately does not open takes,
does not watch Toxic's history and does not infer focus any more - the takeover
and the watcher were removed on 2026-11-24. **The window that started the take
is known at the moment the take starts, and it is the only thing that has to be
remembered.**

## What has to change

1. **A take is typed into the window that started it.** Capture the foreground
   window when the take opens, and type into that window when the transcript
   arrives - even if the user has moved on since. If the window has gone, say
   so instead of typing into whatever happens to be in front.
2. **The wait is visible.** The HUD already shows "Transcribing…". It should
   say where the words are going, or how long the wait is, so the user knows
   whether to stay put. 21 seconds of silence is indistinguishable from a
   broken shortcut.
3. **A take that is typed into a window that has gone should not vanish.** At
   the moment the transcript is history and nothing else. Reporting the
   failure - the way a refused chord should report itself - is what makes the
   difference between "the shortcut is broken" and "the words went to another
   window".
4. **The transcript should name its window**, the way this ticket's withdrawn
   sibling asked for: `openedIn` and `typedInto` (pid, process, title) next to
   the transcript. A partner app that ever wants to place a take needs this,
   and it is the cheapest possible way to make delivery debuggable.

## Rules

- **Do not modify, build or commit Project KO.** It is a separate repository
  (`V:\06_App\ProjectKO`) and this ticket is the whole of what it asks for.
- Keep the change to Toxic's source, tests and docs. Commit with a clear
  message and report the hash.
- **The owner is present.** Do not restart or quit the running `toxic.exe`, do
  not install a build and do not change `%APPDATA%\app.toxic.desktop\config.json`
  without their explicit OK.
- Read these before changing anything:
  - `src-tauri/src/dictation.rs` - `begin`, `finish`, `push_history`, the owner.
  - `src-tauri/src/inject.rs` - `type_text`, `wait_for_typing_modifiers`.
  - `src-tauri/src/input.rs` - the typing path the MCP tool uses.
  - `src-tauri/src/hud.rs` - the "Transcribing…" state, where the wait is shown.

## Acceptance

1. A take started in window A is typed into window A, even when window B has
   the focus by the time the transcript is ready.
2. The wait is visible in the HUD, with the destination of the words.
3. A take whose window has gone is reported, not silently dropped.
4. `dictation status` names the window a take was typed into.
5. `cargo test --manifest-path src-tauri/Cargo.toml` passes.
