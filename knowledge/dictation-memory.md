# Dictation: the memory of this feature

Status: rewritten 2026-11-24, after the chord stopped reaching Toxic over a
Project KO window and the terminal began to open the take itself.

This note is the record of how dictation came to work the way it does, so the
next change does not have to rediscover it. The short version: **Toxic owns the
microphone, the recording and the transcription. Project KO's terminal owns the
chord inside Project KO - it is the only place the chord arrives - and it asks
Toxic for a take. The words come back to the terminal that asked for them.**

The attempts that **did not** work are in
[dictation-failed-attempts.md](dictation-failed-attempts.md). Read it before
changing this path: it lists the removed designs, the experiments whose
conclusions were invalid and the theories that were disproved, so a dead patch
is not tried a second time.

## The shape now

| Step | Whose work |
| --- | --- |
| The chord, in a Project KO terminal | the terminal catches it (it already did, to keep `^T` from the CLI) and asks Toxic for a take |
| The chord, in any other application | Toxic's own system-wide hook, unchanged |
| The recording | Toxic's microphone, its HUD and its cues - always |
| The words | Toxic hands the transcript to Project KO, which writes it into the terminal that asked |
| The terminal | Project KO's own input stream - no clipboard, no focus guessing |

There is no transcript Project KO fetches from a history, no history it
watches, no focus it infers and no microphone switch in the chat. The
desktop dictation path talks to Toxic exactly twice per take: once to open it
and once to close it.

## Why the terminal has to open the take

**A global chord shortcut cannot reach a Chromium web view on this machine.**
The WebView2 host takes the keyboard as **raw input** (`WM_INPUT`), so the
ordinary keyboard message - the one the low-level hook chain
(`WH_KEYBOARD_LL`) runs on - is never generated for a key that goes to the
Project KO window. Toxic's hook is never called; the **page** gets the key
instead, as a trusted DOM keydown, because Chromium builds it from the raw
packet.

Measured on 2026-11-24, the same physical chord in two windows:

| | Project KO | Notepad |
| --- | --- | --- |
| the chord happens | yes | yes |
| the low-level hook chain | **never called** | called, matched, a take opened |
| the app | a trusted `keydown` (`TRUSTED=1`, `composing=0`) | n/a |
| the words | never typed | typed |

So there is nothing for Toxic to be wrong about: its hook is never asked. The
one place the chord arrives is the terminal, and that is where the take is
opened from. Toxic still does everything that matters - the microphone, the
recording, the transcription - and a **partner take** hands the transcript back
to the app that asked for it instead of typing it, which is why the words land
in the terminal that asked and nowhere else.

The owner approved this on 2026-11-24 (Route B in
[`.debuglog/route-b-partner-take.md`](../.debuglog/route-b-partner-take.md)).
It replaces the standing decision that Toxic owns the chord alone, and that
decision rested on the chord reaching Toxic - which is measured to be false.

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

## What came back, and why

One thing came back on 2026-11-24: the **partner take**. What came back is
narrower than what was removed.

| Back | Where it is | What it does |
| --- | --- | --- |
| The partner take | `desktop/service/toxic-dictation.mjs`, `POST /api/dictation/take` | the terminal opens a take and closes it; the transcript comes back in the answer |
| The MCP call | `ToxicClient.dictation()` in `desktop/service/toxic.mjs` | the same call the old button made |

What did **not** come back, and must not:

- **no transcript watcher** - the transcript comes from the take this app
  started, in the answer to its own stop call;
- **no focus tracker** - nothing is typed into "whatever has the focus";
- **no microphone switch in the chat** - the chord in the terminal is the only
  trigger;
- **no clipboard** - the words are written into the terminal's input stream.

The defect that killed the old arrangement - *a take made in another
application was typed into Project KO as well* - cannot come back, because a
partner take is never typed anywhere. It comes back to the app that asked.

## The chord, and where it is caught

Toxic's chord is read from Toxic's own configuration
(`toxicShortcut()` in `desktop/service/toxic-launch.mjs`), so a rebind in Toxic
is followed without a second hardcoded `Ctrl+T`.
`src/desktop/dictationChord.ts` holds the parser and the matcher.

The terminal **swallows** the chord, so the CLI never receives `^T`. That was
true before the partner take came back and it is true now: the chord is never
a control character in the terminal.

What changed is what the terminal does with it. It asks Toxic for a take:

| Key | What happens |
| --- | --- |
| the chord, in a terminal | `POST /api/dictation/take {action: "start"}` - Toxic's bar appears, Toxic takes the microphone |
| the next key | the take ends (`action: "stop"`), and the key never reaches the CLI |
| the words | the transcript is written into that terminal's input stream |

The chord in **every other application** is unchanged: Toxic's own hook opens
the take and types the words there. Those words belong to that application
and stay there - which is exactly what the watcher used to get wrong.

An agent terminal submits the spoken words. A shell terminal only shows them,
so a spoken sentence never runs itself as a command.

## The delivery: where the words land

**In the terminal that asked for them.** A partner take returns the transcript
to the caller instead of typing it, so there is no focus to infer, no window
to guess and no wait for whatever happens to be in front.

This is what the old path could not do. Toxic types its transcript into **the
window that has the focus when the typing starts**, and the typing starts
only after the speech engine has finished. Measured on 2026-11-24:

| Moment | Clock |
| --- | --- |
| the chord is pressed in a Project KO terminal | 15:46:47 |
| the take is finished with a key | 15:46:48 |
| the transcript is ready | 15:47:08 |
| the words are typed (after a 1.5 s wait for the modifiers) | ~15:47:09.5 |

**Twenty-one seconds** between the chord and the words, and they land in
whatever was in front by then. That defect is Toxic's and is written up as
[a request](request-toxic-typing-target.md); it still applies to a take made
in another application. It does not apply to a take Project KO opened itself.

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
- `desktop/service/test/toxic-dictation.test.mjs` - the take on its own: it
  opens, it hands the transcript back, a cancelled take says nothing, the state
  is asked for rather than guessed, and a refusal from Toxic travels.
- `desktop/service/test/desktop-dictation-ui.mjs` - the real window with a real
  xterm: an ordinary key is typed once, a packet arrives once, two packets in a
  row arrive in order, a composition is left to the terminal, **the chord opens
  a take and the words land in the terminal**, the chord never reaches the CLI,
  the clipboard is never touched, and Toxic is never polled.

The UI test was run against the code without the bridge and failed there with
an empty terminal, so it holds the behaviour rather than describing it.

**The live check passed on 2026-11-24**: the owner pressed `Ctrl+T` in a
Project KO terminal, Toxic's listening bar appeared, they spoke, the next key
ended the take and the words landed in that terminal. The measurements behind
it are in [`.debuglog/m-2026-11-24-2308-pko-press-measured.md`](../.debuglog/m-2026-11-24-2308-pko-press-measured.md)
and [`.debuglog/m-2026-11-24-2330-route-b-working.md`](../.debuglog/m-2026-11-24-2330-route-b-working.md).

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
