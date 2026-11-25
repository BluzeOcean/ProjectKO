# Bug: a board in a Vault outside the repository cannot open its Markdown or HTML tabs

**Status:** open
**Raised:** 2026-11-25 by Claude Code, working on a board in this machine's
Vault (`V:\03_Vault\PKO\2026-11-25_epic-game-jam-2026`)
**For:** whoever owns this repository
**Measured on:** this machine, Windows 11, Project KO at `V:\06_App\ProjectKO`,
the running build (service pid 40668, UI origin `http://127.0.0.1:65435`)

## The defect

A board whose folder lives in a **Vault outside the repository** is listed
correctly, and its **cards** open — but its **Markdown** and **HTML** tabs do
not.

**What was observed and what was read from the code.** The Markdown failure was
seen by the owner, in the tab:

```
ENOENT: no such file or directory, realpath
'V:\06_App\ProjectKO\workspace\2026-11-25_epic-game-jam-2026\prototype.md'
```

with the tab's title above it and an "Open source file" link below. The HTML
report failure was **not** observed directly — it is read from the same two
lines of the UI that produce the Markdown path, and it is the first thing to
confirm when you pick this up. Everything else below is read from the source
and is cited to the line.

**The path in the error is the tell.** It is
`<repo>/workspace/<board folder>/<file>`. The board folder is not there. It is
in the Vault:

```
V:\03_Vault\PKO\2026-11-25_epic-game-jam-2026\
```

Three places build that path, and none of them knows the Vault exists:

| # | Where | What it builds |
| --- | --- | --- |
| 1 | `src/App.tsx:65` | the report URL for **every** tab: `contentUrl(`/workspace/${entity.folder}/${step.path}`)` |
| 2 | `src/App.tsx:213` | the relative path given to the report viewer: `relativePath={`workspace/${entity.folder}/${step?.path}`}` |
| 3 | `src/components/ReportViewer.tsx:24` | the Markdown preview: `api(`/preview?path=${encodeURIComponent(`${desktopState().repo}/${relativePath}`)}`)` |

`contentBase` is `${files.origin}/view/${files.repoGrant}`
(`desktop/service/server.mjs:322`) — the grant for the **repository**.
`files.content()` resolves a repository grant against the repository
(`desktop/service/files.mjs:175`), so `workspace/<board>/<file>` lands in
`<repo>/workspace/…` and is not found. The Markdown preview fails one step
earlier, inside `files.preview()`'s `realpath`
(`desktop/service/files.mjs:126`), because the viewer prepends
`desktopState().repo` to a path that was never repo-relative.

**The service is already Vault-aware. Only the desktop UI is not.** These all
resolve board files against `vault.root`, and they all work:

| Where | How |
| --- | --- |
| `desktop/service/workspace.mjs:64` | `realFile(this.vault.root, relative)` — reading a board step |
| `desktop/service/card-documents.mjs:27` | `realpath(this.workspace.vault.root)`, then `realFile(folder, selected.path)` — cards |
| `desktop/service/files.mjs:96` | `files.url()` picks the Vault as the root for a file inside it |
| `desktop/service/mobile-reports.mjs:26` | `realpath(path.join(this.vault.root, entity.folder))` — the mobile preview |

**The control.** The mobile preview opens the *same* board's *same* files from
the *same* Vault, and it works. The desktop UI cannot. The difference is the
URL each one builds.

## What is already ruled out

- **Not the Vault setting.** `vaultPath` in `.mrmak/settings.json` is
  `V:\03_Vault\PKO`, and `Vault.root` resolves to it
  (`desktop/service/vault.mjs`). The board is found, listed, and its steps are
  named correctly in the tab strip.
- **Not the registry.** `V:\03_Vault\PKO\workspace.json` is the file being
  read; the board appears with all eleven of its steps.
- **Not cards.** `GET /api/workspace/cards/<entityId>/<step>` goes through
  `cards.read()` → `resolve()` → `vault.root`, and returns the card. Cards
  open, and the card editor works.
- **Not the file server.** `desktop/service/test/vault.test.mjs` already
  proves that a Vault outside the repository serves its reports: it fetches
  `service.files.url(...)` and gets **200**. The service side is tested and
  works.
