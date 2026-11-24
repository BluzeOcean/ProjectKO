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

### 2026-11-24 19:14:52 - the owner ran the test: neither press worked

Three presses in the chatspace terminal, from the probe's own log:

```
19:14:52.696 | keydown code=84 key=t ctrl=1 shift=0 alt=0 composing=0   (fast)
19:14:52.844 | keyup   code=84 key=t ctrl=0

19:15:11.781 | keydown code=17 key=Control ctrl=1 shift=0 alt=0 composing=0
19:15:15.718 | keydown code=84 key=t ctrl=1 shift=0 alt=0 composing=0      (slow)
19:15:15.918 | keyup   code=84 key=t ctrl=1
19:15:16.382 | keyup   code=17 key=Control ctrl=0

19:15:19.846 | keydown code=17 key=Control ctrl=1 shift=0 alt=0 composing=0
19:15:19.902 | keydown code=84 key=t ctrl=1 shift=0 alt=0 composing=0      (56 ms)
19:15:20.158 | keyup   code=17 key=Control ctrl=0
```

**No take, no HUD and no log line for any of them.** The slow press held the
modifier for **3.9 seconds**.

**The asynchronous-lag hypothesis is disproved.** With the modifier held for
3.9 seconds, `GetAsyncKeyState(VK_CONTROL)` cannot still read "up": the
asynchronous state is many batches old by then. The chord would have matched,
the take would have started, and the line would exist.

**And the masks are ruled out too.** The owner held `Ctrl` alone
(`shift=0 alt=0`), so the expected mask is exactly what the chord asks for. A
refusal that leaves no line needs `check.tracked.any() || check.live.any()` to
be false - both masks empty - which means **the hook never saw the modifier
key-down either**.

**So the hook is not called for the keys that go into the Project KO window.**
A `WH_KEYBOARD_LL` hook is global and is called for every physical key, so
either the hook was not installed at that moment, or **those key events never
entered the input pipeline** and reached the web view another way.

Toxic was restarted at 19:18:41 (pid 36488) so the hook starts clean, and the
ticket was corrected in the same breath (commit `98b287f`) so the Toxic agent
cannot build a fix that the measurement has disproved.

### 2026-11-24 19:17 - the ticket files were deleted from the working tree

