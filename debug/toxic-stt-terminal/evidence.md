# Evidence log

Chronological. Every entry is a measurement with the time it was taken and what
it proves. Sources are named so a claim can be checked instead of believed.

---

### 2026-11-24 14:45:45 - 14:53:25 - the owner's first test in this session

The owner pressed the chord in a Project KO terminal and reported that nothing
happened. Toxic's `history.json` holds **no take at all** in that window (the
takes bracket it at 13:56:35 and 14:53:25).

**Proves:** the failure is upstream of the terminal. Toxic never opened a take,
so no text was ever injected, so the terminal bridge was never exercised. Any
theory that blames Project KO's terminal for "dropping" the words is wrong.

### 2026-11-24 14:53:25, 15:01:19, 15:01:22 - the "control case"

Takes were recorded while a *different* Chromium application was in front, and
the text appeared **character by character** in that app's composer (the stored
draft grew from `"I checked it and it doesn't work."` to the full sentence).

**Correction (2026-11-24 16:36, see below):** this does **not** prove that
Toxic's `SendInput` typing reaches a web view. The MCP `dictation` tool is a
*partner* take: the transcript is returned to the caller and the caller inserts
it. Those takes were very likely partner takes to the agent app, in which the
*agent* typed the words. The bridge's own justification does not depend on this
(the xterm `keyCode 229` cancellation is verified separately by
`desktop/service/test/desktop-dictation-ui.mjs`), but the "control case" must
not be cited as proof that Toxic's typed text reaches a web view.

### 2026-11-24 15:31:51, 15:31:52, 15:34:19, 15:34:21 - four presses, recorded by the probe

```
15:31:51.256 | keydown code=17 key=Control ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
15:31:51.257 | keydown code=84 key=t     ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
15:31:51.259 |   ^ after: defaultPrevented=0
15:31:51.259 |   ^ after: defaultPrevented=1
15:31:51.362 | keyup   code=17 key=Control ctrl=0 target=textarea.xterm-helper-textarea
15:31:51.363 | keyup   code=84 key=t      ctrl=0 target=textarea.xterm-helper-textarea
```

**Proves:** (1) the chord arrives with exactly the modifier state the chord
asks for; (2) both key-ups arrive, so no modifier is stuck in the application;
(3) **Toxic's hook did not act on it** - a low-level hook that acts returns
non-zero and the key never reaches the target; (4) nothing was injected - no
`keyCode 229`, no `beforeinput`, no new row in Toxic's history.

### 2026-11-24 16:04:02 and 16:06:05 - two more presses

Same signature: `keydown code=17 key=Control ctrl=1`, then
`keydown code=84 key=t ctrl=1`, balanced key-ups, no packet, no take.

### 2026-11-24 16:00:38 - Project KO restarted (pid 23716)

Fresh app, fresh service, fresh probe. The two PKO windows are `Project KO —
Chats` and `Project KO — Workspace`.

### 2026-11-24 16:21:59 - Toxic restarted (pid 24140)

So the hook was freshly installed. `config.json` after the restart:
`hotkeys.enabled true`, `sttMode "chord"`, `sttChord "Ctrl+T"`, `ttsModifier
"alt"`. `dictation status` over MCP: `listening: false`, no stuck take.

### 2026-11-24 16:23:01, 16:23:02, 16:23:03 - three presses after the Toxic restart

Same signature again. **So a freshly installed Toxic hook still does not act on
a physical chord over the Project KO window.** "Toxic's hook was removed by
Windows" cannot be the whole story.

### 2026-11-24 16:31:31.882 - the owner's press during this session

```
16:31:30.272 | focus textarea.xterm-helper-textarea
16:31:31.882 | keydown code=17 key=Control ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
16:31:31.882 | keydown code=84 key=t ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
16:31:31.883 |   ^ after: defaultPrevented=0
16:31:31.883 |   ^ after: defaultPrevented=1
16:31:32.025 | keyup   code=17 key=Control ctrl=0 target=textarea.xterm-helper-textarea
16:31:32.025 | keyup   code=84 key=t ctrl=0 target=textarea.xterm-helper-textarea
```

No HUD, no take. Identical to 15:31.

### 2026-11-24 16:31:39.374 - the owner's take, recorded by Toxic

`history.json` gains `"Okay, back to fixing the PKO terminal bug"`, and the same
text reaches the agent's composer. The agent session timestamps the resulting
message at 16:33:39.

**Proves:** the owner dictates to the agent through Toxic's **MCP `dictation`
tool**, which is a *partner* take (see the code finding below). The take
**ended** at 16:31:39.374, which is 7.5 s **after** the chord press at
16:31:31.882 - so the chord press fell inside the window in which the partner
take was recording.

### 2026-11-24 16:36 - Toxic's source, read end to end

| File | What it says |
| --- | --- |
| `mcp.rs:282` | The `dictation` tool is for a partner app: *"The transcript is returned instead of typed, so the caller inserts the words itself. A partner take is not ended by a keystroke; only Escape cancels it."* |
| `dictation.rs:26-42` | `Owner::Hotkey` vs `Owner::Partner`. `start_partner` is the partner path. |
| `dictation.rs:496` | `partner_listening()` is true while a partner app owns the microphone. |
| `hotkeys.rs:654-699` | While a partner take is recording, the hook **passes every key to the app**: *"Every other key belongs to the partner app while it owns the microphone, including the dictation chord and the read-aloud taps."* The branch returns `false`, so the key reaches the foreground window. |
| `hotkeys.rs:695` | That branch is reached only when `partner_take && recording_now()`. |
| `hotkeys.rs:600-604` | The hook ignores **only Toxic's own** synthetic events (`MARKER`); *"Input injected by another program is still observed, so the hooks behave like physical keys."* |
| `inject.rs:311-325` | `PHYSICAL` is an `AtomicU32` updated only by `note_physical` from the hook. |
| `hotkeys.rs:618-622` | `note_physical` runs for every modifier event, before any early return. |
| `hotkeys.rs:701-717` | The chord branch needs `chord.matches(vk) && chord.modifiers_held()`, an **exact** four-way match on the tracked mask. |

**Proves three things.**

1. **The agent app is a partner of Toxic.** Every time the owner dictates to the
   agent, a partner take is recording, and during that time the chord is
   *deliberately* ignored and passed to whatever has the focus. The probe's
   signature is exactly what that looks like.
2. **Injection and physical keys are not different to Toxic.** Only Toxic's own
   marked events are ignored. So "the injected chord fired but the physical chord
   does not" is **not** about injection - it is about the state of Toxic at that
   moment. That closes the "why does injection work" thread.
3. **A stale modifier bit would break the chord machine-wide and silently**,
   because `modifiers_held()` demands an exact match.
