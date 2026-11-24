# Request: Toxic's global dictation chord does not open a take while a Project KO window is in front

**Status:** open. **Raised:** 2026-11-24 by Project KO (this repository).
**Addressed to:** whoever owns the **Toxic** repository at `V:\04_Projects\Toxic`.

This is a ticket, not a change. Project KO cannot edit Toxic; it can only report
what was measured and what has to change. Everything below is measured on this
machine, on the running build.

## The defect

Toxic's speech-to-text chord is `Ctrl+T` (chord mode). Pressing it over Notepad
opens a take: the HUD appears, the recording starts, the transcript lands in
Toxic's history. Pressing **the same chord while a Project KO window is in
front does nothing at all** - no HUD, no take, no history entry, no error.

Measured live on 2026-11-24:

| Check | Result |
| --- | --- |
| `Ctrl+T` over Notepad | take opens, HUD `Listening`, transcript in `history.json` |
| `Ctrl+T` over a Project KO chatspace terminal | **nothing happens** |
| `dictation status` over MCP afterwards | `{"listening": false, ...}` - no take was ever opened |

## A second reproduction on 2026-11-24, with a control case

The owner tested dictation in a Project KO terminal between **14:45:45** and
**14:53:25** and reported that nothing happened. The record on disk is
unambiguous: Toxic's `history.json` holds **no take at all** in that window.
The takes that bracket it are `13:56:35` and `14:53:25`, and the 14:53 one is
the owner's own words - *"I checked it and it doesn't work. And also the
compiling time"* - typed into another application.

The failure is therefore **upstream of the terminal**: Toxic never opened a
take, the HUD never appeared, the microphone was never taken and not a single
character was injected anywhere. Nothing in Project KO could have dropped the
words, because there were no words. The terminal bridge was never exercised.

### The control case: the chord works over another web view

The same chord, **over a different Chromium application**, opened a take at
14:53:25 and again at 15:01:19 and 15:01:22. The words landed in that app's
composer **character by character** - its stored draft grew from
`"I checked it and it doesn't work."` to the full sentence - which is the
signature of Toxic's `SendInput` + `KEYEVENTF_UNICODE` typing path rather
than of a partner take.

Two things follow, and both narrow this ticket:

1. **A web view does not eat the chord.** A Chromium application was in front
   and the chord worked. What fails is specific to a Project KO window, not to
   web views, Chromium, or injected text in general.
2. **Injected text does reach a web view.** The packet is delivered and
   Chromium inserts it into an ordinary field. Project KO's terminal needs a
   bridge for xterm's own reasons; the browser is not the obstacle.

### Two details in Toxic's code that matter for the next step

- `fire_stt` calls `dictation::toggle`, so a chord press **while a take is
  already open stops it** instead of starting one. A take that is stuck open
  would make the next chord press look like a no-op.
- The branch that ends a take (*while listening, any ordinary key finishes the
  dictation*) runs **before** the chord branch and swallows the key. While a
  recording is live, `Ctrl+T` never reaches the chord test at all.

### The configuration changed right after the test

`%APPDATA%\app.toxic.desktop\config.json` was rewritten at **14:56:43** - one
minute after the failing test. The settings in force during the test were
therefore not necessarily the ones now on disk, and the hook matches against
the **in-memory** `SHARED.config`, not the file. Ask the owner what they
changed at 14:56 before assuming the current chord is the one that failed.

### The log has no file to read

Toxic's hotkey log (`engines::log`, called from `log_hotkey`) goes to the
**Logs view of the Toxic window** and to a Tauri event. It is never written to
disk - `src-tauri` has no log file at all, and `%APPDATA%\app.toxic.desktop`
holds only `history.json`, `config.json`, `state.json`, `mcp.json` and
`api.json`. So a dropped chord leaves no trace anywhere on disk. The only
persisted trace of a take is one row in `history.json`, and it has no target
field: it records *that* a take happened, never *where* it was typed.

## The decisive measurement, 2026-11-24 15:31 and 15:34

Project KO's probe (see below) recorded what the Project KO window actually
received while the owner pressed the chord in the Project KO terminal:

