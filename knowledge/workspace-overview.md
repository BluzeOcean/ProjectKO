# Vaultspace overview (the board deck)

Status: approved by the owner on 2026-11-20; shipped in `6066179`.

The Vaultspace overview is a gallery of board thumbnails with a thin facts column
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
| The delete | `src/components/DeleteBoardDialog.tsx`, `src/lib/workspace.ts` (`deleteWorkspaceEntity`) |

The grid it replaced is gone: `src/components/HomeGrid.tsx` and
`src/components/MakCard.tsx` were deleted together with their CSS in `global.css`,
`documents.css` and `entity-controls.css`.

## The shape of the page

- **Banner** — "Vaultspace" in Fraunces, a pink **+ New board** on the right, and the
  genre filter group on the banner's bottom row, with "Archived (N)" at the far
  end of that row once the archive holds something.
- **Stage** — a "Boards" label with a count ("Archive" while the archive is
  open), the thumbnail gallery
  (`repeat(auto-fill, 92px)`; 92px is the narrowest cell that still breaks every
  board name into two lines), and a bottom band.
- **Inspector** — a column on the right: title, date, description, the current
  tag with its assign pills, the facts (status, updated, created, folder) and an
  action row: "Open board", "Archive" and a bin on its right. Its width is a
  share of the deck (`clamp(260px, 36%, 420px)`), not a fixed 400px, so the board
  list keeps the room the facts do not need.

The bottom band carries workspace-level facts only (`4 boards · 18 steps · last
change 2026-10-20`). The inspector carries facts, not cards.

## Putting a board away

Archiving is not new — a board has carried the status `archived` since the
start, the deck hides those boards and the sidebar has a "Show archive (N)"
toggle. But in the Vaultspace it was buried: the only way in was the tiny
status dot in the inspector, which opens a dialog where "Archived" is one of
three options, and the one place that listed the archive was the sidebar, which
is collapsed by default in the deck. The owner asked for an archive option in
the Vaultspace on 2026-11-25.

**Where the button lives.** "Archive" sits in the inspector's action row,
between "Open board" and the bin — the same row, the same height, in the quiet
clothes of the way in. Pink stays for the way in and red for the bin; archiving
is neither, so it wears the border of "Open board".

**The archive is a list of its own.** The deck shows one list at a time: the
working boards, or the archive. "Archived (N)" at the far end of the tag row
switches to it, and the stage label changes from "Boards" to "Archive". The
toggle only appears once there is something in it, so the deck stays quiet
until it is used.

**Putting a board away keeps its files.** Archiving writes the status
`archived` through the same PATCH endpoint the tag uses; the board's folder,
steps and media stay where they are. "Restore" brings it back to `active` in
one click.

**The empty archive is not a dead end.** When the last board is restored, the
deck goes back to the working boards by itself (`App.tsx` closes the archive
view when nothing is left in it), and the restored board is there.

**The status dialog still offers Archived.** The Archive button and the status
dot are two ways to the same thing; the dialog keeps its three options.

## Deleting a board

The deck had no way to remove a board: it could be archived, tagged, pinned and
renamed, and it stayed in the deck forever holding its folder and its steps.

**Where the button lives.** It is a small bin in the inspector's action row,
immediately to the right of "Open board" — the same row, the same height, the
only difference being that it is red. The owner chose this over a bin on the
board's own tile and over a button in the board's topbar (the three candidates
were mocked in `lab/`, mocks 15–17). The inspector already describes the board,
so the delete joins that description beside the way in.

**The colour rule.** Pink is the way in; a destructive act is red. The bin is
red-tinted at rest, because a transparent square on a near-black column could
not be seen — the owner said so and the mock was redrawn.

**One confirmation, and it names the board.** The dialog gives the board's name,
its step count (or the names of its steps when it has three or fewer) and its
folder, then says the files in that folder go with it. Cancel changes nothing.
There is no undo in Vaultspace: the board cannot be brought back.

**What the service does.** `DELETE /api/workspace/entities/:id` takes the entity
out of `workspace/workspace.json` (`Workspace.remove` in
`desktop/service/workspace.mjs`) and hands the board's folder to the system
trash through the native bridge, so the files can still be found if the delete
was a mistake. The service never deletes the user's files itself: the folder
travels to the Recycle Bin (Windows) or Trash (macOS) by the same path the files
rail uses.

