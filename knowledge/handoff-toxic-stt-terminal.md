# Handoff: the dictation chord never opens a take over a Project KO terminal

**Written:** 2026-11-24 21:10 (Asia/Shanghai).
**For:** the next agent who continues this hunt. You are picking up a
half-finished diagnosis, not a fresh feature.
**Status:** Phase 1 **open**. Phase 2 **untestable**. Root cause **not yet
proven** - but it is now measured, not guessed, and the measurement narrows the
fault to a single class of mechanism.

> **Read `.debuglog/README.md` first.** That folder is the working
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

> **CORRECTION, 2026-11-24 21:20 - the sentence above is wrong, and the truth
> is stronger.** Re-read against the raw log: there is **not one row of any
> kind** between `20:43:01.914` and `20:43:29.178` - 27.3 seconds with **no
> keyboard event at all**, not merely "no row with Project KO in front". The
> probe was alive on both sides of the hole (one session, one
> `SetWindowsHookExW`, no re-arm; the log continues to 21:01:45).
>
> Every process in the chain is at **Medium** integrity - measured properly
> this time with `GetTokenInformation(TokenIntegrityLevel)`; the 20:10 test
> used `OpenProcess(PROCESS_ALL_ACCESS)`, which only proves the shell could
> open each target, not that the levels matched. With equal levels, a
> physical keystroke *must* produce a low-level hook callback.
>
> **So the Ctrl+T the web view saw did not come from the keyboard at all.**
> Project KO itself is clean: no raw-input registration, no posted
> `WM_KEYDOWN`, no synthesised `KeyboardEvent`, no debugging door on its
> WebView2, no third-party DLL injected into the WebView2 processes.
>
> The live question is no longer *"what delivers a key to Project KO without
> the chain"* but **"what produces a key event inside the Project KO web
> view?"** - a posted `WM_KEYDOWN`, a protocol-driven input, or a DOM event
> synthesised in the page. `event.isTrusted` separates them.
>
> The measurements: [`.debuglog/m-2026-11-24-2115-chain-gap.md`](../.debuglog/m-2026-11-24-2115-chain-gap.md),
> [`.debuglog/m-2026-11-24-2113-token-integrity-levels.md`](../.debuglog/m-2026-11-24-2113-token-integrity-levels.md),
> [`.debuglog/m-2026-11-24-2118-pko-side-is-clean.md`](../.debuglog/m-2026-11-24-2118-pko-side-is-clean.md),
> [`.debuglog/m-2026-11-24-2120-focus-vs-foreground.md`](../.debuglog/m-2026-11-24-2120-focus-vs-foreground.md).

---

## 2. Memory pointers - read these, do not re-derive them

### The working log (the primary record)

