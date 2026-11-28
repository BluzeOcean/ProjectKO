---
name: vault
label: boards, pages, tabs, sections, the registry
description: The Vault, its boards, pages and tabs, the sections and cards inside them, and the registry that records them.
---

# The Vault

The Vault is one folder of Project KO's documents. It holds every board, page, tab,
report and raw asset the owner has produced. It is not code: the code lives in the
workspace you were pointed at. The Vault folder is named in your briefing.

## The four levels

| Level | Is | Lives in |
| --- | --- | --- |
| **Board** | a folder plus a registry record | \`<vault>/<board folder>/\` |
| **Page** | a topic inside a board; its own folder | \`<board>/<page id>/\` |
| **Tab** | one document of a page; the strip above it | a file named by the tab's \`path\` |
| **Section / Card** | the blocks inside a tab | the tab's \`.tab.json\` |

A **section** is a heading. A **card** is the visual block under it. They are one
flat, ordered list — a section introduces the cards that follow it until the next
section — not nested containers.

## The registry

\`<vault>/workspace.json\` lists every board. The app reads and writes it; you may
edit it when you register new work, and you must keep its shape:

\`\`\`json
{
  "format": "pko-vault",
  "version": 2,
  "boards": [
    {
      "id": "ironpath",
      "title": "IronPath",
      "description": "One line the owner reads in the deck.",
      "tags": ["game-project"],
      "status": "active",
      "created": "2026-11-26",
      "updated": "2026-11-26",
      "pinned": true,
      "folder": "2026-11-26_ironpath",
      "pages": [
        {
          "id": "game-mechanics",
          "title": "Game Mechanics",
          "tags": ["game-mechanics"],
          "created": "2026-11-26",
          "updated": "2026-11-26",
          "tabs": [
            { "id": "overview", "name": "Overview", "path": "game-mechanics/overview.tab.json" }
          ]
        }
      ]
    }
  ]
}
\`\`\`

- **Board tags** are one or more of \`research\`, \`game-project\`, \`gallery\`,
  \`app-project\`. **Page tags** are one or more of \`game-mechanics\`, \`game-idea\`,
  \`ui\`, \`sound\`, \`3d\`, \`2d\`, \`animation\`. Both are closed lists; the app refuses
  anything else.
- \`status\` is \`active\`, \`done\` or \`archived\`.
- \`folder\` is a plain folder name inside the Vault, never a path. It keeps the
  \`YYYY-MM-DD_slug\` form.
- A page's folder is its \`id\`, so a page id is also a folder name.
- A page's \`title\` is the topic on its own, with **no \`Page\` suffix** — \`Game
  Design\`, \`Sound\`, \`Asset Prep\`, not \`Game Design Page\`. The page grid already
  shows every entry as a page, so the suffix is clutter and it wraps the title.
- A tab's \`path\` is **relative to the board's folder**. A tab document lives under
  its page's folder (\`<page>/<tab>.tab.json\`); an existing report keeps the path it
  was written with, so every relative link beside it still resolves.
- \`viewer\` is absent for a tab document, or \`report\` / \`compare3d\`.
- \`updated\` changes when the work in a board changes.
- A board or a page is deleted through the app, not by hand: the bin in the grid
  sends its folder to the system trash, so the registry and the files stay in step.

## The tab document

\`\`\`json
{
  "format": "pko-tab",
  "version": 1,
  "layout": "gallery",
  "summary": "Markdown introduction for the tab.",
  "nodes": [
    { "kind": "section", "id": "silhouette", "title": "Silhouette",
      "note": "Read the shape at 64px before the detail." },
    { "kind": "card", "id": "explorer", "title": "The explorer",
      "body": "Keep the **large hat**.", "image": "media/explorer.webp",
      "alt": "Explorer reference", "status": "review",
      "prompt": "Next iteration: simplify the belt.",
      "url": "https://example.com/reference", "linkLabel": "Reference source" }
  ]
}
\`\`\`

- \`layout\` is one of \`gallery\`, \`workbench\`, \`pinboard\`, \`codex\`, \`margin\`, \`ppt\`
  or \`folio\`. The first three arrange cards: gallery a grid of cards, workbench
  one row per card, pinboard a wall of thumbnails with one opened large. The last
  four read the tab as a document: codex a reading room with a contents that
  follows the reader, margin an editorial spread whose asides float into a
  gutter, ppt one section per screen, folio sheets of paper. In a document
  layout a card's notes are Markdown, and an aside is a blockquote opening with
  \`> [!WARNING]\`, \`> [!NOTE]\`, \`> [!TIP]\`, \`> [!DECISION]\`, \`> [!QUESTION]\` or
  \`> [!CAUTION]\`.
- \`kind\` is required on every block and is \`section\` or \`card\`.
- Sections carry \`id\`, \`title\` and an optional \`note\`.
- Cards carry \`id\`, \`title\`, and optionally \`body\`, \`image\`, \`alt\`, \`prompt\`,
  \`url\`, \`linkLabel\`, \`status\`, \`feedback\`, \`annotation\` and \`wide\`.
- IDs are unique within the tab. Images are PNG, JPEG, WebP or GIF and stay inside
  the page's folder. Cards are capped at 200 blocks and 1 MB per document.

The schema lives in \`desktop/service/vault-schema.mjs\`; the format is documented in
[docs/editable-cards.md](../../docs/editable-cards.md).

## Working with tabs

- Keep related revisions in one tab rather than making several.
- Preserve the editable source: edit the \`.tab.json\` or the report, do not replace
  it with a flattened copy.
- Images live in the page's \`media/\` folder and are referenced with relative paths,
  so the page stays portable.
- A card's \`feedback\` is what the owner wants changed; its \`annotation\` is the
  picture with the owner's marks on it. Both are written by the Pinboard and read
  by the board's agent — keep them when editing.
- Check what you changed at wide and narrow sizes, and confirm the previews and
  links work before you report.

The full authoring workflow is in \`processes/workspace-authoring.md\` and the
\`workspace-authoring\` skill.
