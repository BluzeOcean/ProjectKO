# Hex dictation in Project KO terminals

> **Superseded 2026-11-23.** Project KO no longer calls Hex directly. The bridge
> and the `hexShortcut` setting were removed when dictation moved to Toxic; see
> [Toxic as the voice layer](toxic-voice.md). The measurements below remain as the
> reason the bridge existed and as a record of Hex 3.4.0's behaviour.
>
> **The same finding applies to Toxic** (measured 2026-11-24): its chord starts a
> take over Notepad but not while a Project KO window is in front. Project KO
> therefore sweeps the chord up in its own windows and calls Toxic itself, which
> is the conclusion this note reached for Hex and the reason the bridge existed.

[Hex](https://anoma.ly) is a local dictation app for Windows with a Ctrl+T
dictation shortcut. In a Project KO terminal that chord produced a `^T` control
character and Hex never started listening, while the same key starts a dictation
in every other app. This note records the measurements, so the bridge in
`desktop/service/hex-bridge.mjs` is not mistaken for a workaround of a Project KO
input bug.

## What the measurements show

| Question | Result |
| --- | --- |
| Does a low-level keyboard hook see Ctrl+T while a Project KO window is in front? | Yes. A stand-alone `WH_KEYBOARD_LL` probe logged the chord exactly as it did over Notepad. |
| Do registered hotkeys fire over Project KO? | Yes. A probe hotkey received `WM_HOTKEY` in every test window. |
| Is Project KO elevated, where UIPI would hide its input from other hooks? | No. `projectko.exe`, `hex.exe` and Explorer are all medium integrity, `TokenElevation=0`. |
| Does Project KO's own Windows-key hook swallow the chord? | No. `src-tauri/src/win_key.rs` only tracks Windows-key state and returns `CallNextHookEx`. A two-hook test also confirmed that `CallNextHookEx(NULL, …)` still reaches hooks installed earlier. |
| Does Hex dictate over Project KO when asked through its command line? | Yes. `hex dictation start` records while the Project KO terminal has focus. |
| Does Hex paste into the Project KO terminal? | Yes. `hex paste-last` inserted its text at the terminal prompt. |
| Does Hex's own shortcut start a dictation over Project KO? | No. `hex status` stayed `idle` and `hex logs` recorded no `started` event, while the same injected chord over Notepad recorded one. |

Hex's listener is therefore the part that drops the chord. It reads the
foreground application for per-application modes, and its suppression state
machine in `src/windows/input.rs` has no other window-dependent branch, yet the
decision does not accept this window. Hex 3.4.0 has a
`share_dictation_shortcut` setting ("let other apps see the dictation shortcut
too") that passes the chord on instead of consuming it. It is off, and turning it
on would still leave the `^T` in the terminal, so it is not a fix.

## What Project KO does instead

`hex.com` drives the running app "as the shortcut would", so the terminal uses
that rather than the chord:

- `desktop/service/hex-bridge.mjs` finds the copy Hex records in
  `%APPDATA%\hex\current-version` and runs `hex.com dictation toggle --json`.
  A missing install and exit code 3 ("Hex isn't running") are reported, not
  hidden.
- `GET /api/hex` answers `{ available, version, enabled }` and
  `POST /api/hex/dictation` toggles the dictation. The saved setting
  `hexShortcut` (Settings → Chats → **Hand Ctrl+T to Hex**, on by default) turns
  this off.
- `src/desktop/TerminalPane.tsx` asks `/api/hex` when a terminal opens. While Hex
  is available and the setting is on, Ctrl+T is swallowed on both edges and Hex
  is toggled, so the CLI never receives `^T`. Ctrl+T with Alt, Shift or Command
  is left to the CLI.

## Verification

`node --test desktop/service/test/hex-bridge.test.mjs` covers detection, the
missing install and the saved setting. A browser run against a fixture session
checked both paths: with the bridge on, one `dictation toggle` call and an empty
PTY write; with `hexShortcut: false`, no call and the CLI received `\u0014`.

## Limits

- The bridge needs a running Hex. With Hex closed the terminal reports
  "Hex is not running" in its status line instead of silently typing `^T`.
- Only the terminal is bridged; text fields in Workspace keep the plain key.
- After a Hex update, confirm the behavior is unchanged: run `hex status` while
  dictating from a Project KO terminal, and keep the setting off if a future
  version honors the chord again.
