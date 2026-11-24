# Toxic as the voice layer

Status: verified 2026-11-23 on Toxic 1.2.0 with Project KO 0.6.4. Dictation
changed on 2026-11-24 - see [the dictation memory](dictation-memory.md).

Project KO no longer owns a speech engine. Speech to text and text to speech both
go through the [Toxic](https://github.com/anomalyco/hex) desktop app on the same
machine, over Toxic's MCP server. Toxic keeps Hex for transcription and Pocket TTS
for speech. On the desktop Project KO records nothing and asks Toxic for nothing:
**Toxic owns the chord, the microphone and the typing**, and the words land in
whatever has the focus. Only the phone still records in the page and uploads the
audio for the `transcribe` tool.

## What was removed

- **Hex bridge** — `desktop/service/hex-bridge.mjs`, `GET /api/hex`,
  `POST /api/hex/dictation`, the `hexShortcut` setting, and the Hex microphone in
  Conversation and the terminal. The terminal still swallows the chord so the CLI
  never receives `^T`, but the chord is Toxic's alone: nothing in Project KO
  listens for it.
- **Chatterbox** — `local-read-aloud.mjs`, `chatterbox-tts.py`,
  `chatterbox-setup.py`, the Kokoro `local-read-aloud.py` that was no longer
  wired, and the install/voice-clip UI. The read aloud pane now reports Toxic as
  the engine and keeps only the speaking-speed setting.
- **The desktop dictation switch and its watcher** (2026-11-24) — the microphone
  in the composer, the microphone in the chat toolbar, the transcript watcher, the
  focus tracker, the `POST /api/dictation/listen` route and Toxic's `dictation`
  MCP call. Project KO no longer opens a take, reads a transcript or polls
  Toxic. What is left is the terminal's bridge, which receives the text Windows
  injected - see [the dictation memory](dictation-memory.md).

## Where Toxic lives

This machine's checkout is `V:\04_Projects\Toxic` (Toxic 1.2.0, commit
`802c024`), and the running executable is
`V:\04_Projects\Toxic\src-tauri\target\release\toxic.exe`. Project KO does
not hardcode that path: it reads `%APPDATA%\app.toxic.desktop\mcp.json` on
launch and again after a failed call. The checkout is where to look when the MCP
contract changes (`src-tauri/src/mcp.rs`), when engine start/stop needs checking
(`src-tauri/src/engines/pocket.rs` and `hex.rs`), or when rebuilding Toxic from
that folder.

## How the service finds Toxic

Toxic writes `mcp.json` on every launch:

```json
{ "transport": "http", "url": "http://127.0.0.1:8131/mcp", "port": 8131, "version": "1.2.0", "pid": 22064 }
```

`desktop/service/toxic.mjs` reads it (or `PKO_TOXIC_DIR`), caches the address for
30 seconds, and re-reads it after a failed call. The token in `api.json` is not
needed: the MCP endpoint is loopback-only and unauthenticated. `GET /health` on
the same port reports `{ status, version, stt, tts }` and is used for readiness.

## Calls

Both calls are JSON-RPC 2.0 `tools/call` requests to the single `/mcp` URL:

- `transcribe { audio_base64 }` → `{ content: [{ type: "text", text }] }`.
  Hex needs 16 kHz mono PCM WAV, so `desktop/service/audio-format.mjs` runs the
  browser recording through ffmpeg (`PKO_FFMPEG` overrides the executable).
  WebM/Opus, MP4/AAC, OGG and WAV are accepted; a WAV without ffmpeg installed is
  sent unchanged. ffmpeg's pipe output leaves `0xffffffff` in the RIFF and data
  size fields, which Hex rejects as `invalid-audio`; `finalizeWav()` fills in the
  real sizes from the bytes received.
- `speak { text, speed }` → a base64 WAV resource. Project KO always sends
  `speed: 1`: it applies its own pitch-preserving playback speed, and Toxic's
  configured 1.5× would otherwise compound.

