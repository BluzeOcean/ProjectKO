# Phase 1: the chord must open a take over the chatspace

**Owner:** Kudavi, 2026-11-24. Phase 1 is finished before Phase 2 starts.

## The goal

Pressing plain `Ctrl+T` **in a Project KO chatspace terminal** opens a take in
Toxic: the listening bar appears, the microphone is taken, and the chord is
swallowed so the CLI never sees `^T`.

Phase 2 (the words arriving in the terminal) is a separate step and is written
up in [phase-2-delivery.md](phase-2-delivery.md).

## How it is measured

The screen is not the instrument. Two signals are read directly, every 120 ms,
by the watcher:

| Signal | Source | What it means |
| --- | --- | --- |
| `listening` | Toxic's MCP tool `dictation`, action `status` | Toxic's own listening mode is open |
| the HUD window | `IsWindowVisible` on the window titled `Toxic HUD` | the listening bar is on screen |
| the keypress | the probe in the chatspace web view | the chord reached the terminal, with which modifiers |

The watcher writes only the *changes*, so a take that opens and closes within a
second is still recorded:

```powershell
pwsh -NoProfile -File .cache\phase1-watch.ps1 12   # minutes
Get-Content .cache\phase1-watch.log
```

## The test

1. Click **into the PKO chatspace terminal** so the terminal pane has the focus
   (the probe must show `target=textarea.xterm-helper-textarea`).
2. **Nothing dictating.** The agent app must be idle and no take may be in
   progress - a partner take makes Toxic pass the chord to the app by design.
3. Press **plain `Ctrl+T`**, once. Wait three seconds.
4. For the comparison, switch to **Notepad** (a plain application, not a
   browser) and press plain `Ctrl+T` once. Wait three seconds.
5. Report what happened.

## What each outcome means

| Chatspace | Notepad | Reading |
| --- | --- | --- |
| no take | **take** | The chord works and something about the chatspace window blocks it. The hook has no window check, so the difference is in the state around the press - look at what the chatspace does to the modifiers. |
| no take | no take | The chord is dead machine-wide. The hook is gone or its modifier mask disagrees; both are Toxic-side. |
| **take** | take | Phase 1 is done. Move to Phase 2. |
| take | no take | Rare and strange; report it with the times. |

## What is already known, so nobody measures it again

- The chord reaches the chatspace with exactly the modifiers it asks for:
  `keydown code=17 ctrl=1 shift=0 alt=0`, then `code=84 ctrl=1`, and the
  terminal swallows it (`defaultPrevented=1`). Measured four times, most
  recently 16:49:55 and 16:49:56, with **no partner take open**.
- Toxic's own hook ignores only Toxic's *own* marked events, so an injected
  chord is observed exactly like a physical one: injection is not the variable.
- Toxic's hook installs once at startup and is never reinstalled.
- Toxic's chord branch needs an exact four-way match against its own tracked
  modifier mask, so one stale bit fails every `Ctrl+T` silently, everywhere.
- The partner-take rule (`hotkeys.rs:654-699`): while a partner app owns the
  microphone, Toxic passes **every** key, including the chord, to that app.
  The agent app is such a partner, because the owner's dictation to the agent
  goes through Toxic's MCP `dictation` tool.

See [`evidence.md`](evidence.md) for the dated measurements and
[`ruled-out.md`](ruled-out.md) for the theories that are already dead.
