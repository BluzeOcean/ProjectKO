# Handoff: the dictation chord never opens a take over a Project KO terminal

**Written:** 2026-11-24 21:10 (Asia/Shanghai).
**For:** the next agent who continues this hunt. You are picking up a
half-finished diagnosis, not a fresh feature.
**Status:** Phase 1 **open**. Phase 2 **untestable**. Root cause **not yet
proven** - but it is now measured, not guessed, and the measurement narrows the
fault to a single class of mechanism.

> **Read `debug/toxic-stt-terminal/README.md` first.** That folder is the working
> log for this bug only. This document is the map; that folder is the terrain.

---

## 1. Circumstances

### What the owner wants

Speech-to-text inside Project KO's own chatspace terminal. The owner presses
`Ctrl+T` in a PKO terminal, Toxic opens a take (its listening bar appears), the
owner speaks, finishes the take, and **the words print in that PKO terminal**.

### The intended design (already decided, do not redesign)

- **Toxic owns everything**: the chord, the microphone, the recording, the
  transcription, the typing.
- **Project KO owns nothing but the terminal bridge**: it converts the incoming
  text into a packet that xterm accepts, and it never touches the microphone,
  never watches the clipboard, never polls, never injects keystrokes.
- This design was deliberately chosen on 2026-11-24 over a "Project KO asks
  Toxic to open a take" design. **Do not reopen that decision** - it was
  reversed on purpose and the reversal is recorded.

The full working design is in
[`knowledge/dictation-memory.md`](dictation-memory.md).

### What is broken

**Phase 1 - the chord does nothing over PKO.** `Ctrl+T` in a PKO terminal
reaches the web view as an ordinary keydown (`keyCode 84`, `ctrlKey 1`,
`defaultPrevented=1`). No listening bar. No microphone. No transcript. No row in
Toxic's history. Toxic's log records nothing at all for those presses.

**Phase 2 - the delivery is unproven.** No take has ever opened over PKO, so
the terminal bridge (`src/desktop/terminalUnicode.ts`) has **never been
exercised by a real take**. It cannot be until Phase 1 works.

**The chord works in every other window** - including a native PowerShell
console - and it works in Chrome with the *current* Toxic process.

### The measured contradiction (this is the crux)

At **20:43 on 2026-11-24**, the owner pressed Ctrl+T twice in the PKO terminal
and once in Chrome, within seconds of each other, with nothing dictating:

| Instrument | Project KO window | Chrome |
| --- | --- | --- |
| Foreground sampler | `18776:projectko:Project KO — Chats` (20:43:01.987 → 20:43:26.499) | `11028:chrome` (from 20:43:26.499) |
| Stand-alone `WH_KEYBOARD_LL` probe | **nothing** | `down vk=162` 20:43:29.178, `down vk=84` 20:43:29.180 |
| Toxic's log | **nothing** | `T pressed · chord Ctrl+T · tracked ctrl=1 … · matched · starting a take · front chrome.exe · 19382 keys seen` |
| PKO web-view probe | two complete Ctrl+T presses: 20:43:14.828→15.451, 20:43:18.159→18.273 | - |

Over the probe's whole lifetime (2445 rows): **42** `vk=84` (T) events, **14**
`vk=162` (LCtrl) events, and **0 rows whose foreground is `18776` (Project KO)**.

So: **a physical Ctrl+T reaches the PKO web view as a normal keydown, yet no
low-level keyboard hook on the machine is called for it** - neither Toxic's, nor
an independent stand-alone probe. The same chord eleven seconds later in Chrome
reaches both hooks and opens a take.

**That is the whole problem.** A key is arriving at the Project KO window by a
path that does not go through the `WH_KEYBOARD_LL` chain.

---

## 2. Memory pointers - read these, do not re-derive them

### The working log (the primary record)