`desktop/service/toxic-read-aloud.mjs` keeps the old player contract: one segment
at a time, in request order, a 64-segment cache, a per-surface cancel, and a
24-segment queue. `ToxicReadAloud.status()` reports one voice, `Toxic`; the
voice itself is chosen in Toxic's Text to speech pane.

The label names Toxic and nothing else. Whatever speaks behind the wrapper is
Toxic's business, so Project KO never names the engine in the interface - not
in the read-aloud bar, not in the settings, not on the phone. The engine is
described in this note and in the ticket for the Toxic repository, which is
where it belongs.

For the phone and the optional fallbacks, `MobileDictation` has a `toxic` provider
(the default) next to Local Whisper and the paid providers. It health-checks
Toxic only when that provider is selected, so listing providers never starts a
process.

## Dictation is Toxic's, entirely

Status: the partner arrangement below shipped in Toxic `fbbd015` and was used by
Project KO until 2026-11-24. Project KO does not use it any more: the microphone
switch, the transcript watcher and the `dictation` MCP call are gone, and the
tool is Toxic's to keep for its own use. The brief that produced it stays in
[the handoff](handoff-toxic-dictation.md).

Toxic's `dictation` MCP tool still exists, and it still drives Toxic's own
listening mode:

| Action | Effect |
| --- | --- |
| `start` | Toxic opens its microphone, plays its start cue and shows the `Listening` HUD |
| `stop` | Toxic stops, transcribes with Hex and returns the transcript as text |
| `cancel` | Toxic throws the take away |
| `status` | `{ listening, last }` - `last` is Toxic's newest transcript |

Project KO calls **none** of these. Its desktop dictation path has no IPC at
all: Toxic's own chord opens the take, Toxic records it, and Toxic types the
words into the focused window.

Three rules in `src-tauri/src/dictation.rs` and `hotkeys.rs` describe what a
*partner* take does, for any app that wants one:

- **No paste.** A partner take never pastes; the transcript goes back to the
  caller. Otherwise the words would be typed twice, or into whichever window
  happened to have focus.
- **No keystroke ends it.** Toxic's hook normally ends a take on any key press.
  While a partner owns the recording it only handles `Esc` (cancel), so typing in
  the composer cannot swallow the take. Toxic's maximum recording length still
  applies.
- **The HUD says so.** It reads `Click the microphone again to finish · Esc to
  cancel` instead of `Any key to finish`.

Toxic is a machine-wide tool, so its transcript history also holds takes made in
other applications. Those words belong to the window that had the focus when the
take ended, and they stay there: Toxic typed them, Project KO never reads the
history, and it never types them a second time.

## The chord is Toxic's alone

Toxic installs a low-level keyboard hook for the speech-to-text chord (`Ctrl+T`
here) and swallows the key before any window sees it. Measured 2026-11-24, it
does not always act on it: **the chord opens a take over Notepad and does
nothing at all while a Project KO window is in front.** No HUD, no take, no
history entry - the key simply arrives in the web view and dies there.

Until 2026-11-24 Project KO answered the chord itself, by asking Toxic to
listen over the `dictation` MCP tool. That takeover is gone. What is left in
Project KO is the terminal's **guard**: the chord is swallowed there so the CLI
never receives `^T`, and nothing else happens.

The chord label is still read from Toxic's own configuration
(`toxicShortcut()` in `desktop/service/toxic-launch.mjs`), so a rebind in Toxic
is followed without a second hardcoded `Ctrl+T`.
`src/desktop/dictationChord.ts` parses it once.

What is still wrong is on Toxic's side, and it is written up as a ticket for
that repository: [the request](request-toxic-chord.md). With the takeover gone,
a dropped chord means no dictation in Project KO at all, so the owner should
keep Toxic in **chord mode**, where the hook swallows the key machine-wide.

## The terminal receives Toxic's typing

