# Toxic as the voice layer

Status: verified 2026-11-23 on Toxic 1.2.0 with Project KO 0.6.4.

Project KO no longer owns a speech engine. Speech to text and text to speech both
go through the [Toxic](https://github.com/anomalyco/hex) desktop app on the same
machine, over Toxic's MCP server. Toxic keeps Hex for transcription and Pocket TTS
for speech; Project KO only records, normalizes and plays audio.

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

For dictation, `MobileDictation` gained a `toxic` provider (the default) next to
the optional Local Whisper and paid providers. It health-checks Toxic only when
that provider is selected, so listing providers never starts a process.

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
