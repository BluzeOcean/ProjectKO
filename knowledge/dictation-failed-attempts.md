# Attempts that did not work: the dictation chord, 2026-11-24

This is the ledger of the **failed** work on the dictation chord. It exists so the
next agent - Project KO's own or another - does not repeat a patch, a theory or an
experiment that was already measured and found wanting. The working design is in
[dictation-memory.md](dictation-memory.md); the two open defects are in
[request-toxic-chord.md](request-toxic-chord.md) and
[request-toxic-typing-target.md](request-toxic-typing-target.md).

Read this before changing anything about dictation.

## The rule that stopped the search

**Never drive the keyboard or the mouse to test.** The owner is at the machine.
Ask the owner to press the key and report what happened. An injection test is not
a substitute, and it is not allowed. (Standing rule from the owner, 2026-11-24.)

## Designs that were removed - do not bring them back

| Attempt | Why it went |
| --- | --- |
| The microphone switch, the transcript watcher and the focus tracker (Project KO answered the chord itself and placed the words) | A take made in another application was typed into Project KO as well. Removed 2026-11-24 - and **still removed**: none of them came back with the partner take. |
| The partner take as a **button in the composer** (`pkoTake`, `POST /api/dictation/listen`) | Removed 2026-11-24. **A narrow form came back the same day**: the terminal's chord opens the take (`POST /api/dictation/take`). The button, the transcript watcher and the focus tracker did **not** come back with it. |
| A clipboard fallback | Refused by the owner: *"I don't want the toxic app to use the clipboard, because that will populate my clipboard every time I speak to it."* The bridge writes into xterm's input stream and never touches the clipboard. |
| `document.title` as the window's identity | The web view's title is not mirrored to the OS window title, so it cannot identify a window. |
| The Tauri global API from the web view | Not exposed to the page. |
| Reading the web view's LevelDB with `ReadAllBytes` | The file is locked while the app runs. Open it with `FileShare.ReadWrite` and copy the stream. |

## The chord over a Chromium web view - the one that could not work

**A global chord shortcut cannot reach a Project KO window, and no amount of
Toxic-side work changes that.** The WebView2 host takes the keyboard as raw
input (`WM_INPUT`), so the keyboard message that the low-level hook chain runs
on is never generated for a key that goes to the window. Toxic's hook is never
called; the page gets the key instead, as a trusted DOM keydown.

| Attempt | What it was |
| --- | --- |
| Waiting for Toxic's chord hook to be called for a Project KO window | It is not called. Measured: the chain logged **nothing** for 27 s while the web view logged two complete `Ctrl+T` presses, and the same chord in Notepad was matched and typed. |
| Looking for the key to be swallowed by another hook | A swallowed key never reaches the application, and the application received it (`TRUSTED=1`). |
| Elevation (UIPI) as the cause | All processes measured at Medium integrity with `GetTokenInformation(TokenIntegrityLevel)`. |
| A raw-input registration in Project KO | There is none, and there is no `PostMessage`, no synthesised key event and no injected DLL in the WebView2 processes. |
| A fix on the Toxic side | It is not Toxic's to fix: the hook is never asked. The owner approved the terminal opening the take itself (Route B) on 2026-11-24. |

## Measuring the keyboard - the instruments that lied

| Trap | What it looks like | The rule |
| --- | --- | --- |
| File I/O inside a low-level hook callback | The hook is removed by Windows (`LowLevelHooksTimeout`), and the log simply stops. It reads exactly like "the chain is dead". | Copy the struct into a ring buffer; write from a worker thread. |
| Killing a process that owns a low-level hook | The chain stops being called **machine-wide** until a fresh hook is installed cleanly. The owner's chord was dead in every window. | Never kill a hook process. Let it exit, or unhook cleanly first. |
| Two probes that share a hosting model | They agree with each other and are both wrong (two PowerShell-hosted probes, an hour of silence). | Prove an instrument against an independent one, and keep a hookless `GetAsyncKeyState` poller as the control. |
| A heartbeat written by the probe itself | It proves the process is alive, not the hook. | Re-arm the hook on a timer and log the result. |

