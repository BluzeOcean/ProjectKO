# Measurement: the chain is alive - and killing a hook process takes it down

**Taken:** 2026-11-24 22:52-23:00 (Asia/Shanghai).
**By:** the agent that took over the handoff.

## The finding

The low-level hook chain on this machine **stops being called when a process
that owns a `WH_KEYBOARD_LL` hook is killed**. It is not broken, it is not
elevated, it is not swallowed - it is simply no longer asked.

The evidence, in order:

| Time | Event |
| --- | --- |
| 22:20-22:43 | `hookprobe3` (hook only) logged **1438 events** - the chain was healthy |
| 22:45:38 | `hookprobe4` started: hook **plus** a raw-input registration |
| 22:50:07 | a second `hookprobe3` started |
| 22:52:53 | **the `hookprobe4` processes were killed** |
| 22:53:05 | the last hook event anyone saw - a Tab key in Overwatch |
| 22:53:53 | three fresh probes started: **0 events each**, while the raw path saw 768 |
| 22:55:39 | a fresh `hookprobe3`: **0 events** |
| 22:59:03 | a fresh `hookprobe5` (hook only, logging every `nCode`): **266 events in 30 s**, `skipped=0` |

**The chain was alive again the moment the probes were started clean.** So
the fault is not in the machine and not in Project KO - it is in **killing a
process that owns a hook**.

This also explains the owner's report that `Ctrl+T` had stopped responding
in Chrome: at 22:0x-22:1x the chain was down, so **Toxic's hook was never
called** and no take could start - in any window. The same thing happened
earlier: the previous agent's probe stopped logging at **21:01:45** when its
process was reaped, and from then on the owner's chord was dead everywhere.

**It was never a code change to Toxic.** Its binary, `hotkeys.rs` and
`config.json` are untouched (mtimes 18:29 / 18:24 / intact).

## The instruments, validated

| Instrument | What it is | Log |
| --- | --- | --- |
| `.cache/hookprobe5.exe` | native `WH_KEYBOARD_LL`; the callback copies 24 bytes into a ring buffer and returns; logs **every** invocation including a negative `nCode` | `.cache/hookprobe5.log` |
| `.cache/keypoll.ps1` | **no hook at all** - `GetAsyncKeyState` polling; the control | `.cache/keypoll.log` |
| `.cache/pko-keytrace.mjs` | in-page recorder over PKO's CDP door (9334) | in the page |

`skipped=0` is worth recording: Windows never calls this hook with a
negative `nCode`, so "no rows" in the probe means the chain was not called at
all - not that the hook was skipped.

## The rules this buys

1. **Never kill a process that owns a low-level hook.** Let it exit on its
   own, or unhook cleanly first. The harness reaps background tasks by killing
   the process tree, so a probe must be started detached and left alone.
2. **A probe that does file I/O in its callback will be removed by Windows**
   (`LowLevelHooksTimeout`, default 300 ms) - the failure looks exactly like
   "the chain is dead". Log from a worker thread, never from the callback.
3. **A heartbeat proves the process is alive, not the hook.** A re-arm every
   10 seconds proves the hook is alive - but a re-arm also means the process
   must never be killed.
4. **Prove an instrument against a second one.** The PowerShell-hosted probes
   and the native probes disagreed for an hour, and the PowerShell ones were
   wrong.
