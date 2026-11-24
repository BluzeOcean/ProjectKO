# Dictation: the memory of this feature

Status: rewritten 2026-11-24, after Project KO stopped asking Toxic for
anything at all.

This note is the record of how dictation came to work the way it does, so the
next change does not have to rediscover it. The short version: **Toxic owns the
chord, the microphone, the recording and the typing. Project KO places nothing.
The only thing Project KO had to build was a way for its own terminal to receive
the text Windows injects from another process.**

## The shape now

| Step | Whose work |
| --- | --- |
| The chord | Toxic's system-wide hook, which swallows the key before any window sees it |
| The recording | Toxic's microphone, its HUD and its cues |
| The words | Toxic types them into whichever window has the focus |
| The terminal | Project KO's bridge receives what Windows injected |

There is no take that Project KO opens, no transcript it fetches, no history it
watches, no focus it infers and no microphone switch in the chat. The desktop
dictation path talks to nobody.

## What was removed, and why

Until 2026-11-24 the desktop path worked like this:

- a microphone button in the composer called `POST /api/dictation/listen`, which
  asked Toxic's `dictation` MCP tool to open a **partner take** - a take Toxic
  records but does not type, because the caller was supposed to place the words;
- a watcher (`src/desktop/useToxicTranscripts.ts`) polled the same route every
  900 ms, read Toxic's transcript history and typed the newest sentence into the
  focused field;
- a focus tracker (`src/desktop/windowFocus.ts`) decided whether a transcript
  belonged to this window, because Toxic's history holds **every take on the
  machine**, including takes made in Chrome.

That arrangement was a workaround for a missing API, and it had a real defect:
a take made in another application was typed into Project KO as well. The fix
was three guards (focus now, focus period, freshness) - see the git history of
this file for the details. The real answer is that **Project KO should not read
Toxic's history at all**: Toxic knows which window the words went into, and
Project KO does not need to know, because Toxic types them there.

So on 2026-11-24 the whole watcher went away:

| Removed | Where it was |
| --- | --- |
| The microphone switch | `src/desktop/DictationButton.tsx`, `src/desktop/DictationComposer.tsx` |
| The transcript watcher | `src/desktop/useToxicTranscripts.ts` |
| The focus tracker | `src/desktop/windowFocus.ts` |
| The take route | `POST /api/dictation/listen` in `desktop/service/server.mjs` |
| The partner-take flag | `pkoTake` in the same file |
| The MCP call | `ToxicClient.dictation()` in `desktop/service/toxic.mjs` |

What is left is the chord guard in the terminal and the bridge below.

## The chord belongs to Toxic

Toxic's chord is read from Toxic's own configuration
(`toxicShortcut()` in `desktop/service/toxic-launch.mjs`), so a rebind in Toxic
is followed without a second hardcoded `Ctrl+T`.
`src/desktop/dictationChord.ts` holds the parser and the matcher.

The terminal **swallows** the chord, so the CLI never receives `^T`. That is
all that is left of the chord in Project KO: no listener, no takeover, no
request to Toxic. When Toxic is in its double tap mode the key can reach the
window, and the terminal drops it rather than letting the CLI see it.

Toxic's hook is global, so the same chord opens a take in Chrome, Notepad or a
code editor. Those words belong to that application and stay there - which is
exactly what the watcher used to get wrong.

**The defect on Toxic's side is still open** and is written up as
[a request](request-toxic-chord.md): the chord does not always reach Toxic
while a Project KO window is in front. With the takeover gone, a dropped chord
means no dictation in Project KO at all, so the owner should keep Toxic in
**chord mode** (`sttMode: "chord"`), where the hook swallows the key
machine-wide.

## The delivery: where the words land

Toxic types the transcript into **the window that has the focus when the
typing starts**, and the typing starts only after the speech engine has
finished. Measured on 2026-11-24:

