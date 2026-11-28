# Editable tabs

A board holds **pages**, a page holds **tabs**, and a tab holds **sections** and
**cards**. Use **+ New board** in the desktop Vaultspace, then **+ New page** on the
board, to make one. A page's first tab opens with it, so a new page is never empty.

## The four levels

| Level | What it is |
| --- | --- |
| Board | a folder and a record with its own tags: Research, Game Project, Gallery or App Project |
| Page | a topic inside the board, with its own folder and its own tags: Game Mechanics, Game Idea, UI, Sound, 3D, 2D or Animation |
| Tab | one document of the page; the strip above it. A page with one tab hides the strip |
| Section / Card | the blocks inside the tab: a heading, and the cards under it |

A section is a heading - it holds nothing. A card is the visual block that follows.
They are one ordered list, so a tab reads top to bottom: heading, cards, heading,
cards.

## Working with a tab

The tab's facts sit on the breadcrumb's row, at the top right: how many cards and
headings the tab holds, and the **Edit** button. The tab strip — the row of tab
names — is below it.

Choose **Edit** to change the tab: its layout, its introduction, and its blocks.
Notes support Markdown. A card can have an image, a saved prompt, a source link and
a status. Use the arrows on a block to move it, and the x to remove it.

**Save**, or Ctrl/Cmd+S, writes the tab to disk. Uploaded images are copied into
the page's `media/` folder. An upload becomes part of the page after you save.

Drafts survive switching tabs and reloading the same app window when browser
session storage is available. Save before closing the app; a draft is not a
replacement for a saved file.

If an agent or another window edits the file while your draft is open, Project KO
keeps your draft and stops the save. **Load latest** shows the disk version; you
can download your draft and reapply the changes you want. There is no silent
force-save.

Before replacing a saved tab, the service keeps the previous contents under
`.mrmak/tab-backups/`, with a receipt identifying the original file. These are
local recovery copies and are excluded from Git. Use Git for longer history.

## The Pinboard

The Pinboard is one of the card layouts: a wall of the tab's cards as thumbnails,
one picture chosen, and a view where the picture is the point.

Choose a thumbnail and the picture opens large, with a pen over it. The pen has
four colours - pink, amber, blue and ink - because these pictures run from
near-black silk to a pale grey ground, and a mark has to be visible on both.
Pen, Eraser, Undo and Clear are above them. The feedback goes in the field beside
the picture, and the hand-off sits at the bottom right.

**Send to the board's agent** does three things, in order:

1. the picture, with your marks drawn on it, is written into the page's `media/`
   folder and saved into the card as `annotation`;
2. your feedback is saved into the card as `feedback`;
3. the board's agent receives the picture, the marked picture, the card's notes
   and your feedback, word for word - and the message names the page and the tab
   the card came from.

Sending also saves the tab, so what the agent reads is exactly what you see. The
first hand-off opens a chat named after the board, working in the board's folder,
and the board remembers it: later hand-offs go to that same chat instead of
opening a new one. The binding lives on the board's record in
`workspace/workspace.json`, so it travels with the board.

Choosing a card also tells the service which card you are looking at. That is the
whole signal - one click, one stored value. Nothing watches you: there is no hover
tracking and no polling. An agent pulls the choice when it wants it, with the
`current_selection` tool, and reads the card's picture, marked picture, notes and
feedback at that moment. Opening a different board drops the choice.

## Where the content lives

```text
workspace/
  workspace.json
  2026-10-20_character-references-a1b2c3d4/
    references/
      overview.tab.json
      media/
        reference-a1b2c3d4.webp
```

- The board folder keeps its day prefix and belongs to the board.
- A page's folder is its id.
- A tab's path is relative to **the board's folder**. A tab document lives under
  its page's folder; an existing HTML or Markdown report keeps the path it was
  written with, so the links beside it still resolve.

The `.tab.json` file is the source of truth. The application supplies the view;
there is no generated HTML copy to keep in sync. Prose inside `summary`, `note`
and `body` uses Markdown. Longer documents can still be separate `.md` tabs.

Tabs remain regular project files. Agents can read and update them with their
usual file tools. No database, cloud account, extra model call or plugin is needed.
Existing custom HTML, Markdown and 3D comparison tabs remain supported.

Phone access and browser preview can **read** tabs. Editing and image import are
available in the authenticated desktop Vaultspace.

## Agent authoring format

An editable tab is registered without a `viewer`:

```json
{
  "id": "overview",
  "name": "Overview",
  "path": "references/overview.tab.json"
}
```

The document:

```json
{
  "format": "pko-tab",
  "version": 1,
  "layout": "gallery",
  "summary": "Compare the silhouette before choosing a direction.",
  "nodes": [
    { "kind": "section", "id": "silhouette", "title": "Silhouette",
      "note": "Read the shape at 64px first." },
    { "kind": "card", "id": "explorer", "title": "The explorer",
      "body": "Keep the **large hat**.",
      "image": "media/explorer.webp",
      "alt": "Explorer character reference",
      "prompt": "Next iteration: simplify the belt.",
      "url": "https://example.com/reference",
      "linkLabel": "Reference source",
      "status": "review" }
  ]
}
```

Required tab fields: `format`, `version`, `layout`, `nodes`.
Required block fields: `kind` and `id`; a section also needs `title`, a card too.

- Layouts: `gallery`, `workbench`, `pinboard`, `codex`, `margin`, `ppt`, `folio`.
- `summary` is the tab's introduction. A document layout opens its column with
  it, in full, and in a **codex** tab the rail takes its opening as the
  abstract — two sentences and twenty words at most. See
  [the codex page](codex-page.md).
- Statuses: `idea`, `in-progress`, `review`, `done`; omit for no status.
- Feedback: `feedback` holds what the user wants the agent to change about the
  card, up to 4,000 characters. It is written by the Pinboard and read by agents
  as part of the card's text.
- Annotation: `annotation` is the picture with the user's marks drawn on it,
  saved inside the page's `media/` folder. It follows the same rules as `image`.
- IDs: unique per tab, 1-80 letters, numbers, hyphens or underscores, starting
  with a letter or number. Preserve them when editing or reordering.
- Images: PNG, JPEG, WebP or GIF. Paths are relative to the tab document and stay
  inside the board's folder. Absolute paths, parent traversal, hidden folders and
  external image URLs are not accepted. Import an image into the page instead.
- Sources: complete HTTP(S) URLs without credentials embedded in the address.
- Limits: 200 blocks and 1 MB per document; 16 MB per uploaded image.
  Titles allow 200 characters, introductions 20,000, and notes/prompts 40,000.
- Unknown versions, unknown block kinds and unknown fields are rejected so an
  older editor cannot silently discard content it does not understand. Raw HTML
  in Markdown is not executed.

Before an agent changes a tab, reread the current file. Preserve blocks and fields
outside the requested edit, then validate it with the shared validator:

```sh
node --input-type=module -e "import { readFile } from 'node:fs/promises'; import { validateTabDocument } from './desktop/service/vault-schema.mjs'; validateTabDocument(JSON.parse(await readFile(process.argv[1], 'utf8'))); console.log('Tab valid');" workspace/example/references/overview.tab.json
```

Write the complete file atomically and update the page's and the board's `updated`
dates in `workspace/workspace.json`. The desktop editor does these updates for you.
Agents that write files directly are responsible for preserving concurrent
changes; the desktop revision checks cannot intercept an agent's filesystem write.
