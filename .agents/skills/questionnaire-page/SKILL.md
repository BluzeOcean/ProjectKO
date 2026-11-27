---
name: questionnaire-page
description: Create or maintain a Project KO questionnaire page — a form where the owner types the answers to the questions a project still owes an answer to — with one question per field, a writer that merges, and answers that can be read back elsewhere.
---

# Questionnaire page

A questionnaire page is **a form, not a document**. Every other page in a board
delivers information: cards, sections, a design note, a summary. A questionnaire
page does the opposite — it asks, and the owner types. If the page still looks
like the pages around it, it is not finished.

Read `workspace-authoring` first: it carries the registry, the tab document
format and the shared report skin. This skill carries what is different about
a form.

## The shape

- **One column.** One question at a time, one field under it. No rail, no
  second panel and no live-preview column beside the form. A form is not a
  report; do not dress it as one.
- **One section per question, one input field per question.** The question is
  the heading; the field is a textarea the owner types into. Do not add fields
  the owner did not ask for — no separate "position", "alternatives",
  "measurements" inputs, no per-question metadata editors. If the reasoning
  behind an answer is worth keeping, it is authored in the record and written
  by an agent or a chat, not typed into a second form.
- **Never ask a question whose answer is already known.** A decided record is
  an answer, not a question. It belongs on the aspect page that explains the
  subject and in the read-only view of the answers. Ask only what the project
  still owes an answer to, and check the records before writing the questions.
- **Never frame a question from a source project's model.** A project that
  draws on another game, a jam or a prototype is not that thing. A question
  like *"one unit or a squad, like the source?"* carries its own answer inside
  it — the source is not a premise. Ask what **this** project is, and let the
  source's facts sit on the aspect pages as evidence. If the questions can be
  answered by pointing at the source rather than at the project, they are the
  wrong questions: write them from the game's own idea instead.
- **One tab per round.** A round is a set of questions about one theme; a later
  round is a **new tab**, not a new field set and not a second page. The tab
  name carries the round (`Round 1`), and the round's title and note live with
  the questions.

## The look — the part the shared skin decides for you

The shared report skin styles **by tag**: `body > main` gets a width cap and no
padding, a `header`/`section`/`figure` that is a direct child of `main` gets a
panel background, and `h1` gets its own size and measure. A page built on those
tags looks different inside the app than in a plain browser, and usually worse.
So:

- **Build the page from `div`s with classes.** Give the page one container
  (`<div class="q-page">`) with its own `max-width` and its own padding, and
  keep `main`, `header` and `section` out of it.
- **Give every rule the page's own hook** —
  `html[data-mak-report=document] body.<page> .thing { … }`. That outranks the
  skin's element rules wherever the report is opened, in the app or in a
  browser. A rule written as `.thing` can lose to the skin and quietly take
  the layout away.
- **Give every `var()` a fallback** (`var(--mak-accent, #f0a0b0)`), so the page
  still looks right if the skin is absent or its tokens change.
- **Give it design elements that earn their place**: a progress row (one mark
  per question, filled as it is answered, and "N of M answered"), an *answered*
  chip that appears while the owner types, and a card per question so the eye
  can find one question at a time.
- **Look at it in the app, not only in a browser.** A headless render through a
  plain static server does not reproduce the app's iframe, and the difference
  is exactly where the skin's rules bite.

## The data

The questions are **data, not markup**. One record per question in a JSON file
the board already owns (the decisions file is the usual home), and the record's
answer field is what the form writes:

```json
{ "id": "IP-D02", "round": "round-1", "status": "open",
  "question": "What does a match produce, and what wins?",
  "hint": "One line of background, and where the rest of it lives.",
  "decision": "", "landing": { "roadmapId": "IP-012", "area": "design" } }
```

The form renders the questions from that file, shows the answers it finds
already there, and writes back **only the answers**. A record with a `round` is
a question; a record without one is a decision already taken.

The page's own files sit at the **board root**, not inside the page folder. A
report runs under a Content-Security-Policy of `connect-src <its own folder>`
(the app's own policy is `desktop/service/files.mjs`), so the grant is per
folder: a page in a subfolder cannot read the data folder at all, and a POST
out of the folder is refused outright. At the board root the form can read its
questions and show the answers; it still cannot save from inside the app.

## The writer

A browser cannot write to the vault, so saving needs a small loopback writer
(a few dozen lines of Python or Node). Two rules make it safe:

- **Merge, never replace.** The posted fields are overwritten; every field the
  post does not carry is left exactly as it was. A record is authored — the
  position, the rejected alternatives, the measurements — and a saved answer
  must not wipe the reasoning.
- **Version it.** The writer stamps a version on the file and in its reply, and
  the form checks it before it writes. A stale instance running an older build
  is refused with a message instead of being allowed to mangle the records.

Inside Project KO the POST is refused by the browser, so the button has to have
a way out that is not a POST: when it cannot reach a writer it downloads the
record file itself, with the answers merged in, and says so in one line.

## The buttons: no footer, no commentary

The owner's rule, settled over two screenshots: **the form has no footer and
no explanatory text.** What it has is the one control, at both ends of the
questions.

- **One button, twice: top right before the first question, bottom right after
  the last.** Both save. Not a footer bar, not a row of buttons, not a
  paragraph explaining what the buttons do.
- The button writes through the writer when it can reach one, and when it
  cannot — inside Project KO, where the browser refuses the POST — it
  downloads the record file itself and says so. The fallback belongs to the
  button, not to a second button beside it.
- **No description of the button under it.** Where the answers go belongs in
  the README or the handoff, not on the page. A form that explains itself is a
  form that has become a document.
- The status line is for the outcome — *Saved 2 answers*, *Nothing to save* —
  and it belongs beside the button that was pressed, one line, transient.
- A footer bar is not a place for a form: it takes the space a question needs
  and pins itself over the content. Buttons at the two ends do the same job in
  none of that space.

## Registering it

- The page id **is** its folder name; the title carries the readable name.
- Page tags come from the closed list: `game-mechanics`, `game-idea`, `ui`,
  `sound`, `3d`, `2d`, `animation`.
- Each round is a tab with `"viewer": "report"` and a `path` **relative to the
  board's folder**. Naming the file after the round (`questionnaire-round-1.html`)
  lets the page find its own round without a query string the tab path cannot
  carry.
- Validate the registry before you save:
  `node -e "import('./desktop/service/vault-schema.mjs').then(m=>{const fs=require('fs');console.log('OK v'+m.validateRegistry(JSON.parse(fs.readFileSync('<vault>/workspace.json','utf8'))).version)})"`

## One place asks, one place answers

The form asks and writes. The aspect pages inform — they carry the background
the question points at. The board page shows the answers, read-only, so the
owner can see what they saved without opening the form again. Do not grow a
second answering surface, and do not let the form and a board page both write.

## Before you hand it over

- The form renders: every question, one field each, prefilled with the answer
  already on disk, and nothing that is not a question.
- A save round-trip: the answer is written, the authored fields of the record
  survive it, and no other file in the board changed.
- `node --check` on the page's script; the registry validates; a headless render
  of the page shows the questions and the fields, and the console is clean — a
  thrown error in the script leaves a page that looks fine and does nothing.
- The page is opened in the app itself — the tab strip, the one tab per round,
  the field that takes typing, and the layout, which is the part the skin
  decides.

The worked example this skill was written from — the IronPath board's
Questionnaire page — was withdrawn on 2026-11-27, because its questions were
framed from the EpicJam2026 jam rather than from the game. Its `questionnaire.css`
and `questionnaire.js` are still parked on that board, and the rules above are
what a replacement would be built from.
