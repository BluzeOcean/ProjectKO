# Symptom

**Seen by the owner, in the tab, on 2026-11-25.** A board in the Vault outside
the repository, the **Prototype** tab:

```
ENOENT: no such file or directory, realpath
'V:\06_App\ProjectKO\workspace\2026-11-25_epic-game-jam-2026\prototype.md'
```

with the tab's title above it and an "Open source file" link below — that is
`src/components/ReportViewer.tsx:36`, the error branch of the report viewer.

**The HTML report failure was not observed directly.** It is read from the same
two lines of UI that produce the Markdown path, and it is the first thing to
confirm. **Confirmed on 2026-11-26** — see
[`m-2026-11-26-0250-ui-url-404-service-url-200.md`](m-2026-11-26-0250-ui-url-404-service-url-200.md):
the Studio Board tab's URL answers `404` with
`ENOENT ... realpath '<repo>/workspace/2026-11-25_epic-game-jam-2026/board.html'`.

## What the code says

The path in the error is the tell. It is
`<repo>/workspace/<board folder>/<file>`. The board folder is not there — it is
in the Vault, `V:\03_Vault\PKO\2026-11-25_epic-game-jam-2026\`.

Three places in the UI build that path:

| # | Where | What it builds |
| --- | --- | --- |
| 1 | `src/App.tsx:65` | `contentUrl(`/workspace/${entity.folder}/${step.path}`)` — the report URL for **every** tab |
| 2 | `src/App.tsx:213` | `relativePath={`workspace/${entity.folder}/${step?.path}`}` — the path handed to the report viewer |
| 3 | `src/components/Sidebar.tsx:35` | `contentUrl(`/workspace/${entity.folder}/${entity.icon}`)` — the board icon |

`contentBase` is `${files.origin}/view/${files.repoGrant}`
(`desktop/service/server.mjs:335`) — the grant for the **repository**.
`files.content()` resolves a repository grant against the repository, so
`workspace/<board>/<file>` lands in `<repo>/workspace/…` and is not found. The
Markdown preview fails one step earlier, inside `files.preview()`'s `realpath`
(`desktop/service/files.mjs:126`), because the viewer prepends
`desktopState().repo` to a path that was never repo-relative.

## The service is already Vault-aware

| Where | How |
| --- | --- |
| `desktop/service/workspace.mjs:64` | `realFile(this.vault.root, relative)` — reading a board step |
| `desktop/service/card-documents.mjs:27` | `realpath(this.workspace.vault.root)`, then `realFile(folder, selected.path)` — cards |
| `desktop/service/files.mjs:96` | `files.url()` picks the Vault as the root for a file inside it |
| `desktop/service/mobile-reports.mjs:26` | `realpath(path.join(this.vault.root, entity.folder))` — the mobile preview |

**The control:** the mobile preview opens the *same* board's *same* files from
the *same* Vault, and it works. The desktop UI cannot. The difference is the
URL each one builds.

## Note on the board as it stands today (2026-11-26)

The board has been restructured since the ticket was raised: the steps are now
`board.html` plus ten `.card.json` files, and `prototype.md` no longer exists.
So **the exact path in the error can no longer be reproduced on this board**.
The defect behind it is unchanged and is reproduced with a controlled fixture —
see [`evidence.md`](evidence.md).