- **Not the report content.** The board's own HTML is correct: served out of
  the Vault folder, all six pages render with no console errors and no failed
  requests (verified with the board's own `tools/shoot_board.mjs`, which
  serves the Vault over http and screenshots every page).

## Where to look first

The gap is between two ways of building the same URL.

`desktop/service/test/vault.test.mjs` builds the report URL with
`files.url()` — the **Vault-aware** builder, which picks the root by asking
where the file actually is. The **UI** builds it with
`contentUrl('/workspace/...')` — the **repository-rooted** one. Nothing tests
the UI's version, which is why this survived a passing Vault test.

So the first question to answer is: *what should the UI know about the
Vault?* The service already knows. The UI does not — `state` carries `repo`
and `contentBase` (`src/desktop/types.ts:43`), and no Vault.

## How to reproduce

On this machine, with the Vault already pointed at
`V:\03_Vault\PKO` (`.mrmak/settings.json` → `vaultPath`):

1. Open **Epic Game Jam 2026 — MECH TACTIC CUT** in Vaultspace.
2. Open the **Prototype** tab. It shows the ENOENT above.
3. Open the **Studio Board** tab (the HTML report). This is the one to
   confirm — by the code it should 404 with *"Page unavailable (404)"*.
4. Open the **Gallery** tab. It opens, because it is a card.

Steps 2 and 4 are the control pair: the same board, the same Vault, one tab
that works and one that does not.

To reproduce it without the running app, point a fresh Vault at any folder
outside the repository and put a board with a `.md` step and an `.html` step
in it — `desktop/service/test/vault.test.mjs` already builds exactly that
fixture.

## What has to change

The desktop UI must address board files the way the service already does:
against the Vault, not the repository.

1. **Give the UI the Vault root.** The `/api/bootstrap` payload already
   carries `repo`; add the Vault root (`vault.root`, already in scope in
   `desktop/service/server.mjs`) to the state — `src/desktop/types.ts:43` and
   the initial state in `src/desktop/client.ts:21`.
2. **Build the report URL from it.** `src/App.tsx:65` must resolve
   `<vault root>/<board folder>/<step path>` instead of
   `<repo>/workspace/<board folder>/<step path>`. Note that `files.url()`
   already chooses the right root for a given absolute path, so the cleanest
   form is to **ask the service for the URL** rather than assemble a grant
   path in the UI.
3. **Do the same for the Markdown preview.** `src/components/ReportViewer.tsx:24`
   must not prepend `desktopState().repo` to a path that is already
   vault-relative.
4. **Keep it inside the Vault.** A board path must not be able to reach
   outside the Vault root. `workspace.mjs` and `mobile-reports.mjs` already do
   this with `within(this.vault.root, root)`; whatever the UI ends up sending
   must get the same check.
5. **Leave the default Vault exactly as it is.** When the Vault is the
   default (`<repo>/workspace`), the new path must come out byte-identical to
   the old one. `Vault.isDefault` (`desktop/service/vault.mjs`) is the test for
   that.

Two ways to do it. Pick one, and say which in the commit:

- **(a) The UI learns the Vault root.** The smallest change. The UI keeps
  assembling paths, so it has to get the traversal check right itself.
- **(b) The service owns board URLs.** Add a route that returns the URL for a
  board step — `GET /api/workspace/entities/<entityId>/<step>/url`, say — and
  have the UI use it. The UI never constructs a path, so it cannot get the
  root or the traversal check wrong. More moving parts, but the Vault stays
  in one place and the desktop and mobile sides agree by construction.

## Acceptance

1. A board in a Vault outside the repository opens its **Markdown** tab and
   shows the document.
2. The same board opens its **HTML** report tab and the report renders.
3. A board in the **default** Vault (`<repo>/workspace`) still opens both — no
   regression. `desktop/service/test/vault.test.mjs` must still pass.
4. A board path cannot escape the Vault: a step whose path resolves outside
   the Vault root is refused, not served.
5. A board **icon** (`src/components/Sidebar.tsx:35`) loads from a board
   outside the repository.
