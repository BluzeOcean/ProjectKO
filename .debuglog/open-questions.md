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

## H4 - What produces a key event inside the Project KO web view?

**OPEN - this is the crux, and it was re-worded on 2026-11-24 21:15.** The
earlier wording ("what delivers a key to the Project KO window without running
the hook chain") assumed the key came from the keyboard. It did not.

**What the raw log says:** between 20:43:01.914 and 20:43:29.178 the hook
chain received **no keyboard event of any kind** - not `Ctrl`, not `T`,
nothing - while the web view recorded two *complete* Ctrl+T presses inside
that hole. The probe was alive on both sides of the hole (one session, one
`SetWindowsHookExW`, no re-arm, the log continues to 21:01:45). Every process
involved is at **Medium** integrity, so a physical keystroke cannot produce
this. See [m-2026-11-24-2115-chain-gap.md](m-2026-11-24-2115-chain-gap.md)
and [m-2026-11-24-2113-token-integrity-levels.md](m-2026-11-24-2113-token-integrity-levels.md).

**So the question is:** what puts a Ctrl+T keydown into the Project KO web
view without a keyboard event ever entering the system input path?

**The candidates, all outside Project KO** (PKO itself is clean -
[m-2026-11-24-2118-pko-side-is-clean.md](m-2026-11-24-2118-pko-side-is-clean.md)):

1. **A posted `WM_KEYDOWN` / `WM_SYSKEYDOWN`** into the WebView2 window
   (`msedgewebview2.exe` pid 33424, the focused window) by another process.
   The browser process turns a keyboard message into the DOM keydown itself.
2. **A protocol-driven input** into the web view - CDP-style dispatch. The
   Project KO WebView2 has **no** `--remote-debugging-port`, so whoever would
   drive it has to open one, or reach it another way.
3. **A DOM event synthesised in the page** by code that is not in this
   repository.

**What would answer it:** `event.isTrusted`. `false` -> case 3 (a
`dispatchEvent` in the page). `true` -> case 1 or 2 (a message that was posted
or dispatched, not typed). The in-app probe records `isComposing` but **not**
`isTrusted` (`src/desktop/dictationProbe.ts:139`), so it is read live over CDP
with the Project KO WebView2 debug door open.

**What is ruled out about that list:** the *raw-input* candidate is now dead
too - Project KO's own code registers no raw input device, the WebView2 host
has no debugging door, and no third-party DLL is injected into the WebView2
processes ([m-2026-11-24-2118-pko-side-is-clean.md](m-2026-11-24-2118-pko-side-is-clean.md)).

**The focus-vs-foreground variant is closed** as a cause: a key aimed at the
focused window still travels the system input path and still runs the chain.
The focus column is kept because it identifies the real target -
`msedgewebview2.exe` pid 33424
([m-2026-11-24-2120-focus-vs-foreground.md](m-2026-11-24-2120-focus-vs-foreground.md)).

**The `hex.exe` pile** (17 processes) stays on the suspect list - it is the
only thing on this machine known to consume the chord - but note that Hex's
refusal would normally still be *seen* by a lower hook in the chain, so it
only fits if Hex consumes the chord *before* the chain runs. Test it, do not
conclude it.

---

## The next test (owner)

**One press, two windows, one difference - and now with `isTrusted`.** The
20:43 test answered "did a keyboard event reach the chain over PKO?" with
*no*. The remaining question is *what produced the keydown the web view saw*.

1. **In the Project KO terminal:** press a plain character (for example `a`),
   then press plain `Ctrl+T`.
2. **In Chrome:** press the same plain character, then `Ctrl+T`.

The Project KO WebView2 runs with the CDP door open for this test, so the
page is read live for `event.isTrusted` (the in-app probe does not record
it - `src/desktop/dictationProbe.ts:139`).

| Probe log (foreground + focused) | `isTrusted` in the page | What it means |
| --- | --- | --- |
| the keys are logged, `focus=33424` | - | **the OS path is intact** - the 20:43 hole was an artefact of the dead probe. The fault is Toxic-side again; re-test the chord |
| nothing is logged | `false` | a **DOM event was synthesised in the page** - hunt the synthesiser in the renderer |
| nothing is logged | `true` | a **message was posted or dispatched** into the web view - hunt the driver |
| the plain character is logged, `Ctrl+T` is not | `true` | only Ctrl+<key> takes the odd path - look at modifier/TSF handling |

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

