# Board views (Gallery, Workbench and Pinboard)

Status: the second view was renamed **Workbench** on 2026-11-21. The third
view, **Pinboard**, was added on 2026-11-21 as well. The first two still lay
out the same entries almost the same way, and that is a known open question,
not an accident — see "Open" below.

## Where the view lives

The view is a field on the **card**, not on the board: `template` inside the
card document (`desktop/service/card-schema.mjs`). Every editable-card tab
carries its own view, so two card tabs on one board can differ.

The board never stores a view. The registry entity has no view field, which
is why the only trace of one in the workspace listing is a card-only board's
tab name.

## The names, and where they are spelled

| what | where |
| --- | --- |
| `cardTemplates = ['gallery', 'workbench', 'pinboard']` | `desktop/service/card-schema.mjs` |
| `cardTemplateLabels = { gallery: 'Gallery', workbench: 'Workbench', pinboard: 'Pinboard' }` | same file |
| `legacyCardTemplates = { research: 'workbench' }` | same file |
| `cardViewTabLabels` | same file — the tab names that came from a view |

The word is spelled **once**, in `cardTemplateLabels`. The panel's view
chips, the editor's View dropdown, the pink kicker on the card and the CSS
class all read from it, so they cannot drift apart. The list of the three
names in one sentence is derived from the same array, so it cannot go stale.

`cardViewTabLabels` holds the tab names that were written from a view
(Gallery, Workbench, Pinboard, and the old Research). A tab named by hand —
"Editable references", "Editable research" — is not in that map and keeps its
name.

## Setting and changing a view

- **At creation:** the "Starting view" chips in the New board panel
  (`src/components/NewCard.tsx`) post the template to
  `POST /api/workspace/cards`. The service stores it in the card file and
  names the new board's single tab after the view.
- **Afterwards:** the card editor's View dropdown, next to "Page title"
  (`src/components/EditableCard.tsx`), on the desktop editor only. Save
  rewrites the template; entries, notes, images, statuses and order are
  untouched. The layout is one CSS class, `card-template-${template}`.
- **On save** a single-tab board whose tab name came from the view has that
  tab renamed to follow the new view (`desktop/service/card-documents.mjs`).

## What the three views do today

- **Gallery** — `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`: a grid of
  boxed entries, the picture on a 4:3 bed, the title and the notes under
  it.
- **Workbench** — one entry per row; when the entry has a picture, the
  picture sits left and the copy right.
- **Pinboard** — a wall of thumbnails. Choosing one opens the picture large
  with a pen over it, the feedback beside it and the hand-off at the bottom
  right (`src/components/Pinboard.tsx`).

In the editor, an entry's "Image and prompt" block opens by default in the
Gallery view and stays collapsed in the Workbench unless the entry already
has an image.

## The Pinboard's three parts

| part | where | what it is |
| --- | --- | --- |
| the wall | `src/components/Pinboard.tsx` | the thumbnails, the pink hairline on the chosen one |
| the choice | `desktop/service/selection.mjs` | one click, one stored value, read on demand |
| the hand-off | `desktop/service/board-agents.mjs` | the chat a board remembers, and the message it receives |

The choice is **pull-based and event-driven**. One explicit click sets one
value in the service; the coordinator's context carries a compact pointer and
the `current_selection` tool pulls the full entry when an agent wants it.
There is no hover monitoring, no pointer position and no polling. Opening a
different board drops the choice.

The pen carries four colours because these pictures run from near-black silk
to a pale grey ground, and a mark has to read on both. Each stroke keeps the
colour it was drawn in.

The marked picture is composited in the **browser** — the service has no image
library — and uploaded through the existing card-image endpoint, then saved
into the card as `annotation`. The words go in as `feedback`. Both are read
by agents: `feedback` is part of the card's text.

## Open

- **The first two views are still nearly the same thing.** Four Gallery
  layouts were mocked in `lab/` (mocks 7–10: the app as it stands, and three
  picture-first ways) and **not chosen** — the Gallery stays as the app
  draws it. The mocks are kept as the record of what was tried.
- **The deck never names a board's view.** The panel's "What this board
  brings" line does name it, which is a thin promise while the first two
  layouts look alike. The owner will decide after using the app more; the
  line keeps its current wording until then.
- **The rename and the panel arrived together.** The panel was ported from
  the lab first, then the view was renamed, and the shared files
  (`card-schema.mjs`, `card-documents.mjs`, `NewCard.tsx`,
  `editable-cards.css`) carry both. Splitting them would leave a commit
  whose tests do not pass.
- **The Pinboard was mocked three ways** in `lab/` (mocks 12–14: a modal
  over the dimmed wall, a drawer from the right, and a split into two panes)
  and the **modal** was chosen: the picture is the whole point, and a panel
  beside the wall makes it smaller than the window allows. Mocks 13 and 14
  stay in the lab as the record of what was tried.
