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
| The microphone switch, the transcript watcher and the focus tracker (Project KO answered the chord itself and placed the words) | A take made in another application was typed into Project KO as well. Toxic owns the chord, the microphone and the typing. Removed 2026-11-24. |
| The partner take (`pkoTake`, `POST /api/dictation/listen`, `ToxicClient.dictation()`) | A partner take is recorded but not typed, so somebody had to place the words. Nobody does that now. |
| A clipboard fallback | Refused by the owner: *"I don't want the toxic app to use the clipboard, because that will populate my clipboard every time I speak to it."* The bridge writes into xterm's input stream and never touches the clipboard. |
| `document.title` as the window's identity | The web view's title is not mirrored to the OS window title, so it cannot identify a window. |
| The Tauri global API from the web view | Not exposed to the page. |
| Reading the web view's LevelDB with `ReadAllBytes` | The file is locked while the app runs. Open it with `FileShare.ReadWrite` and copy the stream. |

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

- **The chord does not open a take over a Project KO window.** Toxic's side. The
  key reaches the application (probe-verified), so Toxic's hook passed it
  through untouched. See [request-toxic-chord.md](request-toxic-chord.md).
- **A take is typed into whatever has the focus ~21 s later.** Toxic's side. See
  [request-toxic-typing-target.md](request-toxic-typing-target.md).

Project KO cannot fix either from its own side. Do not re-open the takeover to
"work around" them.

## Where the evidence lives

| What | Where |
| --- | --- |
| The temporary probe (keys, packets, inserted text) | `src/desktop/dictationProbe.ts`, installed in every desktop window, writing to the web view's storage under `mrmak.dictationProbe` |
| What Toxic recorded | `%APPDATA%\app.toxic.desktop\history.json` (`{id, at, text, engine}` - no target field), `config.json`, `state.json`, `mcp.json`, `api.json` |
| Toxic's own log | None on disk. `engines::log` goes to the Logs view of the Toxic window and to a Tauri event only. |
| The service's stderr | `%LOCALAPPDATA%\com.projectko.workspace\logs\service.log` |
| The live session list (tab strip) | The service's WebSocket at `/events`; the bearer token is the one in the window URL |

The probe is **not product code**. It stays until the cause is known, and it is
removed with the same change that ends the investigation - not committed.
