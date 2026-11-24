# The rig, durable, and what the other agent inherits (2026-11-24 22:15)

**Taken:** 2026-11-24 22:09-22:20 (Asia/Shanghai).
**By:** the agent that took over the handoff.

## The instruments, and how to read them

| Instrument | What it is | Log | How it dies |
| --- | --- | --- | --- |
| `.cache/hookprobe2.exe` | native `WH_KEYBOARD_LL`, **no I/O in the callback** (24 bytes into a ring buffer; all formatting on a worker thread), logs the foreground **and** the focused window | `.cache/hookprobe2.log` | Windows removes the hook if the callback misses `LowLevelHooksTimeout` - that is what silences the two PowerShell probes and, most likely, the original probe at 21:01:45 |
| `.cache/keypoll.ps1` | **no hook at all** - `GetAsyncKeyState` polling, the control that separates "the chain is cut" from "the keys never entered the system" | `.cache/keypoll.log` | - |
| `.cache/pko-keytrace.mjs` | in-page recorder over PKO's CDP door (9334): `isTrusted`, modifiers, target, `defaultPrevented` | in the page | - |
| Toxic's own log | read over Toxic's CDP door (9333) | - | the door is **open right now** |

The probes are started **detached** (`Start-Process -WindowStyle Hidden`),
because the harness reaps background bash tasks - two of them died that way
mid-session.

## What the other agent inherits (Toxic)

- **Toxic's chord works.** Its log shows `keyboard hook installed (pid 32648)`
  and every press `matched · starting a take`, typed into Notepad and into
  Windows Terminal.
- **The transcription is garbage**: the transcript itself is
  `Hello,ooooooHelloHello,.......` and `What are you ggggg`. The tail of the
  utterance degenerates into a repetition loop - the classic streaming-ASR
  hallucination on trailing silence. **This is engine-side (Hex), not
  Project KO and not the chord.**
- **Two orphaned `hex.exe` services were killed** (33288 and 37344, both
  parents dead - the owner authorised them). One engine remains, 43484,
  child of the live Toxic 32648. The hex pile was never the cause of the
  chord failure: all 16 processes killed at 21:37 were orphans of dead
  Toxic sessions, and the live Toxic spawns one engine at startup.
- **Toxic's CDP door (9333) is OPEN** and Toxic (pid 32648, started 22:09:23)
  was restarted by this agent with it. It must be closed by one more restart
  without `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` when the work is done.
- **Toxic's code, binary and configuration are untouched**: `hotkeys.rs`
  mtime 18:24:40, `toxic.exe` mtime 18:29:17, `config.json` holds
  `hotkeys.enabled true` / `sttChord "Ctrl+T"`.

## The correction this agent owes, and the one the record owes

The "the hook chain is dead" claim of
[m-2026-11-24-2155-chain-dead.md](m-2026-11-24-2155-chain-dead.md) was
**withdrawn**: it was the instrument, not the machine. The original 20:43
evidence - a hook that demonstrably worked for 39 minutes, logging thousands
of rows - stands unchanged, and its 27-second hole at 20:43 is real.

## The test that is ready

One press, in the Project KO terminal, with nothing dictating. It is read by
three instruments at once:

| Instrument | The question it answers |
| --- | --- |
| Toxic's log | is Toxic's hook called for the Project KO window? (`front projectko.exe`?) |
| `hookprobe2.log` | does the chain see the key at all, and which window was focused? |
| the in-page recorder | is the DOM keydown trusted (delivered by the browser from a Windows message) or fabricated inside the app? |
