# Dictation

Dictation puts recognized text into the focused terminal or text field. Mr. KO's
voice assistant instead carries on a conversation and can call tools. You can use
either, both or neither.

Project KO's speech to text now goes through the **Toxic** app on this computer.
Toxic wraps Hex and publishes two loopback interfaces: an HTTP API and an MCP
server. The Project KO service reads Toxic's discovery file
(`%APPDATA%\app.toxic.desktop\mcp.json`) on first use and calls Toxic over
JSON-RPC. On the desktop Project KO sends no audio at all and asks Toxic for
nothing: **Toxic's own chord opens the take, Toxic records it and Toxic types
the words into the window you are in.** The phone still records in the page, and
that recording is converted to 16 kHz mono WAV with ffmpeg before the
`transcribe` tool sees it. No audio leaves the machine. See
[Toxic as the voice layer](toxic-voice.md) for the implementation and the checks
behind it.

## Choosing a provider

Desktop **Settings → Speech-to-text**, desktop **Phone settings**, and the phone's
own settings share one choice:

- **Toxic · local** — the default. Requires Toxic to be open; no key, no model
  download in Project KO.
- **Local Whisper · Free** — optional fallback, installed with
  `python scripts/setup-local-voice.py dictation` on Python 3.10-3.12. See the
  [local voice setup](../docs/mobile-access.md#optional-local-whisper-fallback).
- **OpenAI · Paid** / **OpenRouter · Paid** — explicit paid choices using a key
  from the computer's ignored `.env`.
- **Off** — microphone dictation is disabled.

Changes apply to the next transcription; text stays a draft. There is no
automatic fallback from one provider to another.

## Where the microphone is

- **Desktop chat and desktop terminal** — there is no microphone in Project KO
  any more. Toxic's own chord (`Ctrl+T` in chord mode, or its double tap) opens
  the take, Toxic records it and types the words into the window you are in.
  The composer is an ordinary field and takes them as they arrive; a terminal
  needed a bridge to receive them, because Windows delivers injected text in a
  way xterm drops - see [the dictation memory](dictation-memory.md).
- **Phone** — the microphone beside the attachment button records, uploads over
  the paired connection, and leaves the text as a draft for you to send.
- **Workspace Mak composer** — its microphone uses the same provider.

Toxic is a machine-wide tool, so its chord also opens a take in any other
application - Chrome, Notepad, a code editor. Such a take belongs to that
application: Toxic types the words where the caret is, and they stay there.
Project KO places nothing and reads no transcript, so a take made elsewhere can
never land here.

Toxic's own machine-wide shortcut is **double-tap Ctrl**. Project KO no longer
listens for that gesture on desktop, so the two apps cannot start recording at
the same time. On the phone, double-tap Ctrl belongs to the page.

## Testing it

Choose the language you actually speak, then test silence, a short phrase,
technical names and several recordings in succession. Verify recognition in a
plain text editor before relying on it in an agent terminal. A successful
microphone recording does not prove that text injection reached the intended
window. Do not auto-submit text while diagnosing dictation. Keep recordings,
transcripts and credentials out of a shared handoff.

If Toxic is closed, the provider reports "Toxic is not running" rather than
silently switching to another engine.
