# Open questions

What is still unknown, what would answer it, and what each answer would mean.
Keep this file short and current: when a question is answered, the measurement
goes into [`evidence.md`](evidence.md) and the question moves to
[`ruled-out.md`](ruled-out.md) or is deleted here.

---

## H1 - A partner take was recording, so the chord was passed to the app

**ANSWERED - dead.** `dictation status` reports `partner_listening`
(`mcp.rs:366`), so it is `false` whenever no partner take is running, and it
was `false` throughout. The one press that *was* traced (18:50:01, in another
window) matched and started a take - the partner branch returns the transcript
instead of typing it, which is not what happened. See
[`ruled-out.md`](ruled-out.md).

## H2 - Toxic's tracked modifier mask disagrees with the chord

**ANSWERED - it was the old build's bug, and it is fixed.** `fbbd015` matched
on Toxic's own tracked mask, so one stale bit refused every chord silently.
`4e57aa3` fixed that by ANDing the mask with `GetAsyncKeyState` - and that
introduced the failure that is open now: inside a hook callback the
asynchronous state is one input batch behind, so a fast chord is refused.
The measurement is in [`evidence.md`](evidence.md), 2026-11-24 19:05, and the
fix is written up in the Toxic ticket, committed `32229ce`.

## H3 - Toxic's hook is not installed at the moment of the press

**ANSWERED for the process that worked (pid 43196) - still open for the process
that is running now (pid 36488, started 19:18:41).** The hook is alive in the
old process: the trace at 18:50:01 shows it with 5440 events behind it, and the
keepalive logs a removal when one happens. The **current** process has written
nothing but `keyboard hook installed` since it started - and the owner's "it
works in every other window" was measured on the *old* process, so it says
nothing about this one. See [`ruled-out.md`](ruled-out.md).

---

## The test

**Two presses by the owner, one in each of two windows, with nothing
dictating.** A stand-alone `WH_KEYBOARD_LL` probe (`.cache/hook-probe.ps1`,
running since 20:22:23) logs every key event with its virtual-key code, its
flags and the foreground window. Toxic's own log is read over CDP. **The two
instruments watch the same chain, so they can be compared on the same keypress.**

1. **In the Project KO terminal:** type a few characters, then press plain
   `Ctrl+T` once.
2. **In any ordinary window** (Chrome is fine): press plain `Ctrl+T` once.

| Probe log | Toxic's log | What it means | What to do next |
| --- | --- | --- | --- |
| the characters are logged with `front=18776:Project KO` | nothing | The chain reaches a hook over the Project KO window, so **Toxic's hook is the broken link**. | The fix is on the Toxic side: why its hook is not called. |
| the characters are logged with `front=18776:Project KO` | a trace with `front projectko.exe` | Toxic's hook *is* called and refuses the chord. | Read the trace's masks; the decision itself is wrong. |
| nothing is logged for the Project KO window | nothing | The chain is cut for the Project KO window specifically. | Look at what sits in the chain. |
| the characters are logged with `front=18776:Project KO` | a trace with `front chrome.exe` for step 2 | The hook is alive and healthy, and blind to the Project KO window only. | As row 1: the fix is on the Toxic side. |
| the characters are **not** logged | nothing | The probe itself is blind - the chain is broken for every window. | Restart Toxic and re-test; the hook is not installed. |

**Rules for this test:** nothing dictating (no take in progress, the agent app
idle). Report what happened for each press, and the clock time. If a take opens
in step 2, press **Escape** to cancel it.

---

## Also open

- **Has a real take ever delivered a packet into a Project KO terminal?** No.
  The bridge has never been exercised by a real take, so it is unproven in the
  live direction. The first successful chord in a Project KO terminal answers
  this.
- **Toxic types into the window that has the focus ~21 s later.** Separate
  Toxic-side defect, ticketed in `knowledge/request-toxic-typing-target.md`.
  It will show up in the first successful test as words landing in the wrong
  place.