Toxic types the transcript into the focused control with `SendInput` and
`KEYEVENTF_UNICODE`. Measured 2026-11-24, those keys left both the conversation
composer and the xterm empty - but the composer is an ordinary field, so the
words do arrive there; only a terminal dropped them. xterm v6 cancels the
keydown Chromium reports for a unicode packet (key code 229), so the text is
never inserted and the terminal sees nothing.

`src/desktop/terminalUnicode.ts` bridges that gap: it keeps the packet away
from xterm, takes the text over from the terminal's own field and writes it to
the terminal. No clipboard is involved. The whole arrangement is in
[the dictation memory](dictation-memory.md).

A Toxic older than `fbbd015` has no `dictation` tool and answers
`unknown tool: dictation`. That only matters to a partner app now - Project KO
does not call the tool.

## A mounted guard has to survive StrictMode

`src/main.tsx` renders inside `<StrictMode>`, and in development React runs every
effect, its cleanup, and the effect again. A guard written as
`useEffect(() => () => { alive.current = false }, [])` therefore leaves
`alive.current === false` for the life of the component: the switch called
`start`, Toxic's HUD appeared, and the control stayed `starting` - disabled, deaf
to Escape, and unable to stop the take. Set the flag in the effect body as well
(`useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])`).

Diagnosed 2026-11-24 by attaching Playwright to the running window over CDP: the
service answered `start` in 14 ms with `{ listening: true, owner: "project-ko" }`
while the button still read `Toxic is starting`. See
[restarting the app](restarting-the-app.md) for that technique. The switch itself
is gone; the lesson stands for every mounted guard in the app.

## Toxic has to be running

The chat no longer wakes Toxic. Nothing in Project KO starts the app any more,
so Toxic has to be open before its chord does anything. The read-aloud pane
reports a short note with **Check again** when Toxic is closed, and the
dictation provider status says "Toxic is not running"; the desktop chord is
silent until the app is open.

`desktop/service/toxic-launch.mjs` still knows how to find Toxic, for the
record:

1. `PKO_TOXIC_EXE`, when set.
2. `%LOCALAPPDATA%\Programs\Toxic\Toxic.exe`, either `Program Files` folder, and
   `%LOCALAPPDATA%\Toxic\Toxic.exe`.
3. The target inside a Start Menu `Toxic*.lnk`, read from the shortcut bytes
   (a `.lnk` stores its path as ANSI and again as UTF-16). This is how the dev
   checkout at `V:\04_Projects\Toxic\src-tauri\target\release\toxic.exe` is
   found on this machine.
4. `/Applications/Toxic.app` on macOS, opened with `open -a`.

## Verification performed

Live, against the running app:

| Check | Result |
| --- | --- |
| `ToxicClient.health()` | `{ running: true, stt: "ready", tts: "ready", version: "1.2.0" }` |
| `ToxicReadAloud.synthesize` | 151,724-byte `RIFF/WAVE` |
| `ToxicReadAloud.status().label` | exactly `Toxic`, and no engine name in it |
| `ToxicReadAloud.synthesize`, 2026-11-24 after the restart | 144,044 bytes, `RIFF/WAVE`, 24 kHz mono 16-bit, in 411 ms |
| Read-aloud bar, live in the window (2026-11-24, after the restart) | the owner clicked the speaker and heard the reply read aloud; the bar showed **Toxic** and nothing else |
| SAPI speech → WebM/Opus → `toWav16k` → MCP `transcribe` | "Please review the animation and confirm the timing." |
| Service `GET /api/read-aloud` | engine `toxic`, ready, one voice |
| Service `GET /api/dictation` | provider `toxic`, available; five choices |
| Microphone switch, live (2026-11-24, removed 2026-11-24) | `start` → HUD `Click the microphone again to finish`, `stop` → transcript inserted into the composer |
| `Esc` while listening, live (2026-11-24) | take cancelled, switch back to idle, no words inserted |
| `Ctrl+T` in the window, live (2026-11-24, before the fix) | no take opened, nothing inserted; the chord belonged to nobody |
| `Ctrl+T` in the window, live (2026-11-24, with the takeover) | the window asked Toxic to listen, Toxic's HUD appeared, the words were pasted into the CLI; the CLI never received the chord |
| Unicode packet into the terminal, automated (2026-11-24) | the words arrive once, an ordinary key is typed once, a composition is left alone, the clipboard is never touched |
| Project KO's contact with Toxic, automated (2026-11-24) | no take requested, no polling, no microphone switch in the window |