```
15:31:51.256 | keydown code=17 key=Control ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
15:31:51.257 | keydown code=84 key=t     ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea
15:31:51.259 |   ^ after: defaultPrevented=0
15:31:51.259 |   ^ after: defaultPrevented=1
15:31:51.362 | keyup   code=17 key=Control ctrl=0 target=textarea.xterm-helper-textarea
15:31:51.363 | keyup   code=84 key=t      ctrl=0 target=textarea.xterm-helper-textarea
```

and the same pair again at 15:31:52, 15:34:19 and 15:34:21 - four presses.

What this proves, and it is worth reading carefully:

1. **The chord reached Project KO intact.** The `Ctrl` key-down arrived, the
   `T` key-down arrived with `ctrl=1`, `shift=0`, `alt=0` - exactly the
   modifier state the chord asks for. Both key-ups arrived as well, so no
   modifier was left stuck anywhere in the application.
2. **Toxic's hook did not act on it.** A low-level hook that acts returns a
   non-zero value and the key never reaches the target window. The key *did*
   reach the window, so the chord branch in `handle()` was never taken: the
   key was passed through untouched.
3. **Nothing was injected.** There is no `keydown` with the key code 229 and
   no `beforeinput` of inserted text in the whole record. No microphone, no
   transcript, no characters - and Toxic's `history.json` gained no row
   either (its newest entry was still the 15:01 take).

So the failing condition is one of exactly three, all inside Toxic:

- `chord.matches(vk)` was false - it should not be: `Ctrl+T` parses to the
  virtual key `0x54`, which is the key that arrived;
- `chord.modifiers_held()` was false - the tracked mask disagreed with the
  modifiers the application saw;
- the chord branch was never reached, because `config.stt_mode` was not
  `"chord"`, `config.enabled` was false, or **the hook was no longer
  installed**.

The third is the one to check first. `WH_KEYBOARD_LL` is removed silently by
Windows when its callback is slow, and this machine has a second low-level
keyboard hook that is re-registered every ten seconds
(`src-tauri/src/win_key.rs`, the `WM_TIMER` arm) - the hook chain is therefore
re-ordered constantly, and every hook in it shares one timeout budget. Toxic
installs its hook once, in `hotkeys::install()`, and **never reinstalls it**.

The control case matters for reading this: the same chord worked over another
Chromium application at 14:53:25, 15:01:19 and 15:01:22, with Project KO
running the whole time. So the chain is not broken in general, and the
difference is either **which window is in front** or **when** the press
happens.

Runtime configuration on the machine that showed it
(`%APPDATA%\app.toxic.desktop\config.json`):

```json
"hotkeys": { "enabled": true, "sttMode": "chord", "sttModifier": "control", "sttChord": "Ctrl+T", "ttsModifier": "alt", "windowMs": 400 }
```

Toxic 1.2.0, Windows, release build at
`V:\04_Projects\Toxic\src-tauri\target\release\toxic.exe`.

## What is already ruled out

Project KO measured these before reporting it; they are not the cause, so do
not spend time on them again. The full record is
`knowledge/hex-dictation-shortcut.md` in Project KO.

- **The key reaches the operating system.** A stand-alone `WH_KEYBOARD_LL`
  probe logs `Ctrl+T` while a Project KO window is in front, exactly as it does
  over Notepad.
- **The hook chain is healthy.** Project KO installs its own low-level hook
  (`src-tauri/src/win_key.rs`, for the bare Windows-key recall). A two-hook test
  confirmed that its `CallNextHookEx(NULL, ...)` still reaches hooks installed
  earlier, and that hook never swallows anything.
- **No privilege mismatch.** `projectko.exe`, `toxic.exe` and Explorer are all
  medium integrity, `TokenElevation=0`. UIPI is not hiding anything.
- **The HUD would have been visible.** Toxic's HUD window is
  `always_on_top(true)`, `focusable(false)` and `skip_taskbar(true)`, so a take
  that had opened would have been drawn over the Project KO window. It was not
  drawn, so the take never started.
- **Project KO does not take the key first.** Project KO's terminal swallows the
  chord only inside its own web view, which happens *after* every low-level
  hook has run. A take opened by Toxic's hook would have reached the HUD first.

Toxic's own hook code was read for this report. `src-tauri/src/hotkeys.rs`
decides the chord in `handle()`:

