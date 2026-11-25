---
name: vault
label: boards, tabs, cards, the registry
description: The Vault, its boards, tabs and cards, and the registry that records them.
---

# The Vault

The Vault is one folder of Project KO's documents. It holds every board, tab, card,
page, report and raw asset the owner has produced. It is not code: the code lives in
the workspace you were pointed at. The Vault folder is named in your briefing.

## The registry

`<vault>/workspace.json` lists every board. The app reads and writes it; you may edit
it when you register new work, and you must keep its shape:

```json
{
  "id": "2026-09-15_my-dream-game",
  "title": "My Dream Game",
  "description": "One line the owner reads in the deck.",
  "status": "active",
  "category": "dev",
  "created": "2026-09-15",
  "updated": "2026-09-15",
  "pinned": false,
  "folder": "2026-09-15_my-dream-game",
  "defaultStep": 0,
  "steps": [{ "name": "Design", "path": "design.html", "viewer": "report" }]
}
```

- `status` is `active`, `done` or `archived`. `category` is a lowercase tag
  (`dev`, `image-gen`, `project`, `research`, or one the owner adds).
- `folder` is a plain folder name inside the Vault, never a path.
- `updated` changes when the work in a board changes.
- A board is deleted through the app, not by hand: the bin in the Vaultspace sends its
  folder to the system trash, so the registry and the files stay in step.

## Boards, tabs and cards

- A **board** is one folder in the Vault, plus its entry in the registry.
- A **tab** is one step of a board: `{ name, path, viewer }`. `viewer: "card"` opens an
  editable card; any other viewer opens a report.
- A **card** is a `.card.json` file: a versioned, editable document with a title, an
  introduction, ordered entries, optional images, saved prompts and Markdown notes.
  The schema lives in `desktop/service/card-schema.mjs`; the format is documented in
  `docs/editable-cards.md`.
- A **report** is an HTML or Markdown file in the board's folder. HTML reports use the
  app's shared chrome (`workspace/_shared/report.css` and `report.js`) and carry
  `data-mak-report="document"` on the root element, so they look like the rest of the
  app and stay editable by the owner.

Cards are created from the Vaultspace (`+ New board`, then the board's content). When
you produce a deliverable, add it as a tab of the right board and register it in the
registry — do not create a second copy of the same work.

## Working with cards

- Keep related revisions in one card rather than making several.
- Preserve the editable source: edit the `.card.json` or the report, do not replace it
  with a flattened copy.
- Images and generated assets live in the card's `media/` folder and are referenced with
  relative paths, so the board stays portable.
- Check what you changed at wide and narrow sizes, and confirm the previews and links
  work before you report.

The full authoring workflow is in `processes/workspace-authoring.md` and the
`workspace-authoring` skill.