| Moment | Clock |
| --- | --- |
| the chord is pressed in a Project KO terminal | 15:46:47 |
| the take is finished with a key | 15:46:48 |
| the transcript is ready | 15:47:08 |
| the words are typed (after a 1.5 s wait for the modifiers) | ~15:47:09.5 |

**Twenty-one seconds** between the chord and the words. A user who moves on in
that time gets the words in the wrong window. In that measurement the Project
KO windows received **nothing** - no packet, no inserted text - while the take
itself was recorded normally.

That is written up as [a request](request-toxic-typing-target.md): a take
should be typed into the window that started it. Until that is fixed the
practical rule is to stay in the window until the HUD clears.

## The bridge: how the terminal receives typed words

Toxic types its transcript with `SendInput` and `KEYEVENTF_UNICODE`. Windows
delivers such a packet to the focused control as a `VK_PACKET`, and Chromium
turns it into:

1. a `keydown` with `keyCode === 229` and `isComposing === false`, then
2. a `beforeinput` with `inputType === "insertText"` carrying the text.

An ordinary field takes that text without trouble. **xterm v6 does not**: its
keydown handler does not know the key code 229, so it cancels the keydown, and
a cancelled keydown stops Chromium from inserting the text into the terminal's
own field - no text event is fired and the terminal sees nothing at all.

That is **xterm's doing, not the browser's**. The packet does reach a web view.
Measured on 2026-11-24: a take typed by Toxic landed in another Electron app's
composer **character by character** (the stored draft grew from
`"I checked it and it doesn't work."` to the full sentence), so Windows
delivers the packet and Chromium inserts it wherever the focused field is an
ordinary one. Only xterm's cancellation stands between the packet and the
terminal - and removing that cancellation is what the bridge is for.

`src/desktop/terminalUnicode.ts` is the bridge. It does two things:

- on the terminal's keydown, when the key code is 229 and it is not a
  composition, it **stops the event before xterm sees it**. The browser keeps
  its right to insert the text, so the text event arrives.
- on the terminal's own field, a non-composing `insertText` is taken over:
  `preventDefault()` and `terminal.paste(data)`. The text is written to the
  terminal the way a keystroke is written, and it never sits in the field, so
  the terminal cannot see it twice.

The clipboard is never involved. `terminal.paste()` writes into xterm's input
stream; no `navigator.clipboard` call exists on this path, and the UI test
counts clipboard calls to keep it that way.

An IME composition is left alone (`isComposing` is true, and xterm's own
composition helper owns it), and an ordinary key is left alone as well - xterm
cancels its keydown, so the browser never inserts it and there is nothing to
take over.

## What is verified

- `desktop/service/test/terminal-unicode.test.mjs` - the bridge on its own: the
  packet is taken away from the terminal, the words arrive once, an ordinary key
  and a composition are left alone, the clipboard is not used.
- `desktop/service/test/desktop-dictation-ui.mjs` - the real window with a real
  xterm: an ordinary key is typed once, a packet arrives once, two packets in a
  row arrive in order, a composition is left to the terminal, the chord never
  reaches the CLI, the clipboard is never touched, and the app asks Toxic for no
  take and does not poll it.

The UI test was run against the code without the bridge and failed there with
an empty terminal, so it holds the behaviour rather than describing it.

The live check with the real Toxic - the words typed by an actual take landing
in the terminal - needs a person at the keyboard, because it takes the focus
away from whatever is in front. It is on the owner's list, not in the test
suite.

## Limits

- Project KO must stay engine-agnostic: it names Toxic and never an engine
  binary, a port or a process.
- The dictation **provider status** still asks Toxic whether it is running.
  That is the phone's transcription path (Toxic, Local Whisper, OpenAI,
  OpenRouter, off), a separate feature from the desktop take, and it is a
  single status read - not a watcher.
- Toxic types with `KEYEVENTF_UNICODE`, which a terminal can only show as
  characters a terminal font has. The bridge delivers the text; the terminal
  decides what to draw.
- The bridge is the only place where Project KO touches text from another
  process. If a future terminal library changes how it treats the key code 229,
  this is the file to look at first.