**Order matters.** The registry is written first, the folder is trashed after.
If the trash step fails, the board is gone but the user's files are still where
they were — the safer direction to fail in. A board whose `folder` is not a
plain folder name is refused with a 400 and stays in the registry.

**A failed write must not poison the service.** The workspace write chain
(`this.writes`) is kept non-rejecting: a refused or failed write resolves the
chain instead of leaving a rejected promise behind, because the service's
shutdown awaits that chain and would otherwise fail with it.

**The deck refreshes only while the window is visible.** The delete writes the
registry and the note appears at once, but the board list is re-read by
`useWorkspace`, which skips the read when the window is hidden (`visibilityState`).
A delete made while the app is in the background therefore shows up when the
window comes back to the front, not the instant it was made. The registry and
the files are already correct at that point — only the list is behind.

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
- **The archive is a view of its own, not a filter on the working list.** The deck
  shows the working boards or the archive, never both. The sidebar's "Show archive
  (N)" keeps its own meaning — it adds the archived boards to the sidebar list —
  because a sidebar that shows only archived boards would be a strange thing to
  look at.
- **The genre list holds the categories present among the visible boards,** in deck
  order. The filter narrows the tiles; the band still describes the whole set.
- **The inspector follows the deck, not the window.** `.deck-page` is a size
  container (`container-type: inline-size`), and the column is sized and hidden by
  `@container deck`. The Files panel and the rail take their room from the deck
  whatever the window is wide, so a window query would answer the wrong question:
  the same 970px window leaves a 631px deck with the panel open and a 922px deck
  with it shut. Below a 540px deck the column leaves and the boards keep
  everything.
- **Under 760px the page stays one row.** It used to become one column with the
  inspector dropped under the deck. The genre row still scrolls sideways, and the
  deck measures itself; the inspector leaves instead of stacking.
- **The fallback is the fluid width, not the hiding.** A webview without container
  queries (WebKit before Safari 16, so macOS 11 and 12) keeps `clamp(260px, 36%,
  420px)` and never hides the column — narrow, but readable.

## Verification

`desktop/service/test/workspace-edit-ui.mjs` drives the page in a browser
(`.deck-tile[data-card=…]`, `.deck-inspector`) and
`desktop/service/test/theme-ui.mjs` checks the palette. A live capture of the
running app reported zero console errors.

The delete has its own pair: `desktop/service/test/board-delete.test.mjs` checks
the service (authentication, the registry write, the trash hand-off, and a board
whose folder is a path being refused), and
`desktop/service/test/board-delete-ui.mjs` drives the real UI — the bin shares
the row of "Open board", the confirmation carries the board's facts, Cancel
keeps everything, and Delete board removes the board and leaves the note.

The column's own behaviour has a test:
`desktop/service/test/deck-layout-ui.mjs` drives the real UI at three window
widths with the Files panel open and checks that the inspector gives room back
as the deck narrows, leaves when the deck cannot carry it, that the board list
never scrolls sideways, and that the files tree calls the project folder
**PROJECT-KO**.

The archive has its own:
`desktop/service/test/deck-archive-ui.mjs` drives the real UI and checks that
the deck says nothing about an empty archive, that "Archive" beside "Open
board" puts a board away in one click and leaves its files alone, that
"Archived (1)" opens the archive in the deck, that "Restore" brings the board
back, that the empty archive is not a dead end, and that the status dialog
still offers "Archived".

The port was also looked at in the shipping build, served by an isolated service
against a throwaway Workspace: the bin sits 8px to the right of "Open board" on
the same row and 37px tall, the dialog carries the board's name, its steps and
its folder, Cancel keeps all three boards, and after a delete the board is gone
from the deck, the note reads "TestGallery deleted. Its files went with it." and
the service hands the folder to the trash. No console errors.

## Limits

- The board detail page is a mock, not a screen. A tile opens the existing board
  page (topbar and report viewer), which this work did not touch.
- The tag pills are disabled outside the desktop app.
- The delete is disabled outside the desktop app too: the trash hand-off needs
  the native bridge.
- There is no undo. The board's files are in the system trash, but the board
  itself has to be made again.
