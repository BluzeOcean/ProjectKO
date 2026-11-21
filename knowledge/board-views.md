# Board views (Gallery and Workbench)

Status: the second view was renamed **Workbench** on 2026-11-21. The two
views still lay out the same entries almost the same way, and that is a
known open question, not an accident — see "Open" below.

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
| `cardTemplates = ['gallery', 'workbench']` | `desktop/service/card-schema.mjs` |
| `cardTemplateLabels = { gallery: 'Gallery', workbench: 'Workbench' }` | same file |
| `legacyCardTemplates = { research: 'workbench' }` | same file |
| `cardViewTabLabels` | same file — the tab names that came from a view |

The word is spelled **once**, in `cardTemplateLabels`. The panel's view
chips, the editor's View dropdown, the pink kicker on the card and the CSS
class all read from it, so they cannot drift apart.

`cardViewTabLabels` holds the tab names that were written from a view
(Gallery, Workbench, and the old Research). A tab named by hand — "Editable
references", "Editable research" — is not in that map and keeps its name.

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

## What the two views do today

- **Gallery** — `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`: a grid of
  boxed entries, the picture on a 4:3 bed, the title and the notes under
  it.
- **Workbench** — one entry per row; when the entry has a picture, the
  picture sits left and the copy right.

Both show the same entries; only the arrangement differs. In the editor, an
entry's "Image and prompt" block opens by default in the Gallery view and
stays collapsed in the Workbench unless the entry already has an image.

## Open

- **The two views are still nearly the same thing.** Four Gallery layouts
  were mocked in `lab/` (mocks 7–10: the app as it stands, and three
  picture-first ways) and **not chosen** — the Gallery stays as the app
  draws it. The mocks are kept as the record of what was tried.
- **The deck never names a board's view.** The panel's "What this board
  brings" line does name it, which is a thin promise while the two layouts
  look alike. The owner will decide after using the app more; the line
  keeps its current wording until then.
- **The rename and the panel arrived together.** The panel was ported from
  the lab first, then the view was renamed, and the shared files
  (`card-schema.mjs`, `card-documents.mjs`, `NewCard.tsx`,
  `editable-cards.css`) carry both. Splitting them would leave a commit
  whose tests do not pass.
