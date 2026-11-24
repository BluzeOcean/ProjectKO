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

### 2026-11-24 16:49:55 and 16:49:56 - the owner's press with no partner take

Two presses in the chatspace terminal, one second apart:

```
16:49:55.877 | keydown code=17 key=Control ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
16:49:55.877 | keydown code=84 key=t ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
16:49:55.891 |   ^ after: defaultPrevented=0
16:49:55.891 |   ^ after: defaultPrevented=1
16:49:56.056 | keyup   code=17 key=Control ctrl=0 ...
16:49:56.056 | keyup   code=84 key=t ctrl=0 ...
```

**Proves:** the chord arrives with the right modifiers and the terminal
swallows it, and **no take was open** - the last take in Toxic's history was
16:31:39, eighteen minutes earlier. So the partner rule does **not** explain
these two presses: this time Toxic's own chord simply did not open a take.

### 2026-11-24 17:08:46 - the partner path, measured

Toxic was restarted at 16:55:22 (a fresh hook). At 17:08:46 a **partner take**
was started through Toxic's MCP `dictation` tool, and the watcher caught it:

```
17:08:46.387 | listening=True  hud=hidden
17:08:47.026 | listening=True  hud=visible     ← Toxic's listening bar appeared
17:08:48.406 | listening=False hud=visible
```

and the MCP answered:

```
start  -> "listening"
status -> {"listening": true, ...}
stop   -> ""          (the transcript, empty because nobody spoke)
```

**Proves:** a **partner take shows Toxic's listening bar** (`dictation.rs:83-96`
- the HUD is shown for both owners, only the hint text differs) and hands the
transcript back to the caller instead of typing it (`dictation.rs:214-220`).
**The listening bar over the chatspace is therefore reachable without Toxic's
hook at all** - see [route-b-partner-take.md](route-b-partner-take.md).

It also corrects an earlier assumption: a partner take with speech **does**
land in `history.json` (`push_history` runs before the partner branch); the
empty take above did not, because `finish()` returns early when there is no
speech.

### 2026-11-24 18:34:56 - the Toxic-side fix is deployed, the press is armed

The Toxic agent's status report (18:34) landed with all five ticket items
implemented and `cargo test` green (53 passed). The binary it built is the
one now running:

```
process  toxic.exe pid 43196, started 18:34:56
binary   V:\04_Projects\Toxic\src-tauri\target\release\toxic.exe
         14,450,688 bytes, built 18:29:17
```