Both files under `V:\04_Projects\Toxic\ticket\` disappeared between 19:06 (my
last commit) and 19:19, with the folder's timestamp at **19:17:11**. Nothing
in this session removed them: the only delete this session ran was the
`mavis-trash` call for `.cache\toxic-ticket-commit.txt`, which reported one
file moved, and the runtime trash holds no ticket. The `.codegraph` folder in
that repo was last touched at 13:19, so it was not involved, and the Toxic
workspace session has been idle since 18:12.

**Nothing was lost**: both files were restored from commit `32229ce` with
`git checkout -- ticket/`. The working tree is clean again.

### 2026-11-24 19:30 - the owner's measurement: every other window works

*(owner: "all other windows even the powershell terminal can bring up the
listening bar, only pKO terminal can't")*

**This is the fact that moves the fault to the Project KO side.** Toxic's hook
is alive, installed and working: the chord opens a take in a native
PowerShell console and in the MiniMax Code window (the trace at 18:50:01
proves the second one). So the hook, the chord decision and Toxic's
configuration are **not** the cause. Only the Project KO terminal refuses it.

### 2026-11-24 19:38 - what the Project KO terminal really receives

- The probe's `code=` field is **`event.keyCode`**, not `event.code`
  (`dictationProbe.ts:139`). The terminal receives a **normal**
  `keydown`: `keyCode 84`, `key 't'`, `ctrlKey 1`, `isComposing 0`, and
  `defaultPrevented 1` afterwards (xterm.js cancels it, so the CLI never
  sees `^T`).
- **No unicode packets at all**: not one `keyCode 229` in 187 stored probe
  lines. The IME path is not involved.
- **Nothing in Project KO dispatches synthetic keyboard events**: not in
  `src/`, not in the built `dist/`, not in `desktop/service/`, not in xterm.
- A `Ctrl+T` pressed into a **Chromium page** by this project's own UI test
  (`desktop/service/test/desktop-dictation-ui.mjs`) leaves **no trace line**
  in Toxic's log either - a renderer-injected key never enters the operating
  system's input pipeline, so it never reaches a low-level hook.

### 2026-11-24 19:46 - the foreground window, measured

A sampler (`.cache/fg-watch.ps1`) records the foreground window every 150 ms.
Its first minute:

```
19:46:25.904 | 41368:MiniMax Code:MiniMax Code
19:46:28.905 | 28828:Overwatch:Overwatch
19:46:34.082 | 41368:MiniMax Code:MiniMax Code
19:46:35.034 | 28828:Overwatch:Overwatch
```

**The foreground window flips between Overwatch and MiniMax Code, and
Project KO never appears in it.** The owner types to me in MiniMax Code, and
that press is the one Toxic traced at 18:50:01.

**The suspect:** a window that has keyboard **focus** but is **not** the
**foreground** window receives the keystrokes without the operating system
running the low-level keyboard hook chain. The owner clicks into the Project
KO terminal while a full-screen game owns the foreground; the terminal has
focus (the probe sees the key), the hook is never called (no trace line), and
the chord does nothing. **Every other window works because it is the
foreground window when the key is pressed.**

**The test:** alt-tab to Project KO so it is really in front, click into the
terminal, press plain `Ctrl+T` - with nothing else allowed to steal the
foreground back. The sampler records whether Project KO was the foreground
window at that moment, so the answer and the reason arrive together.

### 2026-11-24 20:04:14 - the alt-tab test: Project KO **was** in front

The sampler (`.cache/fg-watch.ps1`, every 150 ms) recorded:

```
20:04:03.553 | 41368:MiniMax Code:MiniMax Code
20:04:13.488 | 3792:explorer:Task Switching
20:04:14.765 | 18776:projectko:Project KO — Chats      ← Project KO in front
20:04:20.893 | 41368:MiniMax Code:MiniMax Code
```

and the probe recorded **three physical `Ctrl+T` presses** in the terminal,
inside exactly that window:

```
20:04:16.357 | keydown code=84 key=t ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
20:04:16.361 |   ^ after: defaultPrevented=1
20:04:16.565 | keyup   code=84 key=t ctrl=1
20:04:16.709 | keyup   code=17 key=Control ctrl=0
20:04:17.413 | keydown code=17 key=Control ctrl=1 ...
20:04:17.549 | keydown code=84 key=t ctrl=1 ...
20:04:17.821 | keydown code=84 key=t ctrl=1 ...
20:04:18.469 | keydown code=17 key=Control ctrl=1 ...
20:04:18.621 | keydown code=84 key=t ctrl=1 ...
```

Toxic's log after all of it (read over CDP with
`__TAURI_INTERNALS__.invoke('logs_get', {engine})`):

```
=== engine=app :: 1 line(s) ===
  hotkeys: keyboard hook installed (pid 36488)
