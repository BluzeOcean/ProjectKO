# The tab's facts live in the topbar

Status: written 2026-11-27.

The row that said **5 cards · 5 headings** with an **Edit** button used to sit
between the tab strip and the content. It is now on the **breadcrumb's row, at
the right** — the breadcrumb on the left, the count and the Edit button on the
right, the tab strip on the row below.

## How it is done, and why

The count is the document's, and the Edit button is the door into the editor.
Both belong to the editor, which is a component deep in the content area — but
they are drawn in the topbar, which the editor does not own.

So the **topbar keeps the space and the editor fills it**:

| who | what |
| --- | --- |
| `src/App.tsx` | holds `tabSlot`, the DOM node the topbar keeps |
| `src/components/Topbar.tsx` | renders `.topbar-slot` and reports the node through `slotRef` |
| `src/components/TabEditor.tsx` | draws the bar and hands it over with `createPortal` |

The bar is still the editor's element — it keeps its own class, its own state
and its own buttons — so `Edit`, `Save`, `Cancel`, the save message and the
**Load latest** warning all still work, and a test can still find them by
`.tab-editor-bar`. Nothing was lifted into `App.tsx` and no state was duplicated.

The alternative — counting the blocks in the topbar from a second copy of the
document — would have had two counts to keep in step. The alternative of
lifting the editing state into `App.tsx` would have made the app shell know
about a tab's blocks.

## The row grammar

The topbar is a flex row that wraps. Three rules earn the layout, and all
three are in `src/styles/global.css`:

1. `.topbar:has(.tab-editor-bar) .breadcrumb { flex: 1 1 auto }` — the
   breadcrumb grows, so the facts are pushed to the right of it.
2. `.app-layout:not([data-entity="my-dream-game"]) .topbar:has(.step-tabs)
   .topbar-right { order: 1 }` — the tab strip is ordered after the facts, so
   the facts stay on the first row and the strip wraps to the second. Without
   the order the strip would sit between the breadcrumb and the facts.
3. `.topbar:not(:has(.step-tabs)):has(.tab-editor-bar) .topbar-right
   { order: 1 }` and the same for `.topbar-slot { order: 2 }` — **one tab**
   means there is no strip, so the row is the breadcrumb, then **+ Tab**, then
   the facts, and the Edit button is the last thing on the right.

The board rule that gives the breadcrumb the full width
(`.topbar:has(.step-tabs) .breadcrumb { width: 100% }`) has to be undone when
the facts are on that row, or the facts wrap to a row of their own. That is
why the override carries `:has(.tab-editor-bar)` as well: it has to outrank
the rule it undoes.

## What the test expects

`desktop/service/test/topbar-ui.mjs` covers the three shapes:

- two tabs — the facts share the breadcrumb's row, the strip is below;
- one tab — the facts are to the right of the **+ Tab** button;
- a board with no tab — there is no bar at all.

It also opens the editor from the topbar and finds **Save** and **Cancel**
there, which is the part the portal could have broken.
