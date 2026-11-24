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

4. **A per-application suppression, like Hex 3.4.0 had.** Hex - the app
   Toxic's speech-to-text engine came from - had the same symptom and had a
   `share_dictation_shortcut` setting ("let other apps see the dictation
   shortcut too"), plus a foreground-application check in
   `src/windows/input.rs`. If Toxic has any equivalent - a hidden per-app
   list, a "foreground app" rule, or a settings key that is off - that is the
   most likely single explanation, and it should be visible in the settings
   pane.

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

Project KO answers the chord itself: a window that has the focus asks Toxic to
listen through the `dictation` MCP tool (`action: "start"`), which opens
Toxic's microphone, plays the cue and shows Toxic's HUD. The chord therefore
works in Project KO whether or not Toxic's own hook acts on it, and the words
are pasted into the terminal by Project KO rather than typed by Toxic.

That is a workaround for the symptom, not a fix for the cause. The two
applications should not have to agree on who answers the chord.

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
