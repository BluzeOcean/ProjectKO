# Dictation: the memory of this feature

Status: written 2026-11-24, after the chord was given back to Project KO and
before the cross-application leak was closed.

This note is the record of how dictation came to work the way it does, so the
next change does not have to rediscover it. The short version: **Toxic owns the
microphone, Project KO owns the words, and a take belongs to the window that had
the focus when it ended.**

## The three paths into a take

| Path | Who opens the take | Who types the words |
| --- | --- | --- |
| The microphone in the composer | Project KO, through the `dictation` MCP tool | Project KO, from the transcript the tool returns |
| The chord inside a Project KO window | Project KO, when the chord reaches the window | Project KO, the same way |
| The chord in another application | Toxic's own system-wide hook | Toxic, with `SendInput` into the focused control |

The first two are one path: the microphone and the chord both call
`POST /api/dictation/listen` with `start`, and the words come back with `stop`.
The third is the one that keeps the text out of the wrong window, and the one
this note is mostly about.

## Why the window answers the chord itself

Toxic's hook swallows its chord before any window sees it - but only outside a
Project KO window. Measured on 2026-11-24: the same chord opens a take over
Notepad and does nothing at all with a Project KO window in front, no HUD and no
history entry. The measurements and the earlier Hex findings are in
[hex-dictation-shortcut.md](hex-dictation-shortcut.md); the defect on Toxic's
side is written up as [a request](request-toxic-chord.md).

The sweep was taken out once on the premise that Toxic's hook always wins, and
that left the chord belonging to nobody: the terminal swallowed it and nothing
answered. It is back, in `src/desktop/DictationButton.tsx`:

- the chord is **parsed once, from Toxic's own configuration**
  (`toxicShortcut()` in `desktop/service/toxic-launch.mjs`), so a rebind in Toxic
  is followed without a second hardcoded Ctrl+T;
- `src/desktop/dictationChord.ts` holds the parser and the matcher, and both the
  window and the terminal use them;
- the terminal swallows the chord, so the CLI never receives `^T`.

## Who owns the take

The service keeps one flag, `pkoTake`, in `desktop/service/server.mjs`:

- `start` sets it, unless Toxic answers *already listening* - then the take
  belongs to Toxic and the service says so (`owner: 'toxic'`);
- `stop` hands the transcript back **only** when the take is ours. A take Toxic
  owns has already been typed by Toxic, so handing it back as well would insert
  the same sentence twice.

Project KO therefore owns only the take its own press opens: the same press
closes it, Escape throws it away, any other key finishes it, and a reload takes
an open take back over.

## The path for a take Toxic opened

Keys injected by another process never reach a web view, so the words of a take
Toxic typed cannot be read back from the window. They are collected from Toxic's
transcript history instead, by `src/desktop/useToxicTranscripts.ts`, which polls
`/api/dictation/listen` with `status` and takes the newest transcript.

Two guards keep that path honest:

- the service reports `owner: 'toxic'` for a take it did not open, and the
  service refuses to hand that transcript back twice;
- the watcher checks the field before it writes. `fieldHasWords` reads the
  focused field, and the terminal view passes `alreadyThere`, which reads the
  xterm rows - Toxic's typing is visible in the terminal, so it is not repeated.

**The leak that was found on 2026-11-24.** Toxic is a machine-wide tool: its
chord opens a take in any application, and its words are typed into whichever
window has the focus. The watcher read Toxic's history, which holds *every* take
on the machine, so a take made in Chrome was delivered into the Project KO
terminal as well. Two things let that happen:

1. the watcher only advanced its watermark while the document had the focus, so
   a transcript made elsewhere was still waiting when the window was focused
   again, and was delivered then;
2. the only focus test was `document.hasFocus()`, which is a statement about the
   document and not about the window the person is working in.

The rule that replaces both: **a transcript belongs to this window only when the
take ended while this window had the focus.** Three guards carry it, in
`src/desktop/useToxicTranscripts.ts`:

- `src/desktop/windowFocus.ts` says whether the window has the focus now, and
  since when it has held it without a break. It watches the window's own focus
  and blur events, because a web view behind another window can still report a
  focused document; the document's focus state answers only while no event has
  arrived. The tracker is a module of its own, so each window of the app keeps
  its own answer.
- a transcript made before the current focus period began is not ours: the take
  ended while another application had the focus, and Toxic typed the words there.
- a transcript older than a few poll cycles was made while this app was not
  watching, so it belongs to that application too. This guard holds even when
  the window cannot say whether it has the focus.

The watcher never writes while the window is unfocused, and it writes at most
once per sentence.

## What is verified

- `desktop/service/test/dictation-listen.test.mjs` - the service route: start,
  stop, cancel, status, and a take Toxic owns.
- `desktop/service/test/desktop-dictation-ui.mjs` - the real window: the switch
  opens and closes a take, the chord opens a take and never reaches the CLI,
  Escape cancels, a take Toxic ends alone is recovered, the conversation keeps
  the words as a draft, a missing Toxic asks for an install, and a take made in
  another application stays in that application.
- `desktop/service/test/dictation-focus.test.mjs` - the focus tracker: the
  window's events win over a document that still claims the focus, and a new
  focus period is remembered.

The cross-application case was checked against the code before the fix and
failed there with the words of another window in the composer, so the test holds
the behaviour rather than describing it.

## Limits

- Toxic's chord still does nothing when it is pressed with a Project KO window in
  front; the window answers it itself instead. The real fix is Toxic's, and is
  written up in [request-toxic-chord.md](request-toxic-chord.md).
- Keys injected by another process never reach a web view - not even the
  terminal in this app - so the words of a take Toxic typed are collected from
  Toxic's history instead. That is why the terminal needs its own paste path,
  and why its words are checked against the visible rows before they are added.
  The conversation composer is a normal field and receives Toxic's typing
  directly.
- Project KO must stay engine-agnostic: it names Toxic and never an engine
  binary, a port or a process.
- The window answers whether it has the focus through the web view's own focus
  events, with the document's focus state as a fallback. If a platform ever
  delivered neither, the freshness rule still keeps a take made elsewhere out
  of this window - but only for the few seconds after it was made.
