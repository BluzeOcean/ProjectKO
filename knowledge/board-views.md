# Tab layouts (the card layouts and the document layouts)

Status: rewritten 2026-11-26 with the page layer; the four document layouts
added 2026-11-27. The layout is a field of a **tab document**, and each layout
does one thing.

## Where the layout lives

`layout` is a field on the **tab**, inside its `.tab.json` document
(`desktop/service/vault-schema.mjs`). It is not on the board and not on the page:
the document owns how it draws. Two tabs of one page can use different layouts.

The registry keeps no layout at all. That is why the only trace of one in the
workspace listing is the tab's name.

## The names, and where they are spelled

| what | where |
| --- | --- |
| `tabLayouts = ['gallery', 'workbench', 'pinboard', 'codex', 'margin', 'ppt', 'folio']` | `desktop/service/vault-schema.mjs` |
| `layoutLabels` | same file |
| `layoutNotes` | same file, the one-line description under each choice |
| `documentLayouts = ['codex', 'margin', 'ppt', 'folio']` | same file, and `isDocumentLayout()` |

The word is spelled once, in `layoutLabels`. The editor's layout select, the New
page panel's chips, the kicker on the tab and the CSS class all read from it, so
they cannot drift apart.

The seven layouts are two families. The **card layouts** arrange cards. The
**document layouts** read the tab as a document, and they scroll on their own —
the editor's scroller is taken out of the way (`.tab-editor.is-document`).

## The card layouts

- **Gallery** - a grid of cards; the picture sits on a 4:3 bed, the title and the
  notes under it. A card marked `wide` takes the full row.
- **Workbench** - one card per row; when the card has a picture it sits left and
  the copy right, so long notes stay readable.
- **Pinboard** - a wall of thumbnails. Choosing one opens the picture large with a
  pen over it, the feedback beside it and the hand-off at the bottom right
  (`src/components/Pinboard.tsx`).

## The document layouts

The card layouts answer "how are the cards arranged?". The document layouts
answer a different question: **"how does a reader move through a long document,
and what does the page do in their hands?"** They were drawn in `lab/layouts/`
and promoted on 2026-11-27; the drawings are the record of what was tried.

- **Codex** - a reading room. A rail down the left holds the tab's name, a
  plain-prose abstract and the contents; the contents marks the section the
  reader is in, and a dot rail on the right does the same and jumps on click.
  One measured column of prose.
- **Margin** - an editorial spread. The asides leave the text: a callout marked
  `> [!WARNING]` or `> [!QUESTION]` floats into a right gutter, beside the
  paragraph it belongs to. Everything else stays in the column.
- **PPT** - one section per screen, moved by the keyboard (arrows, space, Home,
  End) or the bar along the bottom, which shows where you are.
- **Folio** - sheets of A4 paper on a desk: a cover, a contents sheet, and one
  sheet per section, with running heads.

All four read the same flat list of blocks the editor edits. A heading is a
section, a card is a block of prose, and **a card's notes are Markdown** — so a
table or a piece of code inside a card is a table or a piece of code on the
page. An aside is a blockquote that opens with a marker:

```markdown
> [!WARNING]
> The thing that is not settled yet.
```

`NOTE`, `TIP`, `DECISION`, `WARNING`, `QUESTION` and `CAUTION` are the markers.
`WARNING` and `QUESTION` are the ones that float into the margin.

## Sections and cards

A tab's blocks are one flat, ordered list. `kind: "section"` is a heading over the
cards that follow; it holds nothing. `kind: "card"` is the block a layout draws.
The renderer cuts the list into runs once (`runsOf` in `src/lib/blocks.ts`), and
the Pinboard inserts the heading into its own wall, so a section reads the same in
every layout.

## Setting a layout

- **At creation:** the New page panel's layout chips post the layout when the page's
  first tab is created.
- **Afterwards:** the tab editor's Layout select, which groups the choices into
  *Cards* and *Documents*. Save rewrites the document; blocks, images, statuses and
  order are untouched.

## Open

- **Gallery and Workbench were nearly the same thing** before the renovation; the
  mocks in `lab/` (7-10) are the record of what was tried. They now differ by
  shape - grid versus rows - rather than by styling.
- **The deck never names a board's or a page's tags beyond the filter row.** The
  inspector lists them, and the tile glyph follows the first one.
- **The document layouts have no per-card furniture yet.** A card in a document
  layout is a title and its notes; it has no number, no status chip and no
  picture bed the way it does in the Gallery. The status chip and the picture
  are there; the number is not.
