# Measurement: the token integrity level of every process in the chain

**Taken:** 2026-11-24 21:13 (Asia/Shanghai).
**By:** the agent that took over the handoff.
**Machine:** no owner action needed.

## What it measures

The handoff ruled elevation out at 20:10 with `OpenProcess(PROCESS_ALL_ACCESS)`
against `projectko.exe`, `toxic.exe`, `chrome.exe` and `Overwatch.exe`. That
test only proves the **shell** was privileged enough to open each target. It
does **not** prove the targets share one integrity level: a shell running
elevated opens every medium *and* every high process successfully, so the test
passes identically for "all equal" and "one is much higher".

UIPI is the mechanism that would explain this bug's shape - a lower-integrity
low-level hook is not called for input destined to a higher-integrity window,
and the fault follows the *window* rather than the application. It had to be
re-measured with a method that compares the levels directly.

## Method

`OpenProcessToken` + `GetTokenInformation(TokenIntegrityLevel)` (class 25),
reading the RID out of the mandatory label's SID (byte offset 8), and naming
the level from the RID.

## Result

| Process | PID | Integrity |
| --- | --- | --- |
| this shell | 25608 | 8192 - Medium |
| foreground sampler (`fg-watch.ps1`) | 9664 | 8192 - Medium |
| `projectko.exe` | 18776 | 8192 - Medium |
| `msedgewebview2.exe` (the **focused** window) | 33424 | 8192 - Medium |
| `msedgewebview2.exe` (child) | 42972 | 8192 - Medium |
| `chrome.exe` | 11028 | 8192 - Medium |
| `toxic.exe` | 36488 | 8192 - Medium |

Every process in the chain runs at **Medium**.

## Verdict

**UIPI is dead - this time for the right reason.** No process is elevated, so
no lower-integrity hook is being skipped because a higher-integrity window has
the focus. The handoff's conclusion stands; its *method* did not.

This matters beyond the verdict: because no level is elevated, **a physical
keystroke aimed at any of these windows must produce a `WH_KEYBOARD_LL`
callback**. That is the premise the next measurement rests on
([m-2026-11-24-2115-chain-gap.md](m-2026-11-24-2115-chain-gap.md)).