`V:\06_App\ProjectKO\debug\toxic-stt-terminal\`

| File | What it holds |
| --- | --- |
| [`README.md`](../debug/toxic-stt-terminal/README.md) | The rules for the folder, the two phases, and the "do not dictate while testing" trap |
| [`symptom.md`](../debug/toxic-stt-terminal/symptom.md) | The symptom as first stated |
| [`evidence.md`](../debug/toxic-stt-terminal/evidence.md) | **Every measurement, dated, with its verdict.** 28 KB and chronological - read it last-to-first for the recent turns |
| [`ruled-out.md`](../debug/toxic-stt-terminal/ruled-out.md) | **The dead ends. Read this before trying anything.** Each entry names the measurement that killed it |
| [`open-questions.md`](../debug/toxic-stt-terminal/open-questions.md) | What is still unknown, and the next test |
| [`attempts.md`](../debug/toxic-stt-terminal/attempts.md) | The chronological attempt log |
| [`phase-1-chord.md`](../debug/toxic-stt-terminal/phase-1-chord.md) | Phase 1 in detail |
| [`phase-2-delivery.md`](../debug/toxic-stt-terminal/phase-2-delivery.md) | Phase 2 in detail |
| [`route-b-partner-take.md`](../debug/toxic-stt-terminal/route-b-partner-take.md) | The documented decoupling fallback (Route B), proven but **not built** |

### The durable knowledge files

| File | What it holds |
| --- | --- |
| [`knowledge/dictation-memory.md`](dictation-memory.md) | The working design of the dictation path |
| [`knowledge/dictation-failed-attempts.md`](dictation-failed-attempts.md) | **The ledger of every failed attempt, with reasons.** Includes the invalid injection experiments |
| [`knowledge/dictation-probe.md`](dictation-probe.md) | The in-app live probe (`src/desktop/dictationProbe.ts`) |
| [`knowledge/hex-dictation-shortcut.md`](hex-dictation-shortcut.md) | **The same bug in the Hex era.** Identical symptom: a stand-alone probe DID see Ctrl+T over PKO, yet Hex's own shortcut never started a dictation over PKO. Hex "reads the foreground application for per-application modes" and `share_dictation_shortcut` is **off** - Hex consumes the chord instead of passing it on |
| [`knowledge/request-toxic-chord.md`](request-toxic-chord.md) | The PKO-side ticket to Toxic. Lists what was already ruled out |
| [`knowledge/request-toxic-typing-target.md`](request-toxic-typing-target.md) | Toxic-side defect 2: it types into whatever has focus, ~21 s late |
| [`knowledge/toxic-voice.md`](toxic-voice.md) | How Toxic's voice and engines are configured |
| [`knowledge/voice-dictation.md`](voice-dictation.md), [`knowledge/voice-microphone-key.md`](voice-microphone-key.md) | Background on the dictation feature |

### The agent memory

`C:\Users\Bluze\.minimax\agents\mavis\memory\MEMORY.md` (1998 lines) - search
with `grep -n "<keyword>"`. The relevant entry is at **line 1998**:

> PKO dictation chord (2026-11-24): blocked Toxic-side, not PKO-side. Do not
> re-add PKO's mic switch / transcript watcher / focus tracker / clipboard
> fallback. Do not re-run SendInput injections: a 32-byte INPUT struct is a
> silent no-op on x64 (must be 40 bytes) and produced false conclusions. Never
> drive the keyboard to test. Ledger: `V:\06_App\ProjectKO\knowledge\dictation-failed-attempts.md`

### The other repo's ticket (read-only from here)

`V:\04_Projects\Toxic\ticket\(open) 2026-11-24-dictation-chord-and-typing-target.md`
(609 lines). The newest section is dated 20:25 and carries the 20:04 and 20:10
measurements. **It says: "Do not change the chord decision yet."** The 20:43
measurement is newer than that ticket - **add it there** (see §8).

### Skills

- `V:\06_App\ProjectKO\.claude\skills\feature-handoff\SKILL.md` - this document's
  shape.
- The repo's `AGENTS.md` - where evidence must live, how to register
  deliverables in `workspace/workspace.json`, and what must never be committed.
- `superpowers:systematic-debugging` - evidence before fixes; no fix without a
  proven root cause. This bug is being run by that discipline and it should stay
  that way.

---

## 3. What was tried

### The dead ends - **do not repeat these**

All of these were measured, not guessed. Each is in
[`ruled-out.md`](../debug/toxic-stt-terminal/ruled-out.md) with the measurement
that killed it. The short list:

| Attempted hypothesis | Verdict |
| --- | --- |
| The terminal dropped the words | **Dead** - no take was ever recorded, so nothing was ever injected |
| Windows removed Toxic's hook | **Dead** - the keepalive logs removals; that line is absent |
| PKO's 10-second hook re-registration kills Toxic's hook | **Dead** - A/B: the chord fired with PKO running *and* stopped |
| A stale modifier bit (the old build's bug) | **Dead** - that was `fbbd015`, fixed by `4e57aa3` |
| The asynchronous-state lag in the chord decision | **Dead** - the owner's 3.9-second-held Ctrl was still refused with no log line |
| A partner take was recording, so the chord was passed on | **Dead** - `dictation status` reports `partner_listening`; it was `false` throughout |
| The foreground window was the suspect | **Dead** - the 20:04 sampler shows PKO *was* in front during three physical presses |
| The Project KO window is elevated (UIPI) | **Dead** - measured 20:10: `OpenProcess(PROCESS_ALL_ACCESS)` succeeds for `projectko.exe`, `toxic.exe`, `chrome.exe` and `Overwatch.exe`; same integrity level; no `EnableLUA` key |
| PKO's own hook breaks Toxic's chain | **Dead** - `win_key.rs:139` always ends in `CallNextHookEx` |
| Toxic's hook is dead / not installed | **Dead** - 20:43: it matched the chord in Chrome with `19382 keys seen` |
| Injected vs physical keys behave differently | **Dead** - the hook ignores only Toxic's own marked events |
| The `SendInput` experiments | **Invalid readings** - a 32-byte `INPUT` struct is a silent no-op on x64 (it must be 40 bytes). Every conclusion from those runs was an artefact |
| CDP key dispatch as a substitute for the real thing | **Dead** - `rawKeyDown` with `windowsVirtualKeyCode: 229` is dropped by Chromium; CDP keys never reach Toxic's system hook |
| Driving the keyboard or the mouse to test | **Forbidden by the owner** - and it produced false conclusions once |
| The clipboard as a stand-in for delivery | **Refused by the owner** - *"I don't want the toxic app to use the clipboard"* |
| Re-adding PKO's mic switch / transcript watcher / focus tracker | **Removed on purpose** - a take made in another app was typed into PKO as well. Do not re-add |

### The instruments that exist (these are the tools, keep them)

1. **Stand-alone hook probe** - `.cache/hook-probe.ps1` (C# via `Add-Type`,
   `WH_KEYBOARD_LL`, never swallows, always `CallNextHookEx`). Logs timestamp,
   direction, `vkCode`, `scanCode`, `flags`, `dwExtraInfo` and the foreground
   window to `.cache/hook-probe.log`. **Installed 20:22:23. It is the only
   witness to the cut - do not dispose it until the fault is found.**
2. **PKO web-view probe** - `src/desktop/dictationProbe.ts`, installed in the
   app, recording to the web view's LevelDB. Read it with the FileShare trick
   (LevelDB is locked).
3. **Foreground sampler** - `.cache/fg-watch.ps1` → `.cache/fg-watch.log`.
   **Upgraded at 21:10** to log the **focused** window as well as the
   foreground one (via `GetGUIThreadInfo`), because a key is delivered to the
   focused window and the 20:43 run only captured the foreground. Writes a line
   on every change. **Restarted at 21:10, running for 4 hours.**
4. **Toxic's own log** - read over CDP (port 9333). Note: `window.__TAURI__`
   does **not** exist in the web view - use `__TAURI_INTERNALS__.invoke`.

### Verified command shapes

```powershell
# Toxic's log over CDP
cd 'V:\06_App\ProjectKO'; node .cache/toxic-log.mjs 9333