```rust
if down && !is_modifier && config.stt_mode == "chord" {
    if let Ok(chord) = Chord::parse(&config.stt_chord) {
        if chord.matches(vk) && chord.modifiers_held() { ... fire_stt(shared); return true; }
    }
}
```

There is **no foreground-window or per-application check anywhere in the
dictation path** (`hotkeys.rs`, `dictation.rs`, `hud.rs` - `GetForegroundWindow`
is not called at all). So the difference between Notepad and a Project KO
window has to come from the hook's own state, not from a window test.

## Where to look first

1. **`Chord::modifiers_held()` is an exact match against a tracked bitmask.**
   `inject::PHYSICAL` is an `AtomicU32` that only Toxic's own hook updates
   (`note_physical`), and `modifiers_held()` demands that *every* modifier bit
   matches the chord exactly:

   ```rust
   held.ctrl == self.ctrl && held.alt == self.alt && held.shift == self.shift && held.win == self.win
   ```

   One stale bit - Shift, Alt or Win left set by a key-up the hook never saw -
   makes **every** `Ctrl+T` fail silently, with no log line. `input::mask_and_release_alt()`
   and `input::release_modifiers()` also touch modifier state around the
   synthetic Alt mask, and the mask path deliberately swallows the physical
   Alt-up. Check that the tracked mask cannot survive a missed key-up, and
   check the Alt-mask path for a modifier bit that is set but never cleared.
   A cheap way to see this: log the tracked mask and the chord decision for
   every key-down.

2. **Windows removes a low-level hook silently.** `WH_KEYBOARD_LL` is dropped
   when its callback is slow (`LowLevelHooksTimeout`). Toxic installs the hook
   once, in `hotkeys::install()`, on a thread that runs `GetMessageW` forever,
   and **never reinstalls it**. Project KO hit exactly this and now reinstalls
   its hook every 10 seconds (`win_key.rs`, the `WM_TIMER` arm). If Toxic's
   hook was removed at some point, Toxic's dictation shortcut is dead for the
   rest of the session - in every application, not only in Project KO. The
   symptom would then be "the chord works in Notepad" only if that test ran
   before the hook was lost. **Confirm the hook is still installed** (a probe
   that logs what the chain sees, or a log line with the hook handle and a
   periodic liveness check), and reinstall it when Windows drops it.

3. **A partner take left open disables the chord.** In `handle()`:

   ```rust
   let partner = crate::dictation::partner_listening(&shared.app);
   ...
   if partner_take && recording_now(&shared.app) { return false; }   // the chord is passed to the app
   ```

   While a partner app owns the microphone, Toxic ignores its own chord and
   lets the key through. That is right for a take in progress, but it means a
   partner take that is never closed leaves the chord dead for good, and the
   key then arrives at the foreground application - which is what Project KO
   observed: the key was consumed by the application and never reached Toxic.
   Check `AppState::partner` and `AppState::recording` for a take that was
   started and never finished, and make sure such a take is recovered (the
   maximum recording length, or the partner dropping off) instead of blocking
   the shortcut forever.

   **Since 2026-11-24 this can no longer come from Project KO**: it stopped
   opening partner takes entirely, so `AppState::partner` is never set by this
   app. A partner take left open can now only come from another partner app -
   which is a reason to make the partner rule safe by itself.

