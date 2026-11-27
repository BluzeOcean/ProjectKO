# Vault hierarchy — Board → Page → Tab → Section

**Status:** **built 2026-11-26.** The owner approved this shape in conversation
and asked for it without user review until complete; the brand sweep was deferred,
so nothing here depends on it. One rule was corrected while building: a tab's path
is relative to the **board's folder**, not the page's, so an existing report keeps
its own path and every relative link beside it still resolves. A tab document for
a card is written under its page's folder, and that page folder is what the tab
path names (`<page>/<tab>.tab.json`).

## The outcome, in one sentence

Replace the two-level Vault (board → tab → card file → entry) with a four-level
one — **Board → Page → Tab → Section/Card** — where a board and a page are both
rendered by the same thumbnail grid, and a tab is a block document holding
section headings and cards.

## The hierarchy

| Level | Is | Owns | Addressed by |
| --- | --- | --- | --- |
| **Board** | a folder plus a registry entry | title, description, tags, status, folder, the chat binding | `#/<boardId>` |
| **Page** | a tile in the board's grid; a subfolder | title, description, tags, icon | `#/<boardId>/<pageId>` |
| **Tab** | the strip inside a page; one document | name, path, optional viewer override | `#/<boardId>/<pageId>/<tabId>` |
| **Section** | a heading block inside a tab | title, note | not routable |
| **Card** | a content block inside a tab | title, body, image, prompt, source, status, feedback, annotation | not routable |

A tab's blocks are a **flat, ordered list**. Sections are headings, not
containers: a section introduces the cards that follow it until the next
section. The renderer derives the runs; the data does not nest.

## `workspace.json`

```json
{
  "format": "pko-vault",
  "version": 2,
  "boards": [
    {
      "id": "epic-game-jam-2026",
      "title": "Epic Game Jam 2026 — MECH TACTIC CUT",
      "description": "The finished jam: the studio board, the design spec…",
      "tags": ["game-project"],
      "created": "2026-11-12",
      "updated": "2026-11-25",
      "folder": "2026-11-25_epic-game-jam-2026",
      "status": "active",
      "pinned": true,
      "icon": "media/cover.webp",
      "agent": { "chatId": "…", "name": "Epic Game Jam 2026", "agent": "codex" },
      "pages": [
        {
          "id": "concept-art",
          "title": "Concept art",
          "description": "Silhouette first, colour second.",
          "tags": ["2d", "3d"],
          "created": "2026-11-12",
          "updated": "2026-11-25",
          "tabs": [
            { "id": "concepts", "name": "Concepts", "path": "concepts.tab.json" },
            { "id": "board", "name": "Studio Board", "path": "board.html", "viewer": "report" }
          ]
        }
      ]
    }
  ]
}
```

- `folder` keeps the `YYYY-MM-DD_slug` form. It is the only place a creation
  date appears on disk, and it stays.
- `viewer` is absent for a block document, or `report` / `compare3d`.
- `layout` is **not** here: the document owns how it draws.
- Removed: `entities`, `steps`, `type`, `defaultStep`, `category`.

## The tab document

`<vault>/<board folder>/<page id>/<tab id>.tab.json`

```json
{
  "format": "pko-tab",
  "version": 1,
  "layout": "gallery",
  "summary": "Compare the silhouette before choosing a direction.",
  "nodes": [
    { "kind": "section", "id": "silhouette", "title": "Silhouette",
      "note": "Read the shape at 64px before the detail." },
    { "kind": "card", "id": "explorer", "title": "The explorer",
      "body": "Keep the **large hat**.", "image": "media/explorer.webp",
      "alt": "Explorer reference", "status": "review",
      "prompt": "Next iteration: simplify the belt.",
      "url": "https://example.com/ref", "linkLabel": "Reference source" }
  ]
}
```

| Block | Fields |
| --- | --- |
| `section` | `id`, `title`, `note` |
| `card` | `id`, `title`, `body`, `image`, `alt`, `prompt`, `url`, `linkLabel`, `status`, `feedback`, `annotation`, `wide` |

- `kind` is required and is one of `section` | `card`. Unknown kinds are
  refused, so an older editor can never silently drop a block.
- IDs are unique within the document. `feedback` and `annotation` are what the
  hand-off reads; they are not optional extras.
- Limits: 1 MB per document, 200 blocks, 16 MB per image, images inside the
  page folder only.

## Tags

Both levels are `string[]`, closed to these presets:

| Level | Presets |
| --- | --- |
| Board | `research`, `game-project`, `gallery`, `app-project` |
| Page | `game-mechanics`, `game-idea`, `ui`, `sound`, `3d`, `2d`, `animation` |

