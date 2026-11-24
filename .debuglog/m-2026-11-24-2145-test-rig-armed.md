# The test rig, armed (2026-11-24 21:45)

**Taken:** 2026-11-24 21:34-21:45 (Asia/Shanghai).
**By:** the agent that took over the handoff.
**Purpose:** put every instrument in place for the one-minute owner test that
separates the three remaining candidates (posted message / protocol-driven
input / synthesised DOM event).

## What is in place

| Instrument | Where | State |
| --- | --- | --- |
| Rebuilt hook probe | `.cache/hook-probe2.ps1` → `.cache/hook-probe2.log` | **running** since 21:33. Heartbeat every second, re-arm every 10 s (`RE-ARM ok`), foreground **and** focused window on every event, no I/O in the callback |
| `hex.exe` pile | 17 processes | **killed** at 21:37 (owner authorised). `toxic.exe` 36488 unaffected |
| Project KO | `projectko.exe` pid **37884**, started 21:44:32 | restarted with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9334` - the CDP door is open (owner approved) and **must be closed later** by one more restart without the variable |
| PKO service | child of 37884, port 60376 (was 57581) | up |
| In-page key recorder | `.cache/pko-keytrace.mjs`, armed **21:45:23.658** on the `surface=chats` page | records `isTrusted`, `keyCode`, `key`, `code`, modifiers, `isComposing`, `repeat`, target element, `document.hasFocus()`, `activeElement`, and `defaultPrevented` after the event |
| Foreground sampler | `.cache/fg-watch.ps1` → `.cache/fg-watch.log` | running, logs foreground **and** focused window (pid 9664, 4-hour budget from 21:10) |
| Toxic's log | CDP 9333 (Toxic's own door, from the previous session) | readable; Toxic pid 36488 unchanged |

## The two pages behind the door

```
Project KO - Chatspace    http://127.0.0.1:60376/?desktop=1&surface=chats
Project KO - Vaultspace   http://127.0.0.1:60376/?desktop=1&surface=workspace
```

The recorder is armed on the **Chatspace** page (the one with the terminal).

## Why the recorder and not the in-app probe

The in-app probe (`src/desktop/dictationProbe.ts:139`) records `isComposing`
but **not** `isTrusted`, and its lines live in the WebView2 local-storage
profile. `isTrusted` is the one bit that separates the candidates, so it is
read live over CDP instead - **no product code changed**, and the debug port
is a temporary door, not a product change.

## What the owner is asked to do

Nothing dictating, no take in progress, the agent idle.

1. Click into the Project KO **terminal**, then press a plain character (for
   example `a`), then press `Ctrl+T`. **Report the clock time.**
2. Switch to Chrome, press the same plain character, then `Ctrl+T`.
   **Report the clock time.** If a take opens, press **Escape** to cancel it.

## How to read the answer

| Hook probe (`.cache/hook-probe2.log`) | In-page recorder | Meaning |
| --- | --- | --- |
| the keys are logged, `focus=` the WebView2 process | - | **the OS path is intact** - the 20:43 hole was an artefact of the dead probe. The fault is Toxic-side again |
| nothing is logged | `TRUSTED=0` | a **DOM event was synthesised in the page** - hunt the synthesiser |
| nothing is logged | `TRUSTED=1` | a **Windows message was posted or dispatched** into the web view - hunt the driver |
| the plain character is logged, `Ctrl+T` is not | `TRUSTED=1` | only Ctrl+<key> takes the odd path - modifier/TSF handling |
