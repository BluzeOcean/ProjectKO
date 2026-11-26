# Tab layouts (Gallery, Workbench and Pinboard)

Status: rewritten 2026-11-26 with the page layer. The layout is now a field of a
**tab document**, and the three layouts were sharpened so each does one thing.

## Where the layout lives

`layout` is a field on the **tab**, inside its `.tab.json` document
(`desktop/service/vault-schema.mjs`). It is not on the board and not on the page:
the document owns how it draws. Two tabs of one page can use different layouts.

The registry keeps no layout at all. That is why the only trace of one in the
workspace listing is the tab's name.

## The names, and where they are spelled

| what | where |
| --- | --- |
| `tabLayouts = ['gallery', 'workbench', 'pinboard']` | `desktop/service/vault-schema.mjs` |
| `layoutLabels` | same file |
| `layoutNotes` | same file, the one-line description under each choice |

The word is spelled once, in `layoutLabels`. The editor's layout select, the New
page panel's chips, the kicker on the tab and the CSS class all read from it, so
they cannot drift apart.

## What each layout does

- **Gallery** - a grid of cards; the picture sits on a 4:3 bed, the title and the
  notes under it. A card marked `wide` takes the full row.
- **Workbench** - one card per row; when the card has a picture it sits left and
  the copy right, so long notes stay readable.
- **Pinboard** - a wall of thumbnails. Choosing one opens the picture large with a
  pen over it, the feedback beside it and the hand-off at the bottom right
  (`src/components/Pinboard.tsx`).

## Sections and cards

A tab's blocks are one flat, ordered list. `kind: "section"` is a heading over the
cards that follow; it holds nothing. `kind: "card"` is the block a layout draws.
The renderer cuts the list into runs once (`runsOf` in `src/lib/blocks.ts`), and
the Pinboard inserts the heading into its own wall, so a section reads the same in
all three layouts.

## Setting a layout

- **At creation:** the New page panel's layout chips post the layout when the page's
  first tab is created.
- **Afterwards:** the tab editor's Layout select. Save rewrites the document;
  blocks, images, statuses and order are untouched.

## Open

- **Gallery and Workbench were nearly the same thing** before the renovation; the
  mocks in `lab/` (7-10) are the record of what was tried. They now differ by
  shape - grid versus rows - rather than by styling.
- **The deck never names a board's or a page's tags beyond the filter row.** The
  inspector lists them, and the tile glyph follows the first one.