# The hook probe's log (every key event + foreground window)
Get-Content 'V:\06_App\ProjectKO\.cache\hook-probe.log' -Tail 40

# PKO web-view probe log (LevelDB is locked -> FileShare.ReadWrite)
$dir = "$env:LOCALAPPDATA\com.projectko.workspace\EBWebView\Default\Local Storage\leveldb"
Get-ChildItem -LiteralPath $dir -File | ForEach-Object {
  try { $fs=[System.IO.File]::Open($_.FullName,'Open','Read','ReadWrite'); $ms=New-Object System.IO.MemoryStream; $fs.CopyTo($ms); $fs.Dispose() } catch { return }
  $text = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
  foreach ($m in [regex]::Matches($text, '\d\d:\d\d:\d\d\.\d\d\d \| [^"\r\n]{0,260}')) { $m.Value }
}

# MCP dictation status (listening = PARTNER takes only)
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"dictation","arguments":{"action":"status"}}}'
Invoke-WebRequest -Uri 'http://127.0.0.1:8131/mcp' -Method POST -Body $body -ContentType 'application/json' -Headers @{Accept='application/json, text/event-stream'}

# Restart Toxic WITH the CDP door (current) / WITHOUT it (to close the door)
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9333'
Start-Process -FilePath 'V:\04_Projects\Toxic\src-tauri\target\release\toxic.exe' -WorkingDirectory 'V:\04_Projects\Toxic\src-tauri\target\release'