4. **A per-application suppression, like Hex 3.4.0 had.** Hex - the app
   Toxic's speech-to-text engine came from - had the same symptom and had a
   `share_dictation_shortcut` setting ("let other apps see the dictation
   shortcut too"), plus a foreground-application check in
   `src/windows/input.rs`. If Toxic has any equivalent - a hidden per-app
   list, a "foreground app" rule, or a settings key that is off - that is the
   most likely single explanation, and it should be visible in the settings
   pane.

5. **A take that is stuck open makes every chord look like a no-op.**
   `fire_stt` is a `toggle`, and the branch that ends a take runs before the
   chord branch and swallows the key while a recording is live. When the chord
   does nothing, check `AppState::recording` and `AppState::partner` first:
   they explain "nothing happened" without any error, exactly like the two
   cases above.

## What has to change

1. **The chord opens a take in every application**, including over a Project KO
   window, with the same result as over Notepad: HUD, recording, transcript in
   the history.
2. **No silent failure.** When the hook sees the chord and does not act, it
   says so in the Logs view. Today a dropped chord leaves no trace at all,
   which is what made this take a day to localise.
3. **A modifier that is physically up never blocks the chord.** The exact
   match is right - `Ctrl+T` must not fire for `Ctrl+Shift+T` - but it has to
   be computed from state that cannot go stale.
4. **The hook survives Windows removing it.** Reinstall it on a timer or on a
   liveness check, the way Project KO does, and log when it is reinstalled.
5. **A partner take that is never closed cannot disable the chord forever.**
   Either recover the take or report that the partner took the microphone over.
6. **Optional, and worth having:** a setting like Hex's
   `share_dictation_shortcut` - "let other apps see the dictation shortcut
   too" - so the chord can be passed on instead of consumed. Project KO would
   use it to answer the chord itself instead of racing Toxic for it.

## What Project KO does meanwhile

**Nothing, since 2026-11-24.** Project KO used to answer the chord itself: a
window that had the focus asked Toxic to listen through the `dictation` MCP
tool (`action: "start"`), which opened Toxic's microphone, played the cue and
showed Toxic's HUD. That takeover is gone, together with the microphone switch
and the transcript watcher. The chord is Toxic's alone now.

What Project KO still does is narrow and harmless: the terminal **swallows** the
chord, so the CLI never receives `^T` and Toxic's key does not become noise in
the agent. Nothing else listens for it, nothing answers it, and Project KO
never asks Toxic to open a take.

The consequence is the point of this ticket: **while the chord is not delivered
over a Project KO window, dictation does not work in Project KO at all.** Until
the hook is fixed, keep Toxic in **chord mode** (`sttMode: "chord"`), where the
hook swallows the key machine-wide, and use Toxic's double tap where a take
should be opened in another application.

### What Project KO can log for you now

While this ticket is open, Project KO carries a temporary probe in every
desktop window (`src/desktop/dictationProbe.ts`). It records, with a
timestamp, every key-down and key-up of the chord and its modifiers, every
packet (`keyCode 229`) and every `beforeinput` of inserted text, and writes
the lines to the window's own web view storage under `mrmak.dictationProbe`.
It reads nothing, sends nothing and is not part of the product - it will be
removed when the cause is known.

That answers the "a refused chord leaves no trace" requirement on Project KO's
side of the boundary: **if the key reaches a Project KO window, it is on
record**, and the record says whether the chord was seen, swallowed or
replaced by injected text. What Project KO cannot see is whether Toxic's hook
saw it - that is the part only Toxic can log.

## Rules

- **Do not modify, build or commit Project KO.** It is a separate repository
  (`V:\06_App\ProjectKO`) and this ticket is the whole of what it asks for.
- Keep the change to Toxic's source, tests and docs. Commit with a clear
  message and report the hash.
- **The owner is present.** Do not restart or quit the running `toxic.exe`, do
  not install a build and do not change `%APPDATA%\app.toxic.desktop\config.json`
  without their explicit OK. The running binary also blocks
  `cargo build --release` from replacing it, so ask first.
- Read these before changing anything:
  - `src-tauri/src/hotkeys.rs` - the hook, the chord decision, the partner rule.
  - `src-tauri/src/inject.rs` - `PHYSICAL`, `note_physical`, `physical_held`.
  - `src-tauri/src/input.rs` - the Alt mask and `release_modifiers`.
  - `src-tauri/src/dictation.rs` - `begin`, `finish`, `partner_listening`.
  - `src-tauri/src/config.rs` - `HotkeyConfig`.

## Acceptance

1. `Ctrl+T` over Notepad and over a Project KO terminal both open a take, with
   the HUD visible in both cases.
2. A chord press that is refused is logged, with the reason.
3. After Windows removes the hook, the chord works again without restarting
   Toxic.
4. A partner take that is abandoned does not disable the chord; the next press
   either works or reports that the microphone is taken.
5. The existing behaviour stays: double-tap Ctrl for dictation, double-tap Alt
   for read-aloud, a bare Alt must not open menus, Escape cancels, any key
   finishes a take.
6. `cargo test --manifest-path src-tauri/Cargo.toml` passes.
