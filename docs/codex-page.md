# The codex page

A codex tab is a **reading room**. The app draws the room; you write what is
in it. The layout is `codex` on the tab document — see
[the editable tab format](editable-cards.md) for the file itself.

## The shape

| where | what |
| --- | --- |
| left rail | the tab's name, the words *a reading room*, the **abstract**, then the contents |
| middle | one measured column of prose |
| right | the **dotted track**: one dot per section, the one the reader is in marked, and it jumps on click |

The rail is 250 px; the column is 760 px. The reader scrolls the column; the
rail stays. The contents in the rail mark the section the reader is in, so the
reader never has to hunt for where they are.

## The four rules

1. **No scrollbar.** The dotted track is the page's scroll affordance: it says
   where the reader is *and* it navigates, and a scrollbar only says one of
   those. The app hides the scrollbar wherever the track is; a narrow window
   keeps the scrollbar and drops the track, because a replacement that is not
   there is worse than the thing it replaces. Do not put HTML in a card that
   brings a second scrollbar back.
2. **The abstract is a breath.** The rail's abstract is the opening of the
   tab's `summary`, capped at **two sentences and twenty words**. Write that
   opening as a whole sentence that stands on its own, and the cap never
   bites. A paragraph in the rail is a wall in front of the contents.
3. **The summary is an introduction.** The column shows all of it, in
   Markdown, at the top of the page. Keep it to what an introduction is — a
   paragraph or two. Everything longer belongs in a card.
4. **Open with prose, not with a heading.** The rail skips a leading heading,
   so a summary that opens with `# Something` gives the rail an abstract that
   begins mid-thought. The column then opens on the sentence that says what
   the page is.

## The fields

```json
{
  "format": "pko-tab",
  "version": 1,
  "layout": "codex",
  "summary": "A first storyline draft, written to the decided design rather than over it.",
  "nodes": [
    { "kind": "section", "id": "pitch", "title": "The pitch", "note": "What the story is." },
    { "kind": "card", "id": "pitch-1", "title": "The order", "body": "The prose of the section, in **Markdown**." }
  ]
}
```

- `summary` — the introduction. The rail takes its opening; the column shows
  all of it.
- A **section** is a heading and holds nothing. `title` names it; `note` is the
  one line under it.
- A **card** is a block of prose. `body` is **Markdown**, so a table is a table
  and a fenced block is code on the page. An aside is a blockquote that opens
  with a marker — `> [!WARNING]`, `> [!QUESTION]` and the like — and in the
  codex layout it stays in the column.

## Before you hand it over

Open the page in the app at a wide width and read it as a reader would:

- no scrollbar on the right; the dotted track is there, and the dot of the
  section you are in is marked;
- the rail's abstract is one or two short sentences, and the contents sit
  above the fold under it;
- the column is one measure of prose: a heading, its note, then its cards.
