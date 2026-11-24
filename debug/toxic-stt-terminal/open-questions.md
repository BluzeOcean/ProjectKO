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

**ANSWERED - dead.** The hook is alive: the trace at 18:50:01 shows it with
5440 events behind it, and the keepalive logs a removal when one happens. See
[`ruled-out.md`](ruled-out.md).

---

## The test

**Two presses by the owner, in the Project KO chatspace terminal, with nothing
dictating.** The variable is the *speed* of the chord; the window stays the
same.

1. **Slow:** hold `Ctrl`, wait about half a second, then press `T`. The
   listening bar should appear - the asynchronous state has caught up, and the
   chord matches.
2. **Fast:** press `Ctrl+T` as one quick movement. The bar should **not**
   appear - the asynchronous state is still a batch behind, the chord is
   refused, and, today, the refusal leaves no log line at all.

| What happens | What it means | What to do next |
| --- | --- | --- |
| Slow works, fast does not | **The asynchronous lag is the cause.** The ticket is right. | Hand the ticket to the Toxic agent; the acceptance test in it is exactly this pair of presses. |
| Both work | The cause is intermittent, not the press speed. | Re-open the root cause. The trace in the Logs view is the tool now, and it must be read with `__TAURI_INTERNALS__`, not `__TAURI__`. |
| Neither works | The cause is something else and the ticket is wrong. | Correct the ticket before the Toxic agent works on it. |

**Rules for this test:** nothing dictating (no take in progress, the agent app
idle). Report what happened for each press, and the clock time.

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