```

**The foreground hypothesis is dead.** Project KO was the foreground window, the
keys arrived in the terminal with Ctrl held, and Toxic's hook wrote nothing.

**This is also the first measurement that proves what the hook did.** Three facts
together:

1. A **matched** chord *swallows* the key (`hook_proc` returns 1, so the key is
   never posted to the application). The probe received the key-down, so no hook
   swallowed it.
2. A **refusal** always writes a line when a modifier is held:
   `if !repeated && (check.tracked.any() || check.live.any())`. With Ctrl
   physically down `live` (`GetAsyncKeyState`) is non-empty - the 3.9-second hold
   at 19:15 makes that certain - so a refusal would have been written.
3. `tracked` non-empty would have written a line as well.

So neither mask was consulted: **Toxic's hook proc was never called for those
keys.** (The old entry "Toxic's hook was never called" was ruled out with faulty
logic - it assumed "the key reached the app" proves "the hook was called". It
does not: a hook that declines to act also lets the key through. See
[`ruled-out.md`](ruled-out.md).)

### 2026-11-24 20:10 - elevation is ruled out

`WH_KEYBOARD_LL` hooks of a lower-integrity process are bypassed by the kernel
when a higher-integrity window has the focus (UIPI). That would look exactly like
this - the fault would follow the *window*, not the application. Measured, not
assumed:

| Process | `OpenProcess(PROCESS_ALL_ACCESS)` from this shell |
| --- | --- |
| `projectko.exe` (pid 18776) | opened - same or lower integrity |
| `toxic.exe` (pid 36488) | opened - same or lower integrity |
| `chrome.exe` (pid 11028) | opened - same or lower integrity |
| `Overwatch.exe` (pid 28828) | opened - same or lower integrity |

**Proves:** all four run at the **same integrity level**, so UIPI cannot be the
cause. Neither binary carries `requireAdministrator`, `highestAvailable` or
`asInvoker` in its manifest (both scans came back empty), and the machine has
no `EnableLUA` policy key.

### 2026-11-24 20:12 - the remaining suspects, after everything above

- **Toxic's hook is armed.** `lib.rs:105-110` loads the config from disk and
  calls `hotkeys::install(&handle, config.hotkeys.clone())` during setup, and
  `config.json` holds `hotkeys.enabled true`, `sttMode "chord"`,
  `sttChord "Ctrl+T"`. `active()` is `config.enabled` (`hotkeys.rs:209-211`),
  so the hook is not disabled.
- **Toxic's hook is installed.** The keepalive reinstalls it every 10 s and logs
  `Windows had removed the keyboard hook` whenever an unhook fails
  (`hotkeys.rs:632-638`). That line is **not** in the log.
- **Project KO does not inject the chord.** The only `SendInput` in the whole
  Rust side is the Windows-key mask in `win_key.rs:61-63` (`wVk 0xE8`), and the
  JS side has no synthetic keyboard dispatch at all. `terminalUnicode.ts` only
  reacts to `keyCode 229` packets, and there are none.
- **The chain is not broken by Project KO's own hook.** `win_key.rs:139` always
  ends in `CallNextHookEx`, so the chain continues.

**What is still unknown, and it is the crux:** is Toxic's hook **alive** in the
process that is running now (pid 36488, started 19:18:41)? The only trace of a
working chord ever seen came from the *previous* process (pid 43196, 18:34-18:56,
the trace at 18:50:01). **The owner's "it works in every other window" was
therefore measured on a different Toxic process**, and cannot be carried over to
this one.

### 2026-11-24 20:43 - the decisive test: the chain is cut for the Project KO window only

Two instruments, one keypress each, same minute.

| Window | Foreground sampler | Stand-alone probe (`WH_KEYBOARD_LL`, installed 20:22:23) | Toxic's log | Project KO web-view probe |
| --- | --- | --- | --- | --- |
| **Project KO terminal** | `18776:projectko:Project KO — Chats` from 20:43:01.987 to 20:43:26.499 | **nothing at all** | **nothing** | two complete Ctrl+T presses: 20:43:14.828→15.451 and 20:43:18.159→18.273 (`ctrl=1 shift=0 alt=0`, `defaultPrevented=1`) |
| **Chrome** | `11028:chrome` from 20:43:26.499 | `down vk=162` 20:43:29.178, `down vk=84` 20:43:29.180, ups 29.363/29.369 | `hotkeys: T pressed · chord Ctrl+T · tracked ctrl=1 alt=0 shift=0 win=0 · Windows ctrl=1 alt=0 shift=0 win=0 · matched · starting a take · front chrome.exe "YouTube - Google Chrome" · 19382 keys seen` and `dictation: typed into chrome.exe` | - |

Toxic's own injected typing is visible in the probe too: `down vk=231 (0xE7) …
flags=0x10 extra=0x70C1C01` at 20:43:33.314-33.319. `0x70C1C01` is Toxic's own
MARKER (`inject.rs:27`), so both the hook and the typing path are live.

Counted over the whole probe lifetime (2445 rows at 21:05): **42** `vk=84` (T)
events, **14** `vk=162` (LCtrl) events, and **0 rows whose foreground is `18776`
(Project KO)**.

**What this proves:**

1. **Toxic's hook is alive and healthy in the current process.** It matched the
   chord, opened a take, and had seen 19382 keys. "Toxic's hook is dead" and
   "Toxic's hook is not installed" are dead.
2. **The chord works in Chrome with the current process** - the owner's "works
   everywhere else" now holds for pid 36488, not only for the earlier process.
3. **The chain is cut for the Project KO window specifically.** The probe never
   swallows anything (it always ends in `CallNextHookEx`) and it saw every key
   that entered the chain, including the Chrome chord that Toxic swallowed. Over
   the Project KO window it saw nothing, while the web view received the same
   keys as ordinary keydowns.

**The paradox, in its sharpest form:** a physical Ctrl+T typed into the Project
KO terminal arrives at the web view as a normal keydown (`keyCode 84`, `ctrlKey
1`, `defaultPrevented=1`), yet **no low-level keyboard hook on the machine is
called for it** - neither Toxic's nor an independent stand-alone probe. Eleven
seconds later the same chord in Chrome reaches both hooks and Toxic opens a
take.

**Therefore the key reached the Project KO window by a path that does not go
through the `WH_KEYBOARD_LL` chain.** The candidates are a raw-input / `WM_INPUT`
path, an input-sink registration, a posted `WM_KEYDOWN`, or a synthesised DOM
event. No code path in Project KO was found that dispatches keyboard events, so
the newest suspect is the `hex.exe` pile (Toxic's STT engine): per the Hex-era
record, Hex reads the foreground application for per-application modes, refuses
windows it does not accept, and with `share_dictation_shortcut` off it consumes
the chord instead of passing it on.

**The hook probe is the instrument that settled this and must not be disposed
until the fault is found.** It is the only witness to the cut.

### 2026-11-24 21:13-21:20 - the 20:43 evidence re-read: the chain saw nothing at all

The raw `.cache/hook-probe.log` says something stronger than the summary
above. There is **not one row of any kind** between `20:43:01.914` and
`20:43:29.178` - 27.3 seconds with no key event, no `Ctrl`, no `T`, nothing.
The hole opens exactly when Project KO took the foreground (20:43:01.987) and
closes when Chrome took it (20:43:26.499) plus the first Chrome chord. The
probe was one single session with one `SetWindowsHookExW` and no re-arm, so a
Windows removal would have been permanent - it was not, the log continues to
21:01:45. **The hook was alive on both sides of the hole.**

**What this proves:**

1. The fault is **not** "the chain is cut for the Project KO window". It is
   "**no keyboard event of any kind entered the system input path** while the
   Project KO window was in front" - while the web view recorded two
   *complete* Ctrl+T presses (20:43:14.828->15.451, 20:43:18.159->18.273)
   inside that hole.
2. Integrity levels are equal. Measured with `OpenProcessToken` +
   `GetTokenInformation(TokenIntegrityLevel)`: **every** process in the chain
   is RID 8192 (**Medium**) - this shell, both probes, `projectko.exe` 18776,
   the focused `msedgewebview2.exe` 33424, `chrome.exe` 11028, `toxic.exe`
   36488. The 20:10 ruling used `OpenProcess(PROCESS_ALL_ACCESS)`, which only
   proves the *shell* was privileged enough to open each target; it does not
   compare the levels. The verdict (not elevated) is unchanged; the method is
   now correct.
3. Therefore **a physical keystroke aimed at the Project KO window must have
   produced a low-level hook callback, and none was produced**. The Ctrl+T the
   web view saw was not produced by the keyboard.
4. The Project KO side is clean: no `RegisterRawInputDevices`, no posted
   `WM_KEYDOWN`, no synthesised `KeyboardEvent` in `src/`, `src-tauri/`,
   `desktop/`; no `--remote-debugging-port` on the WebView2 host; **no
   third-party DLL** injected into `msedgewebview2.exe` (121 modules), its
   renderers (21 each) or `projectko.exe` (55 modules).
5. The focused window during Project KO foreground is
   `msedgewebview2.exe` **pid 33424**, a different process from the
   foreground `projectko.exe` 18776 - the normal WebView2 arrangement, and
   the real target of every keystroke.

**Full files:** [m-2026-11-24-2113-token-integrity-levels.md](m-2026-11-24-2113-token-integrity-levels.md),
[m-2026-11-24-2115-chain-gap.md](m-2026-11-24-2115-chain-gap.md),
[m-2026-11-24-2118-pko-side-is-clean.md](m-2026-11-24-2118-pko-side-is-clean.md),
[m-2026-11-24-2120-focus-vs-foreground.md](m-2026-11-24-2120-focus-vs-foreground.md).

**The instrument is dead.** `.cache/hook-probe.log` stops at 21:01:45 and no
`hook-probe` process exists. It is replaced by `.cache/hook-probe2.ps1`:
no I/O in the callback, a heartbeat every second, a re-arm every 10 s with
its result logged, and both the foreground and the focused window per event.

**The question has changed.** Not *what delivers a key to Project KO without
running the chain* - the key never came from the keyboard. Now: **what
produces a key event inside the Project KO web view?** Three candidates
remain, all outside Project KO: a posted `WM_KEYDOWN` from another process, a
protocol-driven input, or a DOM event synthesised in the page.
`event.isTrusted` separates them.
