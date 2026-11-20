# Workspace overview (the board deck)

Status: approved by the owner on 2026-11-20; shipped in `6066179`.

The Workspace overview is a gallery of board thumbnails with a thin facts column
beside it, not a grid of cards. It was designed as a mock in `lab/` (Mock 1, page
one) and then ported into the app. Page two of that mock — the board detail page —
is still a mock and was deliberately left out: a deck tile opens the app's existing
board page instead.

## Where the page lives

| Piece | File |
| --- | --- |
| The page | `src/components/WorkspaceDeck.tsx` |
| Its styles | `src/styles/workspace-deck.css` |
| Layout and filter state | `src/App.tsx` |
| Per-board colour | `src/lib/boards.ts` (`boardHue`) |
| Tag labels and glyphs | `src/lib/categories.ts` (`categoryLabel`, `categoryIcon`) |
| The tag write | `src/lib/workspace.ts` (`updateWorkspaceEntity`) |

The grid it replaced is gone: `src/components/HomeGrid.tsx` and
`src/components/MakCard.tsx` were deleted together with their CSS in `global.css`,
`documents.css` and `entity-controls.css`.

## The shape of the page

- **Banner** — "Workspace" in Fraunces, a pink **+ New board** on the right, and the
  genre filter group on the banner's bottom row.
- **Stage** — a "Boards" label with a count, the thumbnail gallery
  (`repeat(auto-fill, 92px)`; 92px is the narrowest cell that still breaks every
  board name into two lines), and a bottom band.
- **Inspector** — a 400px column on the right: title, date, description, the current
  tag with its assign pills, the facts (status, updated, created, folder) and an
  "Open board" action.

The bottom band carries workspace-level facts only (`4 boards · 18 steps · last
change 2026-10-20`). The inspector carries facts, not cards.

## Decisions worth keeping

- **One mark only.** The mock's banner logo was dropped. The app's floating
  `.sidebar-reopen` nose is the single logo, and the banner's left padding clears
  it. Do not add a second mark to the banner.
- **The band sits 84px above the window foot.** The voice dock (`.voice-dock`,
  fixed left 26px bottom 23px in `src/desktop/desktop.css`) floats over the
  bottom-left corner, so `.deck-stage` carries `padding: 28px 34px 84px`. Without
  that clearance the band runs straight through the dock.
- **The banner replaces the topbar** on the overview page, because the mock has no
  topbar. `showingBoard` in `src/App.tsx` gates it; the topbar returns on the board
  page.
- **A tag is the entity's existing `category`.** Assigning one writes through the
  existing PATCH endpoint, so it survives a reload and needs no service change.
  `desktop/service/workspace.mjs` accepts only `status`, `category` and `pinned`,
  and a category must match `^[a-z0-9][a-z0-9-]{0,63}$`.
- **A board's colour is fixed** — `boardHue` hashes the id into a stable hue from
  amber, pink, blue, purple and green. Only the glyph follows the tag.
- **The status and tag edits live in the inspector,** not on the tile, because the
  mock's tile has no chip. The inspector's focus follows the board you point at and
  falls back to the first shown board; a re-sort can move that default, which is why
  the UI tests hover the tile first.
- **The genre list holds the categories present among the visible boards,** in deck
  order. The filter narrows the tiles; the band still describes the whole set.
- **Under 760px the page becomes one column** and the genre row scrolls sideways
  instead of clipping under the files rail.

## Verification

`desktop/service/test/workspace-edit-ui.mjs` drives the page in a browser
(`.deck-tile[data-card=…]`, `.deck-inspector`) and
`desktop/service/test/theme-ui.mjs` checks the palette. A live capture of the
running app reported zero console errors.

## Limits

- The board detail page is a mock, not a screen. A tile opens the existing board
  page (topbar and report viewer), which this work did not touch.
- The tag pills are disabled outside the desktop app.
