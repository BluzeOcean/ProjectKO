# Toxic as the voice layer

Status: verified 2026-11-23 on Toxic 1.2.0 with Project KO 0.6.4.

Project KO no longer owns a speech engine. Speech to text and text to speech both
go through the [Toxic](https://github.com/anomalyco/hex) desktop app on the same
machine, over Toxic's MCP server. Toxic keeps Hex for transcription and Pocket TTS
for speech. On the desktop Project KO records nothing: a chat microphone asks
Toxic to listen, and Toxic's own recorder, HUD and Hex do the work. Only the
phone still records in the page and uploads the audio for the `transcribe` tool.

## What was removed

- **Hex bridge** — `desktop/service/hex-bridge.mjs`, `GET /api/hex`,
  `POST /api/hex/dictation`, the `hexShortcut` setting, and the Hex microphone in
  Conversation and the terminal. The terminal still swallows the chord so the CLI
  never receives `^T`, but the chord is Toxic's, and the window answers it by
  asking Toxic to listen.
- **Chatterbox** — `local-read-aloud.mjs`, `chatterbox-tts.py`,
  `chatterbox-setup.py`, the Kokoro `local-read-aloud.py` that was no longer
  wired, and the install/voice-clip UI. The read aloud pane now reports Toxic as
  the engine and keeps only the speaking-speed setting.

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

## Dictation is Toxic's listening mode

Status: verified 2026-11-24 against Toxic `23b65df` (`fbbd015 feat(mcp): let a
partner app drive dictation`). The tool exists and this route answers it; the
brief that produced it stays in [the handoff](handoff-toxic-dictation.md).

The chat microphone in **Chatspace** is a switch, not a recorder. Pressing it
calls the service route `POST /api/dictation/listen`, which calls the `dictation`
MCP tool on Toxic:

| Action | Effect |
| --- | --- |
| `start` | Toxic opens its microphone, plays its start cue and shows the `Listening` HUD |
| `stop` | Toxic stops, transcribes with Hex and returns the transcript as text |
| `cancel` | Toxic throws the take away (`Esc` in Project KO does the same) |
| `status` | `{ listening, owner, last }` — `last` is Toxic's newest transcript |

Three rules make a partner take behave differently from Toxic's own hotkey take,
in `src-tauri/src/dictation.rs` and `hotkeys.rs` (see the handoff for the code that
implements them):

- **No paste.** A partner take never pastes; the transcript goes back to the
  caller. Otherwise the words would be typed twice, or into whichever window
  happened to have focus.
- **No keystroke ends it.** Toxic's hook normally ends a take on any key press.
  While a partner owns the recording it only handles `Esc` (cancel), so typing in
  the composer cannot swallow the take. Toxic's maximum recording length still
  applies.
- **The HUD says so.** It reads `Click the microphone again to finish · Esc to
  cancel` instead of `Any key to finish`.

The button polls `status` while listening and reports `owner: "project-ko"` for a
take it opened, so a reload — or a surface that lost the component — can take the
switch back to `listening` instead of leaving an open microphone with no control.
When Toxic ended the take itself (Escape, or the maximum length) the newest `last`
transcript is inserted, so a take is never lost silently.

## The chord is Toxic's, and this window answers it too

Toxic installs a low-level keyboard hook for the speech-to-text chord (`Ctrl+T`
here) and is meant to swallow the key before any window sees it. Measured
2026-11-24, it does not always act on it: **the chord opens a take over Notepad
and does nothing at all while a Project KO window is in front.** No HUD, no
take, no history entry - the key simply arrives in the web view and dies there.

The old answer to that was to leave the chord alone and let Toxic have it. That
was wrong in the only way that matters: the chord then belonged to nobody. The
terminal swallowed the key (so the CLI never received `^T`) and dispatched
nothing, so pressing it in a terminal did exactly nothing at all. The binding
that answered it had been removed minutes earlier, on the assumption that
Toxic's hook always wins.

**Both answers are now in place**, and they do not fight:

- Toxic's hook is still the first to see the chord. When it acts, Toxic owns
  the take: its HUD reads `Any key to finish`, any key ends it, and Toxic types
  the transcript into the focused control.
- When the chord reaches a Project KO window instead, that window answers it:
  `src/desktop/DictationButton.tsx` listens for Toxic's chord (read from
  Toxic's own config) and toggles the same switch as the microphone, so
  Project KO asks Toxic to listen over the `dictation` MCP tool. Toxic opens
  its microphone, plays the cue and shows its HUD; the words come back to
  Project KO, which puts them where they belong.
- The terminal swallows the chord either way, so the CLI never receives `^T`.
  `src/desktop/dictationChord.ts` parses the chord once, and both the terminal
  and the switch use it, so a rebind in Toxic is followed without a second
  hardcoded `Ctrl+T`.

What is still wrong is on Toxic's side, and it is written up as a ticket for
that repository: [the request](request-toxic-chord.md).

Typing the transcript into the focused control is the part that does not reach
this window. Keys injected by another process do not arrive here: measured
2026-11-24, `SendInput` with virtual keys and with `KEYEVENTF_UNICODE` left both the conversation composer and the xterm empty, while
mouse input to the same controls worked. So Toxic's typing lands in ordinary
apps, and here the words are collected from Toxic's history instead: while the page
has focus, `src/desktop/useToxicTranscripts.ts` polls `dictation status` every
900 ms and hands a transcript newer than the surface's own mount to that surface.
It stays quiet when the field already holds the words, when Project KO inserted
them itself, and while Project KO owns a take — that one is returned directly.

A Toxic whose chord is off, or that is set to double-tap Ctrl, reports no chord and
the chat shows none; the button still works.

A Toxic older than `fbbd015` has no `dictation` tool and answers
`unknown tool: dictation`. The control turns that into one sentence — update
Toxic — instead of showing the protocol error. Measured 2026-11-24: the release
binary built at 00:34 advertises only `transcribe` and `speak`, while the source
at `23b65df` has the tool.

## A mounted guard has to survive StrictMode

`src/main.tsx` renders inside `<StrictMode>`, and in development React runs every
effect, its cleanup, and the effect again. A guard written as
`useEffect(() => () => { alive.current = false }, [])` therefore leaves
`alive.current === false` for the life of the component: the switch called
`start`, Toxic's HUD appeared, and the control stayed `starting` — disabled, deaf
to Escape, and unable to stop the take. Set the flag in the effect body as well
(`useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])`).

Diagnosed 2026-11-24 by attaching Playwright to the running window over CDP: the
service answered `start` in 14 ms with `{ listening: true, owner: "project-ko" }`
while the button still read `Toxic is starting`. See
[restarting the app](restarting-the-app.md) for that technique.

## Waking Toxic

The same button works while Toxic is closed. `desktop/service/toxic-launch.mjs`
asks `/health` first; when nothing answers it finds the app and starts it
detached, then waits up to 30 seconds for the MCP server:

1. `PKO_TOXIC_EXE`, when set.
2. `%LOCALAPPDATA%\Programs\Toxic\Toxic.exe`, either `Program Files` folder, and
   `%LOCALAPPDATA%\Toxic\Toxic.exe`.
3. The target inside a Start Menu `Toxic*.lnk`, read from the shortcut bytes
   (a `.lnk` stores its path as ANSI and again as UTF-16). This is how the dev
   checkout at `V:\04_Projects\Toxic\src-tauri\target\release\toxic.exe` is
   found on this machine.
4. `/Applications/Toxic.app` on macOS, opened with `open -a`.

Nothing found means the composer says **"Toxic is not installed on this
computer. Install Toxic, then press the microphone again."** The button stays
enabled, so the next press retries. A Toxic that starts but never answers its MCP
server reports its own message instead, which points at Toxic's MCP setting.

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
| Microphone switch, live (2026-11-24) | `start` → HUD `Click the microphone again to finish`, `stop` → transcript inserted into the composer |
| `Esc` while listening, live | take cancelled, switch back to idle, no words inserted |
| `Ctrl+T` in the window, live (2026-11-24, before the fix) | no take opened, nothing inserted; the chord belonged to nobody |
| `Ctrl+T` in the window, live (2026-11-24, after the fix) | the window asks Toxic to listen, Toxic's HUD appears, the words are pasted into the CLI; the CLI never receives the chord |

The unit suite (`npm run desktop:test`) passes 301 tests (294 pass, 7 skipped, 0
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

- Toxic must be running. If it is closed, dictation reports "Toxic is not running"
  and read aloud shows a short note with **Check again**; there is no silent
  fallback to another engine.
- Converting a non-WAV recording needs ffmpeg on `PATH` or in `PKO_FFMPEG`.
  Without it, only WAV recordings transcribe.
- Toxic synthesizes one request at a time. Project KO keeps its own queue, and
  the first request after Toxic launches may wait for the model to load.
- The MCP endpoint has no token. Do not expose port 8131 through a tunnel or
  reverse proxy.