The unit suite (`npm run desktop:test`) passes 304 tests (297 pass, 7 skipped, 0
fail), and `npm run build` completes.

## The empty-audio trap

The first `speak` attempt returned "The engine returned no audio". The cause was
not Project KO: an **orphaned** `pocket-tts.exe` from an earlier Toxic session was
still listening on port 8124 and answered `/tts` with a 44-byte WAV header and no
samples. Toxic had adopted it as an external server. Stopping that process made
Toxic start a fresh engine on the next request, and `speak` then returned audio.
If Toxic reports that its TTS engine returned no audio, use Toxic's tray command
**Restart engines** (or close Toxic and reopen it) before changing Project KO.

Measured again on 2026-11-24, the same trap with the numbers on it:

| Check | Result |
| --- | --- |
| Process on port 8124 | `pocket-tts.exe`, started an hour **before** the current Toxic, its parent long gone |
| `POST /tts` (form field `text`) | **HTTP 200, 44 bytes** - a RIFF header and no samples |
| `GET /health` | `tts: "ready"` the whole time: the wedged server answers `/health` |
| MCP `speak` | "The engine returned no audio" |
| After stopping that one process | Toxic started its own engine and `speak` returned 170,684 bytes of 24 kHz mono audio |

Toxic's `pocket.rs::ensure()` adopts **any** server that answers `/health` on its
port, and `stream()` only restarts the engine when the request *fails* - a 200
with an empty body is a success, so the recovery never runs. The defect and the
fix are written up for that repository:
[the request](request-toxic-tts-engine.md).

**Project KO does not know the engine, and must not.** It asks Toxic and reads
the answer: there is no reference to `pocket-tts.exe`, to port 8124 or to any
process anywhere in the code, and there must not be one. Toxic is the interface;
what sits behind it is Toxic's business, including recovering from a wedged
engine. So Project KO's part is to say what the owner can do - the read-aloud
bar now reads *"Toxic's speech engine answered with no sound. Right-click the
Toxic tray icon and choose Restart engines, then try again."* instead of
repeating the engine's own words. It never kills a process it does not own.

## Where the old engine went

On 2026-11-23 the Chatterbox folder from
`%LOCALAPPDATA%\ProjectKO\voice\chatterbox` was moved to
`V:\06_App\Archived\Chatterbox` (8.27 GB, 46,288 files; robocopy reported
zero failures). Its `ARCHIVED.md` records the original location, the size and
how to put it back. No Project KO code references that folder any more.

## Limits

- Toxic must be running. If it is closed, its chord does nothing, the dictation
  provider reports "Toxic is not running" and read aloud shows a short note with
  **Check again**; there is no silent fallback to another engine.
- The desktop dictation path asks Toxic for nothing, so a Toxic that cannot be
  reached simply cannot dictate. The chord defect that made this visible is
  written up as [a request](request-toxic-chord.md).
- Converting a non-WAV recording needs ffmpeg on `PATH` or in `PKO_FFMPEG`.
  Without it, only WAV recordings transcribe.
- Toxic synthesizes one request at a time. Project KO keeps its own queue, and
  the first request after Toxic launches may wait for the model to load.
- The MCP endpoint has no token. Do not expose port 8131 through a tunnel or
  reverse proxy.
