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
  Conversation and the terminal. The terminal's Ctrl+T now toggles Project KO's
  own recorder. Toxic's machine-wide double-tap Ctrl is left to Toxic.
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
24-segment queue. `ToxicReadAloud.status()` reports one voice,
`Toxic · Pocket TTS`; the voice itself is chosen in Toxic's Text to speech pane.

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
| `status` | `{ listening, last }` — `last` is Toxic's newest transcript |

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

The button polls `status` while listening. When Toxic ended the take itself
(Escape, or the maximum length) the newest `last` transcript is inserted, so a
take is never lost silently.

## The shortcut inside a chat

Toxic's dictation chord does not reach Toxic while a Project KO window is in
front: it is delivered to the system (a stand-alone hook and a registered hotkey
both see it) but Toxic drops it there, exactly as Hex did before it. Measured
2026-11-24 over both windows; [the Hex note](hex-dictation-shortcut.md) records the
same measurement and the probe that ruled out an input bug on this side.

So a chat sweeps the chord up itself:

- `GET /api/dictation` reports Toxic's own setting (`hotkeys.sttChord` from
  `%APPDATA%\app.toxic.desktop\config.json`, when chord mode is on).
- `DictationButton` matches that chord at the window, swallows it, and calls the
  same service route as the button. Press it again to stop and insert the words.
- The terminal view keeps its own binding: xterm swallows the key and dispatches
  `mrmak-toggle-dictation`, so the conversation view's handler is skipped there
  and the chord never fires twice.

A Toxic whose chord is off, or that is set to double-tap Ctrl, reports no chord
and the chat binds nothing; the button still works.

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
| SAPI speech → WebM/Opus → `toWav16k` → MCP `transcribe` | "Please review the animation and confirm the timing." |
| Service `GET /api/read-aloud` | engine `toxic`, ready, one voice |
| Service `GET /api/dictation` | provider `toxic`, available; five choices |

The unit suite (`npm run desktop:test`) passes 279 tests, and `npm run build`
completes.

## The empty-audio trap

The first `speak` attempt returned "The engine returned no audio". The cause was
not Project KO: an **orphaned** `pocket-tts.exe` from an earlier Toxic session was
still listening on port 8124 and answered `/tts` with a 44-byte WAV header and no
samples. Toxic had adopted it as an external server. Stopping that process made
Toxic start a fresh engine on the next request, and `speak` then returned audio.
If Toxic reports that its TTS engine returned no audio, use Toxic's tray command
**Restart engines** (or close Toxic and reopen it) before changing Project KO.

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