Toxic was started with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` so the new
per-press trace lines (`hotkeys: T pressed - chord Ctrl+T - ... - matched -
starting a take`) can be read over CDP.

**State at the moment of writing:** the trace holds 1 log line and **0**
`hotkeys:` lines - correct, because no key has been pressed since the restart.
The phase-1 watcher (`bg_64fcc19e`) has been running since 18:35:30 and has
logged only its start line, i.e. `listening` has not flipped to True even once.

**The one missing input is still a human keypress.** The owner is asked to
press plain `Ctrl+T` once in a PKO chatspace terminal with nothing dictating.
The new trace line will then state either `matched - starting a take` or the
exact reason the chord was refused - which is what Phase 1 needs.

> **Correction, 19:10.** The two sentences above are wrong about the log, and
> the mistake was mine. The "1 log line" was not a log line at all: the reader
> called `window.__TAURI__.core.invoke`, and `withGlobalTauri` is off in this
> web view, so the call never happened and the reader returned the error
> string `<no __TAURI__ core>`. **Toxic's log had never been read** up to that
> moment. The working call is `window.__TAURI_INTERNALS__.invoke` - the Tauri
> IPC the app's own frontend uses, which is always injected. The watcher is
> blind to hotkey takes for a second reason: the MCP `dictation status` action
> reports `partner_listening`, so `listening` is `false` for a chord take even
> while the microphone is open. Only the HUD's visibility shows a chord take.

### 2026-11-24 18:49:29 - the owner's press, and the refusal that leaves no trace

The owner pressed plain `Ctrl+T` in the PKO chatspace terminal. The probe's
own log (persisted in the web view store, with timestamps):

```
18:49:28.272 | focus textarea.xterm-helper-textarea
18:49:29.115 | keydown code=17 key=Control ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
18:49:29.115 | keydown code=84 key=t ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
18:49:29.122 |   ^ after: defaultPrevented=0
18:49:29.122 |   ^ after: defaultPrevented=1
18:49:29.213 | keyup   code=17 key=Control ctrl=0 target=textarea.xterm-helper-textarea
18:49:29.214 | keyup   code=84 key=t ctrl=0 target=textarea.xterm-helper-textarea
```

**Ctrl and T arrive in the same millisecond** - one input batch, the way a
chord is typed in a terminal.

Toxic's log, read properly this time, holds **two lines in total** since the
process started:

```
hotkeys: keyboard hook installed (pid 43196)
hotkeys: T pressed · chord Ctrl+T · tracked ctrl=1 alt=0 shift=0 win=0 · Windows ctrl=1 alt=0 shift=0 win=0 · matched · starting a take · front MiniMax Code.exe "MiniMax Code" · 5440 keys seen
```

**The 18:49:29 press produced no line.** The one trace that exists belongs to a
different press: the HUD became visible at 18:50:01.345 and hid again at
18:50:04.639, 32 seconds later, in a different window - a *slow, deliberate*
press, where `tracked ctrl=1` and `Windows ctrl=1` agree. The owner's PKO
presses at 18:24:16.075, 18:24:16.589, 18:28:47.438 and 18:49:29.115 all
left nothing.

**The absence of a line is the evidence.** In `hotkeys.rs` the refusal line
is written only when a mask is not empty:

```rust
if !repeated && (check.tracked.any() || check.live.any()) { ... }
```

If the hook had tracked Ctrl, `live.any()` would have been true and a refusal
line would exist. If the hook had not been called at all, the key could not
have reached the application either - a matched chord *swallows* the key, and
the probe received it. The only way to get "no line, and the key still
arrived" is `tracked` and `live` both empty.

### 2026-11-24 19:05 - the root cause, and it is a regression in `4e57aa3`

`4e57aa3` (the Toxic agent's build) changed the chord decision from the hook's
own tracked mask to the mask **AND** `GetAsyncKeyState`:

| build | decision |
| --- | --- |
| `fbbd015` (worked at 16:31:31) | `Chord::modifiers_held()` - the modifiers the hook tracked |
| `4e57aa3` (fails) | `check()` -> `tracked.both(live)`, `live` = `GetAsyncKeyState` |

**Inside a low-level hook callback the asynchronous key state is one input
batch behind the event being processed**: it changes when the foreground
thread removes the message from its input queue, which is after the hook
chain has run. When Ctrl and T arrive together, `GetAsyncKeyState(VK_CONTROL)`
still reads *up* while the T key-down is handled.

So for a fast press:

1. `tracked = {ctrl:1}` (the hook saw the Ctrl key-down), `live = {}` (Windows
   has not published it yet).
2. `tracked.both(live) = {}` -> `matched` is false.
3. `tracked != live` -> `reconcile_modifiers()` runs and **clears the Ctrl bit
   the hook has just seen** (`inject.rs:369`).
4. The second `check_now()` reads `tracked = {}`, `live = {}`.
5. `matched` is false and `check.tracked.any() || check.live.any()` is false ->
   **nothing is written to the Logs view**.

The chord is refused, the key passes through untouched (which is why the
terminal still received it), and the refusal leaves no trace - the exact
failure the ticket's item 1 was written to end.

**This is why the slow press works and the fast press does not**, and why the
old build worked at 16:31:31: it decided from the hook's own mask.

**Written up as `ticket/(open) 2026-11-24-dictation-chord-and-typing-target.md`
in the Toxic repo, committed `32229ce`.**

### 2026-11-24 19:10 - the test that confirms it

**Ask the owner for two presses in the PKO terminal:**

1. **Slow:** hold `Ctrl`, wait about half a second, then press `T`. The
   listening bar should appear (the asynchronous state has caught up).
2. **Fast:** press `Ctrl+T` as one quick movement. The bar should **not**
   appear.

Slow works and fast does not -> the asynchronous lag is the cause, and the
ticket is right. If the slow press also fails, the root cause is elsewhere and
the ticket must be corrected before the Toxic agent works on it.
