You are taking over one focused task in the Toxic repo at `V:\04_Projects\Toxic`.

## Mission

Fix Toxic's global hotkey handling so it can never leave Ctrl, Alt, Shift or Win stuck down, never swallow a key-up it cannot replace, and can be turned off entirely. Then commit the fix and rebuild Toxic's shipping build.

## Context you can rely on

- Toxic 1.2.0, clean checkout at commit `802c024`. Verify `git status` before starting.
- Windows, Tauri 2 + Rust. The running app is `V:\04_Projects\Toxic\src-tauri\target\release\toxic.exe`.
- Runtime config: `%APPDATA%\app.toxic.desktop\config.json`.
  Current hotkeys: `sttModifier: "control"`, `ttsModifier: "alt"`, `windowMs: 400`.
- Project KO (`V:\06_App\ProjectKO`) has just been rewired to use Toxic over its MCP server. **Project KO injects no keyboard events and installs no global Ctrl hook.** Do not modify, build, commit or clean the pKO working tree; another session owns it.
- The owner's incident: while using Toxic's global text-to-speech shortcut (double-tap Alt) in another app, Ctrl became logically stuck and typing stopped. They had to restart Windows through the Start menu. No pKO process or pKO service-log entry existed at that time, so pKO was not running. After the reboot `GetAsyncKeyState(VK_CONTROL)` is clear and Sticky Keys is off. The only Ctrl injection in this stack is Toxic's.

## Read these first

- `src-tauri/src/hotkeys.rs` lines 125-245, especially line 240: on **every** Alt key-up the low-level hook calls `input::mask_and_release_alt()` and returns `true`, swallowing the physical Alt up.
- `src-tauri/src/input.rs` lines 48-67: `ctrl_combo()` sends Ctrl down, key down, key up, Ctrl up. `mask_and_release_alt()` spawns a **new thread per Alt-up** and sends Ctrl down, Ctrl up, Alt up. `send()` ignores `SendInput`'s return value.
- `src-tauri/src/dictation.rs` lines 333-383: `speak_selection()` prefers UI Automation, otherwise calls `send_copy()` (Ctrl+C), sleeps 140 ms, reads the clipboard.
- `src-tauri/src/config.rs` lines 152-171 `HotkeyConfig`; `src-tauri/src/commands.rs` lines 19-70 `config_set`; `src/views/SttView.tsx` lines 135-166 trigger/window UI.

## Why this is dangerous

1. The mask batch releases Ctrl **before** the synthetic Alt up, so it does not hold Ctrl while the menu would activate; it emits a stray Ctrl tap into whatever app has focus.
2. If the synthetic Ctrl-up is not delivered (UIPI/elevated target, input desktop change, target closing, partial `SendInput` failure), Ctrl remains logically down. The code does not check the return and has no cleanup.
3. Injection runs on a detached thread per Alt tap; mask, copy and paste `SendInput` calls are not serialized.
4. The physical Alt-up is swallowed before the replacement is known to have been delivered. If the replacement fails, Alt is stuck too.
5. While recording, the hook swallows every non-modifier keydown; a stuck "recording" state can look like a dead keyboard.

## Required fix

### A. Add a global-shortcuts switch

- Add a serde-defaulted `enabled: bool` (default `true`) to `HotkeyConfig` so old configs deserialize.
- When false: do not install the hook, or make it pass everything through immediately with `CallNextHookEx` and never swallow or mask. Release any modifiers when switching off.
- Persist through `config_set` and expose a clear toggle in the STT settings (and a one-line note in TTS settings).
- A tray item **Release stuck keys** is a useful safety valve.

### B. Fix the Alt mask

- Hold Ctrl **across** the synthetic Alt-up: `[Ctrl down, Alt up, Ctrl up]` in one `SendInput` batch. The current order is `[Ctrl down, Ctrl up, Alt up]`.
- Perform this synchronously in the hook callback (`SendInput` is fast) and check the return. If the batch is not fully inserted, return `false` so the physical Alt-up passes through; log it. Do not spawn a thread per tap.
- Tag synthetic events with a unique `dwExtraInfo` marker and ignore only your own marker in the hook, not all injected input.

### C. Serialize and harden all injection

- One global mutex or queue for `SendInput`: mask, copy, paste and watchdog releases. No concurrent batches.
- Every function that presses a key must include its key-up in the same batch and verify `SendInput`'s count. On partial failure, send key-ups for every key it pressed and log.
- Extract pure `injection_plan()` functions so unit tests can assert balanced down/up sequences without sending real input.

### D. Watchdog and lifecycle

- Track which modifiers Toxic itself pressed; never force-release a modifier the user is physically holding.
- After each batch, if Toxic pressed a modifier and its up is missing, force a key-up.
- On hotkey disable, app exit, panic or hook-thread shutdown, best-effort release Ctrl/Alt/Shift/Win.
- Log injection failures and watchdog releases to the Logs view.

### E. Keep behavior

Double-tap Ctrl = dictation, double-tap Alt = read selection, a bare Alt must not open menus, while listening any non-modifier key finishes, Esc cancels. The hook must stay low-latency and never do slow work inline.

## Tests

- Unit: the mask plan is exactly Ctrl-down, Alt-up, Ctrl-up; copy/paste plans are balanced; the failure path releases; `enabled=false` bypasses the hook.
- A test mode that records events instead of calling `SendInput`, or `TOXIC_ALLOW_INJECTED=1` in a disposable VM, to assert ordering.
- Manual, in a disposable app or VM where possible:
  1. Fifty bare Alt taps in Notepad/Chrome: no menu, TTS works, and `GetAsyncKeyState(0x11) & 0x8000` stays 0 after every tap.
  2. Repeat with Ctrl+Alt, Alt+Tab, rapid taps, double-tap Alt, Escape.
  3. Focus an elevated window (for example Task Manager): injection may be blocked; the physical Alt-up must pass and no key may stick.
  4. Disable global shortcuts: Alt opens menus normally, no Ctrl tap, no hook swallowing.
  5. Confirm typing works after each case. Do not risk the owner's live session with a test that could lock the keyboard; ask before doing anything that might.

Global key-state check:

```powershell
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class K { [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey); }
"@
[K]::GetAsyncKeyState(0x11) -band 0x8000   # Ctrl
[K]::GetAsyncKeyState(0x12) -band 0x8000   # Alt
[K]::GetAsyncKeyState(0x10) -band 0x8000   # Shift
```

## Build, commit, handoff

- Verify the Toxic working tree is clean before your change; keep build artifacts out of the commit.
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run tauri build` for the shipping build; the release exe is `src-tauri/target/release/toxic.exe` and the installer is under `src-tauri/target/release/bundle/nsis`.
- Commit only Toxic's source, tests and UI changes with a clear message such as `fix(hotkeys): hold Ctrl across the Alt mask and allow disabling global shortcuts`. Report the commit hash.
- **Do not restart or quit the running Toxic, and do not install the new build, without the owner's explicit OK.** Report the artifact paths and wait.
- Do not touch `V:\06_App\ProjectKO` or commit its working tree.

## Out of scope

The owner also saw a terminal-like window around the incident. pKO was not running and pKO's TTS starts no process; this was most likely Toxic's own window or an older Pocket TTS console. Do not conflate it with the hotkey fix, but note it if you see it.

## Deliverable

Reply with: root cause, files changed, tests run and results, commit hash, artifact paths, and the exact manual verification still needed. Keep the owner's keyboard safe.
