# The microphone key

Status: verified 2026-11-20 on v0.6.4.

The microphone and the conversation are two different accounts, and only one of
them needs a key.

- The **microphone** is an OpenAI Live session over WebRTC. It needs
  `OPENAI_API_KEY` in the repository `.env` (or in the service environment).
- The **conversation** needs no key. The composer talks to Mr. KO, and Mr. KO is
  Claude Code on the user's own login. See
  [the coordinator engine](coordinator-engine.md).

Local dictation is a third, separate path with no key at all; see
[local dictation](voice-dictation.md).

## What the nose used to do

Pressing the nose opened the microphone, the browser asked for permission, and
only then did the service discover that there was no key. The failure arrived as
a red banner: "Add OPENAI_API_KEY to the repository .env, then press the nose
again."

That was true and irrelevant at the same time. The key is required for the
microphone, but nothing about the conversation needed it, and the banner was
displayed as a fault of the whole feature. It also asked for microphone
permission that could not be used for anything.

## Where the nose lives

The nose **starts** the microphone; the bubble beside it only **opens** the
conversation that the microphone produces. Chatspace has its own dictation
(the Toxic chord and the microphone in the composer), so on 2026-11-24 the nose
moved out of the Chatspace header and into Vaultspace alone, where the voice
conversation is started. The Chatspace header keeps the conversation toggle,
and the button that opens Vaultspace carries the pink mark that used to sit
in the header.

The Chatspace and Vaultspace are two windows of one app, so the voice is still
reachable from either side - but the control lives in one place.

## What it does now

`state.voice.configured` is computed in the bootstrap from the same key the
service uses. `LiveVoice.start()` checks it first:

- With a key, the microphone opens as before.
- Without a key, no microphone is requested, no permission prompt appears, and
  the panel shows one muted line: "The microphone needs an OpenAI key in the
  repository .env. You can talk to Mr.KO by typing." There is no error and no
  red banner.

The service still answers `/api/live/session` with a plain 503 ("The microphone
needs an OpenAI key in the repository .env.") for the case where the key
disappears between the bootstrap and the request. The UI does not reach that
path while the flag is false.

The flag is refreshed on bootstrap and on a websocket reconnect, so a key added
while the app is open takes effect after a reload of the window, not
immediately.
