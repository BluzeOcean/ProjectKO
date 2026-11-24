# Measurement: the focused window is a different process from the foreground window

**Taken:** 2026-11-24 21:12-21:20 (Asia/Shanghai).
**By:** the agent that took over the handoff.

## What it measures

A key is delivered to the **focused** window, not to the foreground one. The
foreground sampler was upgraded at 21:10 (before this session) to log both
columns via `GetGUIThreadInfo`. The first rows of the new log:

```
21:10:34.073 | 4748:MiniMax Code:MiniMax Code  ||  focus=4748:MiniMax Code:MiniMax Code
21:10:40.639 | 11028:chrome:... - YouTube ...  ||  focus=11028:chrome:... - YouTube ...
21:11:47.190 | 4748:MiniMax Code:MiniMax Code  ||  focus=4748:MiniMax Code:MiniMax Code
21:12:12.614 | 18776:projectko:Project KO - Chats  ||  focus=33424:msedgewebview2:Project KO - Chatspace
21:12:38.420 | 6380:WindowsTerminal:...        ||  focus=6380:WindowsTerminal:
21:12:48.453 | 6380:WindowsTerminal:fix pKO     ||  focus=6380:WindowsTerminal:
21:12:58.825 | 4748:MiniMax Code:MiniMax Code  ||  focus=4748:MiniMax Code:MiniMax Code
```

## What it shows

When Project KO is in front, the **foreground** window is `projectko.exe`
(pid 18776, "Project KO - Chats") but the **focused** window is
`msedgewebview2.exe` **pid 33424** ("Project KO - Chatspace") - a separate
process. That is the normal WebView2 arrangement: the native window belongs to
the host process, the focused child window belongs to the WebView2 browser
process, and that is the window the keystrokes go to.

Two consequences:

1. **The input target is the WebView2 browser process, not PKO.** Any
   mechanism that delivers a key to this window without the system input path
   (a posted message, a raw-input registration) lives in that process or
   posts to it.
2. **The "focus vs foreground" variant of the handoff's open question is
   now closed as a *candidate for the 20:43 anomaly*, but it is not a
   candidate for a *delivery path*.** A key aimed at a focused window is
   still delivered through the system input path, and a system input path
   always runs the low-level hook chain (integrity levels are equal -
   see [m-2026-11-24-2113-token-integrity-levels.md](m-2026-11-24-2113-token-integrity-levels.md)).
   So focus and foreground cannot explain a *missing* hook callback. They
   matter only for **which** window receives the key, not **whether** the
   chain runs.

## Verdict

The foreground sampler's new column works and is worth keeping. The focus
column identifies the real input target (`msedgewebview2.exe` 33424). The
focus-vs-foreground variant is **not** an explanation for the missing hook
callback and moves out of the suspect list; the sampler keeps logging both
columns because the column is what tells us where a key was aimed.

## Note on lost evidence

The sampler's log file was recreated when it restarted at 21:10, so the raw
20:43 foreground rows survive **only** as a transcription in `evidence.md`.
Raw excerpts of every measurement are now filed as their own `.md` files in
this folder so that they cannot be lost a second time.
