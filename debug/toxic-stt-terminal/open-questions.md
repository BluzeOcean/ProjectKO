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

**ANSWERED - dead.** Measured 2026-11-24 20:43: Toxic matched the chord in
Chrome and opened a take in the very process that refuses to act over Project
KO (pid 36488, started 19:18:41), with `19382 keys seen` behind the hook. Its
injected typing is visible in the stand-alone probe as
`vk=231 … extra=0x70C1C01` at 20:43:33.314. See
[`ruled-out.md`](ruled-out.md).

---

## The test

**DONE - 2026-11-24 20:43. The result was the decisive one.** The owner's two
presses, one per window, with nothing dictating:

| Probe log | Toxic's log | Result |
| --- | --- | --- |
| the characters are logged with `front=18776:Project KO` | nothing | **This is what happened.** The chain is cut for the Project KO window specifically. |
| a trace with `front chrome.exe` for step 2 | - | **Also this.** Toxic matched the chord in Chrome and opened a take. |

The full measurement is in [`evidence.md`](evidence.md), 2026-11-24 20:43. The
stand-alone probe logged **zero** rows with `front=18776` across 2445 rows, and
**42** `vk=84` (T) events elsewhere.

---

## H4 - What delivers a key to the Project KO window without running the hook chain?

**OPEN - this is the crux.** A physical Ctrl+T typed into the Project KO
terminal arrives at the web view as a normal keydown (`keyCode 84`, `ctrlKey 1`,
`defaultPrevented=1`) while **no `WH_KEYBOARD_LL` hook on the machine is called
for it** - not Toxic's, and not the independent stand-alone probe.

**What would answer it:** identify the delivery mechanism. Candidates, in the
order they should be tried:

1. **A raw-input / `WM_INPUT` path.** `RegisterRawInputDevices` with
   `RIDEV_INPUTSINK` delivers keyboard input as `WM_INPUT` messages and
   **bypasses the `WH_KEYBOARD_LL` chain entirely**. This is the single best
   explanation of the symptom: the web view still receives a normal keydown,
   but no hook ever sees the key.

   **The WebView2 host is the most likely registrant.** The key arrives as a
   *DOM* event in a Chromium web view, which means something turned a Windows
   input message into a DOM keydown. If the PKO window (or the WebView2 host)
   registers a raw input device, Chromium receives `WM_INPUT` and synthesises
   the DOM keydown itself - and the whole `WH_KEYBOARD_LL` chain never runs.
   Chrome itself does not behave this way (the same chord reached both hooks
   there), which fits a WebView2-host-specific registration.
2. **An input-sink registration** for the Project KO window.
3. **A posted `WM_KEYDOWN`** (`PostMessage`/`SendMessage`) into the Project KO
   window, which also bypasses the chain.
4. **A synthesised DOM event** dispatched by the web view or the bridge.

**How to look:** grep the Project KO dependency tree and the WebView2 host for
`RegisterRawInputDevices`, `RIDEV_INPUTSINK`, `RIDEV_EXCLUDEFROMCAPTURE`,
`RAWINPUT`, `PostMessage`, `SendMessage`, `WM_INPUT`. Note that PKO's own
`src-tauri/src/win_key.rs` is **not** a candidate for the *delivery* - it only
reads keys, it never posts any - but check whether it or another module
*registers* a raw-input device.

**The focus-vs-foreground variant (still open, now instrumented).** A key is
delivered to the **focused** window, not to the foreground one, and the
foreground sampler at 20:43 only recorded `GetForegroundWindow()` - the
**focused** HWND was never captured. The sampler has been upgraded (21:10) to
log both, via `GetGUIThreadInfo`, and it is running again. If the focused
window is ever *not* the PKO window while PKO appears to be in front, that is
a delivery path of its own and it must be eliminated before anything else.

**The newest suspect is the `hex.exe` pile** (Toxic's STT engine; 17 processes
running, one started 19:18:42 with the current Toxic). Per the Hex-era record
(`knowledge/hex-dictation-shortcut.md`), Hex reads the foreground application
for per-application modes, refuses windows it does not accept, and with
`share_dictation_shortcut` **off** it consumes the chord instead of passing it
on. Killing the `hex.exe` pile and re-running the two-press test is a cheap
way to test it.

**Caution:** Hex's refusal would normally still be *seen* by a lower hook in the
chain, so this only explains the symptom if Hex consumes the chord *before* the
`WH_KEYBOARD_LL` chain runs - which is not how the chain is ordered. Treat it as
a suspect to test, not a conclusion.

---

## The next test (owner)

**One press, two windows, one difference.** The 20:43 test answered "is the
chain cut over PKO?" with *yes*. The remaining question is *why*.

1. **In the Project KO terminal:** press a plain character (for example `a`),
   then press plain `Ctrl+T`.
2. **In Chrome:** press the same plain character, then `Ctrl+T`.

| Probe log for the PKO window | What it means |
| --- | --- |
| the plain character is logged, `Ctrl+T` is not | only Ctrl+<key> bypasses the chain - look at modifier handling specifically |
| neither is logged | **all** Project KO input bypasses the chain - the raw-input / `WM_INPUT` path is the prime suspect |
| both are logged, and Toxic's log shows a `front projectko.exe` trace | the chain is fine over PKO and the earlier presses were the artefact - re-test the chord |
| nothing at all is logged for PKO, and the probe is still logging other windows | the probe itself is blind to that window |

**Rules:** nothing dictating, no take in progress, the agent idle. If a take
opens in Chrome, press **Escape** to cancel it. Report the clock time.

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