## Experiments whose conclusions were invalid - the most dangerous ones

| Experiment | What really happened |
| --- | --- |
| `SendInput` injection with a 32-byte `INPUT` struct | A **silent no-op** on x64. The struct must be 40 bytes (type + padding + a 32-byte union). Every "the chord does nothing" conclusion drawn from those runs was an artefact of the broken injector, not a fact about Toxic. |
| `GetMessageW`-only message pump in a test hook | Blocks forever. Use `PeekMessageW` when the hook has to return. |
| `Add-Type` C# with `Marshal.GetDelegateForFunctionPointer<Delegate>` | Compile error. Declare a named `HookProc` delegate and keep a static reference to it. |
| `Write-Output` inside an `EnumWindows` delegate | Never reaches the pipeline. Collect the rows into an array and return it. |

## Theories that were measured and disproved

| Theory | The measurement that killed it |
| --- | --- |
| Project KO's 10-second hook re-registration (`src-tauri/src/win_key.rs`) kills Toxic's hook | A/B with a working injector: the chord fired with Project KO running **and** with it stopped (baseline +4 s / +13 s / +25 s / +37 s). The re-registration is not the cause. |
| The owner restarted Project KO, so Toxic's hook died | Disproved by the same A/B: the chord fired with Project KO running. |
| "Injected text never reaches a web view" | Falsified by the control case: a take was typed **character by character** into another Electron app's composer, and the stored draft grew as it went. The corrected statement is in [dictation-memory.md](dictation-memory.md). |
| The owner's failing 14:45 test was `Ctrl+Shift+T` | Unproven - there was no probe then. The probe later recorded a **plain** `Ctrl+T` reaching the window with `ctrl=1, shift=0`. |
| CDP `rawKeyDown` with `windowsVirtualKeyCode: 229` can simulate the Unicode packet | Chromium drops it. It does not reproduce a `VK_PACKET`. |
| CDP `char` dispatch can stand in for the packet | It double-types once the bridge is installed. The bridge and the CDP path do not compose. |

## What is still open, and where it belongs

- **The chord over a Project KO window: closed on Project KO's side.** The
  terminal opens the take itself (Route B, owner-approved 2026-11-24), because
  Toxic's hook can never be called for a key that goes to a Chromium web view.
  The measurements are in [`.debuglog/m-2026-11-24-2308-pko-press-measured.md`](../.debuglog/m-2026-11-24-2308-pko-press-measured.md).
- **A take is typed into whatever has the focus ~21 s later.** Toxic's side,
  and still open. It applies to a take made in another application. See
  [request-toxic-typing-target.md](request-toxic-typing-target.md).

Do not re-open the watcher, the focus tracker or the clipboard to "work around"
the second one.

## Where the evidence lives

| What | Where |
| --- | --- |
| The probe (keys, packets, inserted text) | `src/desktop/dictationProbe.ts`, installed in every desktop window, writing to the web view's storage under `mrmak.dictationProbe`. It is kept on purpose and switched on and off over `POST /api/dictation/probe` - see `knowledge/dictation-probe.md`. |
| The working log for the chord defect | `.debuglog/` - the symptom, the dated evidence, the attempts, what is ruled out and the open questions |
| What Toxic recorded | `%APPDATA%\app.toxic.desktop\history.json` (`{id, at, text, engine}` - no target field), `config.json`, `state.json`, `mcp.json`, `api.json` |
| Toxic's own log | None on disk. `engines::log` goes to the Logs view of the Toxic window and to a Tauri event only. |
| The service's stderr | `%LOCALAPPDATA%\com.projectko.workspace\logs\service.log` |
| The live session list (tab strip) | The service's WebSocket at `/events`; the bearer token is the one in the window URL |

The probe is **not** product behaviour, but it is **kept**: the owner asked for it
to stay, because it is the only instrument that can show what a window received
from another process. It records by default, shows a badge only when it is
asked to, and is switched over `POST /api/dictation/probe`.