The first tag drives the tile glyph. The deck's filter stays one tag at a time;
a board carrying two tags appears under both.

## Layouts

Seven, in two families. The first three arrange cards; the last four read the
tab as a document and scroll on their own.

| `layout` | Section renders as | Cards render as |
| --- | --- | --- |
| `gallery` | header band | responsive grid, image-led |
| `workbench` | header band | full-width rows, image left, long text |
| `pinboard` | header band | thumbnails only; click opens large with the pen and hand-off |
| `codex` | heading in a measured column | a title and its Markdown notes; the rail carries the contents |
| `margin` | heading in a measured column | a title and its notes; a `WARNING` or `QUESTION` aside floats into the gutter |
| `ppt` | one slide per section | a title and its notes; the keyboard moves between slides |
| `folio` | one sheet per section, on A4 | a title and its notes; the sheet is the page |

## Disk

```
<vault>/workspace.json
<vault>/2026-11-25_epic-game-jam-2026/
  board.html                      a report keeps the path it was written with
  concept-art/
    concepts.tab.json             a tab document lives under its page
    media/explorer.webp           a card's picture lives beside its document
```

A tab's `path` is relative to the board's folder: `board.html` resolves at the
board's root, `concept-art/concepts.tab.json` inside the page's folder.

Page folder = page id, no date prefix: the board already dates the work, and
page order is the registry's, which a date prefix would fight.

## Routing

| Hash | Shows |
| --- | --- |
| `#/` | Vaultspace — board tiles |
| `#/<board>` | the board's page grid |
| `#/<board>/<page>` | that page, its first tab |
| `#/<board>/<page>/<tab>` | that tab |

A page with one tab hides the strip.

## Service

| Route | Does |
| --- | --- |
| `GET /api/workspace` | the registry |
| `POST /api/workspace/boards` | create a board (0 pages) |
| `PATCH /api/workspace/boards/:id` | tags, status, pinned |
| `DELETE /api/workspace/boards/:id` | registry entry first, then the folder to the trash |
| `POST /api/workspace/boards/:id/pages` | create a page and its folder |
| `PATCH /api/workspace/boards/:id/pages/:page` | title, description, tags |
| `DELETE /api/workspace/boards/:id/pages/:page` | registry then the page folder |
| `GET /api/workspace/boards/:id/pages/:page/tabs/:tab` | the document + revision |
| `PUT /api/workspace/boards/:id/pages/:page/tabs/:tab` | save with a revision check |
| `POST …/tabs/:tab/images` | upload into the page's `media/` |

A registry without `format: "pko-vault"` is refused with a readable message and
**nothing is written**, so an old Vault cannot be half-migrated by a new build.

## Out of scope

- The brand sweep (`mrmak`, `--mak-*`, Mr. Mak). Deferred by the owner.
- Page-level chats: the **board owns the chat**; the hand-off message names the
  page and the tab instead.
- Content search, page archive, card deep links, section collapse state.
- Mobile editing: the phone reads like today.

## Acceptance checks

1. A new board has 0 pages and 0 tabs; its page grid says so and offers
   `+ New page`.
2. A page holds tabs; a one-tab page shows no strip.
3. A tab document round-trips: sections and cards in order, unknown `kind`
   refused, revision conflict refused.
4. A card's `feedback` and `annotation` reach the hand-off, and the message
   names board, page, tab and card.
5. Reloading `#/<board>/<page>/<tab>` reopens that tab; `#/<board>` shows the
   grid.
6. Deleting a page sends its folder to the trash and leaves its siblings.
7. A v1 registry is refused with a readable message and no write.
8. The rewritten suite passes, and the old `card-schema` / `card-documents`
   modules are gone rather than orphaned.

## Stages

1. `vault-schema.mjs` — the registry and document validators, the tag and
   layout vocabularies. Observation: a valid document passes, each malformed
   one is refused by name.
2. `workspace.mjs` — v2 registry, board and page CRUD, the v1 refusal.
   Observation: the service tests for create/patch/delete.
3. `tab-documents.mjs` — read, save with revision, create, images.
4. Routes and the bootstrap payload.
5. Routing and the app shell; `TileDeck` generalised from `WorkspaceDeck`.
6. The block renderer and editor (sections + cards, three layouts).
7. Selection and hand-off coordinates.
8. Converter, run once over `V:\03_Vault\PKO` after a dated backup.
9. Starter boards, tests, docs and the `workspace-authoring` skill.