6. Cards keep working, unchanged.
7. A new test covers the URL the **UI** builds for a Vault outside the
   repository. The existing test proves the *service*; add one that proves the
   *URL the UI builds*.

## Rules

- **Keep the change to this repository** — source, tests and docs. The board
  is a separate thing at
  `V:\03_Vault\PKO\2026-11-25_epic-game-jam-2026\`; do not edit it, and do not
  move it back into `workspace/` to make the symptom go away. The Vault is
  the feature, not the accident.
- **Do not "fix" it by moving the boards.** A board in the default Vault must
  keep working exactly as it does today.
- **The owner is present.** Project KO is running (`projectko.exe`, service pid
  40668). Do not quit it, restart it, or replace the installed build without
  their explicit OK. Prepare and verify, then ask.
  The running service is the copy in `.cache/desktop-runtime/service/`, which
  `desktop/prepare.mjs` refreshes from `desktop/service/` (line 101) — so a
  service-side change needs a rebuild to reach the running instance.
- Commit with a clear message and report the hash. The owner's standing
  permission to commit applies to a tested change.

---

## Investigation, 2026-11-26 03:00 — Claude Code

**The defect is real and it is broader than this ticket says.** The working
log is in `.debuglog/board-files-resolve-against-the-repository-not-the-vault/`,
with three re-runnable measurement scripts in it. The running app was never
disturbed: every measurement used a service instance of its own, started
against a throwaway state directory so `.mrmak/settings.json` was untouched.

**Measured.**

| What | Result |
| --- | --- |
| The UI's URL for a board file outside the repository | **404** — `ENOENT ... realpath '<repo>/workspace/<board>/<file>'` |
| The service's URL (`files.url()`) for the same file | **200** — the board's own HTML |
| The Markdown preview on the UI's path | **400** — the same ENOENT |
| Cards | **200** — they resolve against the Vault |
| The default Vault | `files.url()` gives a URL **byte-identical** to the one the UI builds today |

So the HTML failure this ticket could only read from the code is now observed,
and the service's own builder is safe to build the fix on: for the default
Vault it produces the same grant token and the same path as today.

### Two corrections

1. **The path in the reported error can no longer be reproduced on that
   board.** It was restructured on 2026-11-25: its steps are `board.html` plus
   ten `.card.json` files, and `prototype.md` no longer exists. The defect
   behind the error is unchanged and is reproduced with a controlled fixture —
   a board with an `.html` step and a `.md` step in a Vault outside the
   repository — where both fail through the UI's URL and both succeed through
   the service's.

2. **Three boards appear to work only by accident.** `my-dream-game`,
   `creative-mcp` and `arachne-character` have stale copies of their folders
   in `<repo>/workspace/`, byte-identical to the Vault's. They are ordinary
   directories, not junctions, and the Vault's registry is what the service
   reads. The Epic Game Jam board has no such copy, which is why it is the one
   that fails. The copies mask the defect; they are not a fix, and the rule
   above against moving boards back into `workspace/` stands.

Also: `contentBase` is at `desktop/service/server.mjs:335`, not 322.

### One symptom this ticket does not mention: the images inside a card

A card's document opens — it comes through an API route that resolves against
the Vault — but its **images** resolve against the card's report URL
(`src/components/CardContent.tsx:31`) and come back **404**. On the real Vault
this hits the Epic Game Jam board's Gallery card, whose three entries point at
`media/devlog-screenshots/*.png`. Whoever fixes this must fix that too, or the
Gallery of a Vault board shows empty pictures.

### A correction to option (a)

The UI holds exactly one grant — `contentBase` is the **repository's** — and
the token for a second root is a secret the service holds. The UI therefore
**cannot mint a Vault-rooted URL on its own**. Option (a) needs the service to
hand the UI a Vault-rooted base (or the vault grant) as well as the Vault
root. The three shapes that work are set out in the log's `open-questions.md`.

### Still open

- The choice of shape: a board base in the state, or the service owning board
  URLs. This is the owner's call, and the ticket asks that it be named in the
  commit.
- Whether the fix should mint a grant for one board rather than for the whole
  Vault.
- The stale copies under `<repo>/workspace/`: leave them until the fix is in,
  then decide.