`V:\06_App\ProjectKO\.debuglog\`

| File | What it holds |
| --- | --- |
| [`README.md`](../.debuglog/README.md) | The rules for the folder, the two phases, and the "do not dictate while testing" trap |
| [`symptom.md`](../.debuglog/symptom.md) | The symptom as first stated |
| [`evidence.md`](../.debuglog/evidence.md) | **Every measurement, dated, with its verdict.** 28 KB and chronological - read it last-to-first for the recent turns |
| [`ruled-out.md`](../.debuglog/ruled-out.md) | **The dead ends. Read this before trying anything.** Each entry names the measurement that killed it |
| [`open-questions.md`](../.debuglog/open-questions.md) | What is still unknown, and the next test |
| [`attempts.md`](../.debuglog/attempts.md) | The chronological attempt log |
| [`phase-1-chord.md`](../.debuglog/phase-1-chord.md) | Phase 1 in detail |
| [`phase-2-delivery.md`](../.debuglog/phase-2-delivery.md) | Phase 2 in detail |
| [`route-b-partner-take.md`](../.debuglog/route-b-partner-take.md) | The documented decoupling fallback (Route B), proven but **not built** |

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
[`ruled-out.md`](../.debuglog/ruled-out.md) with the measurement
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
9. **Evidence lives in `.debuglog/`** (per `AGENTS.md`).
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

**The Ctrl+T the web view received was never a keystroke.** The re-read of the
raw log (see the correction in section 1) shows that **no keyboard event of
any kind entered the system input path** during the 27 seconds Project KO was
in front, while the web view recorded two *complete* Ctrl+T presses inside
that hole. Every process is at Medium integrity, so a physical keystroke
cannot produce this: it would have produced a hook callback.

So the fault is **not** "the chain is cut for Project KO". It is: **something
produced a key event inside the Project KO web view without the keyboard
being involved.**

Candidate mechanisms, in the order to try them:

1. **A posted `WM_KEYDOWN` / `WM_SYSKEYDOWN`** into the WebView2 window
   (`msedgewebview2.exe` pid 33424 - the focused window, a different process
   from the foreground `projectko.exe` 18776) by another process on the
   machine. The browser process turns a keyboard message into the DOM keydown
   itself, and a posted message never touches the hook chain.
2. **A protocol-driven input** into the web view - CDP-style dispatch. The
   Project KO WebView2 has **no** `--remote-debugging-port`, so whoever would
   drive it has to open one, or reach it another way.
3. **A DOM event synthesised in the page** by code that is not in this
   repository (an extension, an injected script, a runtime dependency).

**What separates them: `event.isTrusted`.** `false` -> case 3. `true` -> case
1 or 2. The in-app probe records `isComposing` but not `isTrusted`
(`src/desktop/dictationProbe.ts:139`), so it is read live over CDP with the
Project KO WebView2 debug door open.

**Already ruled out on the PKO side** (see
`.debuglog/m-2026-11-24-2118-pko-side-is-clean.md`): no `RegisterRawInputDevices`,
no posted `WM_KEYDOWN`, no synthesised `KeyboardEvent` in `src/`,
`src-tauri/`, `desktop/`; no debugging door on the WebView2 host; and no
third-party DLL injected into `msedgewebview2.exe` (121 modules), its
renderers (21 each) or `projectko.exe` (55 modules). `win_key.rs` is not a
delivery candidate - it only reads keys and its one `SendInput` (a Win-key
mask) would have shown up in the probe log.

### The focus-vs-foreground variant: closed

A key is delivered to the **focused** window, not the foreground one, and the
sampler now logs both. When Project KO is in front, the focused window is
`msedgewebview2.exe` pid 33424 - the normal WebView2 arrangement. That
identifies the real target of every keystroke, but it is **not** a
delivery path: a key aimed at a focused window still travels the system input
path and still runs the chain. See
`.debuglog/m-2026-11-24-2120-focus-vs-foreground.md`.

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
a suspect to test, not a conclusion. The owner has authorised killing the pile
as a test; it is cheap and reversible.

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
dictating, the agent idle. The rebuilt probe (`.cache/hook-probe2.ps1`) logs
the foreground **and** the focused window, and the Project KO WebView2 runs
with the CDP door open so the page can be read for `event.isTrusted`.

| Probe log for the PKO window | `isTrusted` | What it means |
| --- | --- | --- |
| the keys are logged, `focus=33424` | - | **the OS path is intact** - the 20:43 hole was an artefact of the dead probe; the fault is Toxic-side again |
| nothing is logged | `false` | a **DOM event was synthesised in the page** - hunt the synthesiser |
| nothing is logged | `true` | a **message was posted or dispatched** into the web view - hunt the driver |
| the plain character is logged, `Ctrl+T` is not | `true` | only Ctrl+<key> takes the odd path - look at modifier/TSF handling |

This is a **one-question test**, and it is the owner's to run - ask, then wait.

### Step 2 - the search that needs no owner - DONE

Grep the PKO tree and the WebView2 host for raw-input and posted-message APIs:
**nothing**. `RegisterRawInputDevices`, `RIDEV_*`, `WM_INPUT`, `PostMessage`,
`SendMessage`, `dispatchEvent`, `new KeyboardEvent` - no hit outside
`window_identity.rs` (`SendMessageW(WM_SETICON)`) and the MCP SDK in
`node_modules`. The WebView2 host has **no** `--remote-debugging-port`, and
**no third-party DLL** is injected into `msedgewebview2.exe` (121 modules),
its renderers (21 each) or `projectko.exe` (55 modules). Filed as
`.debuglog/m-2026-11-24-2118-pko-side-is-clean.md`.

### Step 3 - the cheap kill test - AUTHORISED

Kill the `hex.exe` pile (17 processes) and re-run the two-press test. The
owner authorised this on 2026-11-24.

### Step 4 - only then, the design fallback

Route B - PKO drives a partner take itself - is documented and proven in
[`route-b-partner-take.md`](../.debuglog/route-b-partner-take.md)
but **not built**. It waits on the owner's B1/B2 decision (§9).

---

## 7. Running processes - do not interrupt

| Process | PID | Started | Note |
| --- | --- | --- | --- |
| `toxic.exe` | 36488 | 2026-11-24 19:18:41 | Started **with** `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` - the CDP door is open and **must be closed later** by restarting without it |
| `projectko.exe` | 18776 | 2026-11-24 16:47:14 | `V:\06_App\ProjectKO\src-tauri\target\debug\projectko.exe --repo V:\06_App\ProjectKO`. **Not restarted** - the PTY session is alive. Restarting PKO kills it |
| PKO service | 35724 | - | `http://127.0.0.1:57581` |
| `hex.exe` | 17 procs | oldest 11/23 | Toxic's STT engine. The newest suspect (§5). **Killing the pile is authorised as a test** |
| Hook probe | **DEAD** | 20:22:23 → 21:01:45 | `.cache/hook-probe.log` stopped at 21:01:45 and no process survives. Replaced by `.cache/hook-probe2.ps1` → `.cache/hook-probe2.log`: no I/O in the callback, a heartbeat every second, a re-arm every 10 s, foreground **and** focused window per event |
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
sessions. The `.debuglog/` folder is the shared state - **re-read
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