# Recoverable delete (standalone, literal target - PowerShell rm/Remove-Item are blocked)
& 'C:\Users\Bluze\.minimax\bin\mavis-trash.cmd' -- 'V:\06_App\ProjectKO\.cache\toxic-log.mjs'
```

### The code map

**Toxic** (`V:\04_Projects\Toxic`, read-only from here - changes become
tickets):
`src-tauri/src/hotkeys.rs` (`install`/`update_config` 1-97, `KEYS_SEEN` 120,
`chord_trace` 130-148, `Chord`/`check`/`check_now` 370-499, `active` 209-211,
`capture_active` 260-276, `win::run_hook` 584-618, `install_hook`/`keepalive`
620-640, `hook_proc` 754-769, `handle` 771-1046 incl. the chord branch
915-975) · `inject.rs` (`MARKER = 0x070C1C01` at 27, `PHYSICAL` 314,
`note_physical` 316, `physical_held` 327, `key_down`/`GetAsyncKeyState` 340-343,
`reconcile_modifiers` 357-375) · `dictation.rs` (`toggle` 10, `begin` 67-158,
`finish` 169-276, `deliver` 284-308, `partner_listening`) · `target.rs`
(foreground/label) · `mcp.rs` (`dictation` 280-291, `partner_listening` 366) ·
`commands.rs` (`logs_get` 245) · `engines/mod.rs` (800-line cap) · `lib.rs`
setup 103-110 · `api.rs` (**no log endpoint** - only `/health`, `/v1/models`,
`/v1/audio/*`) · `config.rs` · `hud.rs`

**Project KO** (`V:\06_App\ProjectKO`):
`src/desktop/terminalUnicode.ts` · `src/desktop/dictationProbe.ts` (probe
`code=` is `event.keyCode`; `interesting()` 112-116; `installDictationProbe`
133-181; storage key `mrmak.dictationProbe`, 300-line cap) ·
`src/desktop/TerminalPane.tsx` · `src/desktop/DesktopApp.tsx` ·
`src/desktop/dictationChord.ts` · `src/desktop/Chats.tsx` (**Ctrl+Shift+T** is
the new-chat chord; **Ctrl+T is unbound**) · `desktop/service/server.mjs` ·
`desktop/service/toxic.mjs` · `desktop/service/test/{terminal-unicode,
desktop-dictation-ui,dictation-probe}.test.mjs` ·
`src-tauri/src/win_key.rs` (own `WH_KEYBOARD_LL` at 42 + mouse hook, reinstalls
every 10 s at 67-74, callback always ends in `CallNextHookEx` at 139,
`INPUT_MARKER = 0x4d414b57`, injects `wVk 0xE8` Win-mask outside the callback) ·
`src-tauri/src/main.rs` (**no** Windows global shortcut)

---

## 4. Boundaries - the hard rules

These are not preferences. Breaking them wastes the session or damages the
owner's machine.

### The owner's rules

1. **Never control the owner's mouse or keyboard.** The owner is at the machine
   and is playing games. Ask the owner to press the key and report. Injection
   experiments are forbidden - they produced false conclusions once.
2. **No clipboard, anywhere.** Toxic must not populate the owner's clipboard on
   every dictation.
3. **Never publish, never push.** Commit freely when work is done and tested;
   never commit untested work.
4. **Free restarts of Toxic and Project KO are allowed** without confirmation.
   **Prefer Toxic** - a Project KO restart kills the live PTY sessions.
5. **Nothing may pop up.** Fixes must be silent.

### The project's rules

6. **The Toxic repo is read-only** from here, except writing the ticket into
   `V:\04_Projects\Toxic\ticket\`. That is explicitly authorized.
7. **Project KO stays engine-agnostic.** Never name an engine binary, port or
   process in product code. Prose "Project KO"; code `pKO` / `PkoMark` /
   `PkoLogo`.
8. **No IPC watchers or polling in the product path.**
9. **Evidence lives in `debug/toxic-stt-terminal/`** (per `AGENTS.md`).
   Cross-repo facts go in the Toxic ticket. **Every measurement is dated.**
10. **Register deliverables in `workspace/workspace.json`.** Never commit
    `.env`, credentials or runtime state.
11. **Scratch files are disposed in the same task** - render → measure → dispose.
    Recoverable delete only, one top-level literal target per call. Deepest
    first when a directory holds subdirectories.
12. **PowerShell has no bash heredocs.** Use `git commit -F <file>` or
    `git commit -m`.

### The testing rules

13. **Do not dictate to the agent while the chord is being tested.** The agent
    app is a *partner* of Toxic: the owner's speech to the agent is a partner
    take, and while a partner take is recording Toxic's hook passes every key to
    the app that owns the microphone - **including the chord**. The key arrives
    in the focused window with the right modifiers, no HUD opens, nothing is
    typed. That is indistinguishable from a broken chord, and it is what several
    of the recorded presses were most likely. **The test window has to be
    quiet.**
14. **A hypothesis moves to `ruled-out.md` only when a measurement kills it**,
    and the entry names that measurement. "I think it is not X" is not enough.
15. **Never re-run SendInput / hook-injection experiments.**

---

## 5. The hypothesis

### The primary hypothesis

**The key reaches the Project KO window by a path that does not go through the
`WH_KEYBOARD_LL` chain.** The evidence forces this: the stand-alone probe saw
*every* key that entered the chain (including a chord that Toxic swallowed) and
logged **zero** rows with Project KO in front, while the web view received the
same keys as ordinary keydowns.

Candidate mechanisms, in the order to try them:

1. **A raw-input / `WM_INPUT` path.** `RegisterRawInputDevices` with
   `RIDEV_INPUTSINK` delivers keyboard input as `WM_INPUT` messages and
   **bypasses the `WH_KEYBOARD_LL` chain entirely**. This is the best single
   explanation: the web view still gets a normal keydown, but no hook ever sees
   the key.

   **The WebView2 host is the most likely registrant.** The key arrives as a
   *DOM* event in a Chromium web view, so something turned a Windows input
   message into a DOM keydown. If the PKO window (or the WebView2 host)
   registers a raw input device, Chromium receives `WM_INPUT` and synthesises
   the DOM keydown itself - and the `WH_KEYBOARD_LL` chain never runs at all.
   Chrome itself does not behave this way (the same chord reached both hooks
   there), which fits a WebView2-host-specific registration.
2. **An input-sink registration** for the Project KO window.
3. **A posted `WM_KEYDOWN`** (`PostMessage`/`SendMessage`) into the Project KO
   window - also outside the chain.
4. **A synthesised DOM event** dispatched by the web view or the bridge.

**How to look:** grep the PKO dependency tree and the WebView2 host for
`RegisterRawInputDevices`, `RIDEV_INPUTSINK`, `RIDEV_EXCLUDEFROMCAPTURE`,
`RAWINPUT`, `PostMessage`, `SendMessage`, `WM_INPUT`. Note that
`src-tauri/src/win_key.rs` is **not** a delivery candidate - it only *reads*
keys and never posts any - but check whether it, or another module,
*registers* a raw-input device.

### The second variant that is still open: focus vs foreground

A key is delivered to the **focused** window, not to the foreground one. The
20:43 sampler recorded only `GetForegroundWindow()` - the **focused** HWND was
never captured. The sampler has been upgraded (21:10) to log both, via
`GetGUIThreadInfo`, and it is running again.

This variant was the sampler's own original hypothesis (see the header comment
in `.cache/fg-watch.ps1`): *a window that only has keyboard focus, because the
owner clicked inside it while another application owns the foreground, receives
keys without the operating system running the low-level hook chain*. The 20:43
foreground readings point away from it, but the focused HWND was never actually
measured - so it is **not** eliminated, only weakened. If the next test shows
the focused window is ever something other than the PKO window, that is a
delivery path of its own and must be eliminated before anything else.

### The secondary hypothesis (the newest suspect)

**The `hex.exe` pile.** Toxic's STT engine has **17 processes running**, one
started 19:18:42 with the current Toxic. Per
[`knowledge/hex-dictation-shortcut.md`](hex-dictation-shortcut.md), Hex reads
the foreground application for per-application modes, refuses windows it does not
accept, and with `share_dictation_shortcut` **off** it consumes the chord
instead of passing it on.

**Caution:** Hex's refusal would normally still be *seen* by a hook lower in the
chain, so this only explains the symptom if Hex consumes the chord *before* the
`WH_KEYBOARD_LL` chain runs - which is not how the chain is ordered. Treat it as
a suspect to test, not a conclusion. Killing the `hex.exe` pile and re-running
the two-press test is cheap.

### What is explicitly *not* the hypothesis any more

Toxic's chord decision, its modifier mask, its refusal logic, its hook
lifetime, the foreground window, elevation, and PKO's own hook have all been
measured and eliminated. **Do not go back to Toxic's chord code until a
measurement points there** - the ticket explicitly says *"Do not change the
chord decision yet."*

---

## 6. Where to continue

### Step 1 - the cheapest next test (owner's, ~1 minute)

**One plain character in each window, then Ctrl+T in each window.** Nothing
dictating, the agent idle. The foreground sampler is running (restarted 21:10)
and now logs the focused window as well as the foreground one - **check both
columns** in the result.

| Probe log for the PKO window | What it means |
| --- | --- |
| the plain character is logged, `Ctrl+T` is not | only Ctrl+<key> bypasses the chain - look at modifier handling specifically |
| neither is logged | **all** PKO input bypasses the chain - the raw-input / `WM_INPUT` path is the prime suspect |
| both are logged and Toxic's log shows a `front projectko.exe` trace | the chain is fine over PKO and the earlier presses were the artefact - re-test |
| nothing at all is logged for PKO while other windows still log | the probe itself is blind to that window |

This is a **one-question test**, and it is the owner's to run - ask, then wait.

### Step 2 - the search that needs no owner

Grep the PKO dependency tree and the WebView2 host for raw-input and posted
message APIs (§5) - `RegisterRawInputDevices`, `RIDEV_INPUTSINK`, `RAWINPUT`,
`WM_INPUT`, `PostMessage`, `SendMessage`. **The WebView2 host is the leading
candidate** (§5, candidate 1): the key arrives as a DOM event, so something
turned a Windows message into a DOM keydown, and a raw-input registration would
do exactly that while bypassing the hook chain. This needs nobody but the
machine.

### Step 3 - the cheap kill test

Kill the `hex.exe` pile (17 processes) and re-run the two-press test.

### Step 4 - only then, the design fallback

Route B - PKO drives a partner take itself - is documented and proven in
[`route-b-partner-take.md`](../debug/toxic-stt-terminal/route-b-partner-take.md)
but **not built**. It waits on the owner's B1/B2 decision (§9).

---

## 7. Running processes - do not interrupt

| Process | PID | Started | Note |
| --- | --- | --- | --- |
| `toxic.exe` | 36488 | 2026-11-24 19:18:41 | Started **with** `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` - the CDP door is open and **must be closed later** by restarting without it |
| `projectko.exe` | 18776 | 2026-11-24 16:47:14 | `V:\06_App\ProjectKO\src-tauri\target\debug\projectko.exe --repo V:\06_App\ProjectKO`. **Not restarted** - the PTY session is alive. Restarting PKO kills it |
| PKO service | 35724 | - | `http://127.0.0.1:57581` |
| `hex.exe` | 17 procs | oldest 11/23 | Toxic's STT engine. The newest suspect (§5) |
| Hook probe | bg task | installed 20:22:23 | `.cache/hook-probe.ps1` → `.cache/hook-probe.log`. **The witness - keep it** |
| Foreground sampler | bg task `bg_b09e1bd2` | restarted 21:10 | `.cache/fg-watch.ps1` → `.cache/fg-watch.log`, 4-hour run. **Upgraded to log the focused window too** |

---

## 8. Repos, base revisions, ownership

| Repo | Path | Branch | HEAD at handoff |
| --- | --- | --- | --- |
| Project KO | `V:\06_App\ProjectKO` | `feat/pko` | `10f5d64` + the commit that adds this document |
| Toxic | `V:\04_Projects\Toxic` | `master` | `3d4e86d` |

Both trees are clean except Toxic's untracked `.codegraph/` directory, which is
**not ours** - leave it alone.

**Toxic commits so far (unpushed):** `4e57aa3`, `2b675c1`, `32229ce`,
`98b287f`, `211f055`, `3d4e86d`.
**PKO commits so far (unpushed):** `55f5108`, `870895a`, `10f5d64` + this one.

**Ownership:** one agent owns this bug at a time. Do not work on it from two
sessions. The `debug/toxic-stt-terminal/` folder is the shared state - **re-read
it before applying anything**, and reconcile rather than overwrite another
agent's measurements.

**The Toxic ticket needs the 20:43 measurement added** - it is newer than the
ticket's 20:25 section. Add it to
`V:\04_Projects\Toxic\ticket\(open) 2026-11-24-dictation-chord-and-typing-target.md`
and commit there. That is the only write you have in the Toxic repo.

---

## 9. Open decisions for the owner

These are unanswered. They are the owner's calls, not yours.

| # | Decision | Note |
| --- | --- | --- |
| **B1/B2** | **B1:** PKO always drives a partner take. **B2:** PKO covers only a dead chord (the chord stays Toxic's). **Wait:** stay with Toxic. | Route B is documented and proven but unbuilt. Lower priority than the root cause |
| **Q1** | Kill the `hex.exe` pile as a test? | Cheap, reversible, but it interrupts Toxic's STT |
| **Q2** | Close the CDP door on Toxic now? | It should be closed once the fix is in; keeping it open is also how the log is read |

---

## 10. Acceptance checks

### Phase 1 - the chord opens a take over PKO

1. With Project KO in front and a PKO terminal focused, `Ctrl+T` opens a take:
   Toxic's listening bar appears, the microphone opens.
2. Toxic's log gains a trace with `front projectko.exe`.
3. The stand-alone probe logs the chord with `front=18776`.
4. Nothing else regresses: the chord still works in Chrome and in other apps.

### Phase 2 - the words arrive in the terminal

5. The owner speaks, finishes the take, and **the words print in the PKO
   terminal**.
6. The bridge path is exercised by a real take for the **first time** - record
   what lands, where, and in what form.
7. Watch for the **separate Toxic defect**: Toxic types into whatever has focus
   ~21 s later (`knowledge/request-toxic-typing-target.md`). If the words land in
   the wrong place, that is this defect, not a regression of Phase 2.

### Regression

8. `305` service tests (`298` pass, `7` skipped, `0` fail); the full UI suite
   green (`17` scripts); `desktop-dictation-ui.mjs` passing; `npx tsc -b`,
   `npx eslint src`, `npx vite build` clean. **All green as of this handoff.**
9. A take made in *another* application must **not** also type into Project KO.
   That regression is why the mic switch, the transcript watcher and the focus
   tracker were removed - do not re-add them.

---

## 11. What is implemented, what is verified, what is accepted

| Layer | State |
| --- | --- |
| **Baseline** | The dictation path as designed: Toxic owns the chord, the microphone, the recording, the typing; PKO owns the terminal bridge only. Built and committed before this session |
| **Proposal** | Unchanged. Route B is a documented alternative, not a decision |
| **Implemented** | The terminal bridge, the in-app probe, the debug folder, the two tickets. No product code changed for this bug - the fault has not been located yet |
| **Verified** | The 20:43 measurement and everything before it (see §1 and `evidence.md`). The fault is **window-specific to Project KO**, it is **not** the foreground window, **not** elevation, and **not** a dead Toxic hook |
| **Accepted by the owner** | The diagnosis so far. The chord decision, the PKO-owns-nothing design, and the no-clipboard rule are all accepted and closed |

**The one thing nobody has proven:** *why* the `WH_KEYBOARD_LL` chain does not run
for keys that reach the Project KO window. That is the job you are being handed.
