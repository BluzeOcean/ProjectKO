# Evidence log

Chronological. Every entry is a measurement with the time it was taken and what
it proves. Sources are named so a claim can be checked instead of believed.

---

### 2026-11-26 02:50 — the UI's URL against the service's URL, on the real repository and the real Vault

`measure-board-urls.mjs`, against `V:\06_App\ProjectKO` with
`vaultPath = V:\03_Vault\PKO`, in a throwaway state directory (the owner's
`.mrmak/settings.json` was not touched).

```
repo        : V:\06_App\ProjectKO
contentBase : http://127.0.0.1:59643/view/Uk1aOet90EjPwOwjjiaPOIqN9cZCcEUCkFEMscR2jFo

UI url      : .../view/Uk1aOet…/workspace/2026-11-25_epic-game-jam-2026/board.html
UI status   : 404
UI body     : {"error":"ENOENT: no such file or directory, realpath
               'V:\\06_App\\ProjectKO\\workspace\\2026-11-25_epic-game-jam-2026\\board.html'"}

svc url     : .../view/6zdjNWZ6…/2026-11-25_epic-game-jam-2026/board.html
svc status  : 200
svc body    : <!DOCTYPE html> <html data-mak-report="document" …

UI preview  : 200   (the .md step of a board whose folder also exists in <repo>/workspace)
vault prev  : 200
cards       : 200
```

**Proves:** the HTML tab's failure, which the ticket could only read from the
code, is now observed. The service's own URL builder serves the same file with
200. The service side is sound; the UI's path is wrong.

---

### 2026-11-26 02:52 — a controlled board outside the repository, and the same board in the default Vault

`measure-board-fixture.mjs`: a board with an `.html` step and a `.md` step, in a
Vault in `%TEMP%`, against a repository in `%TEMP%`.

```
--- A. Vault OUTSIDE the repository
  UI  report.html -> 404  {"error":"ENOENT: no such file or directory, realpath '<repo>\\workspace\\board\\report.html'"}
  SVC report.html -> 200  .../view/<vaultGrant>/board/report.html
  PRV report.html -> 400  {"error":"ENOENT: no such file or directory, realpath '<repo>\\workspace\\board\\report.html'"}
  UI  notes.md    -> 404  (same ENOENT)
  SVC notes.md    -> 200  .../view/<vaultGrant>/board/notes.md
  PRV notes.md    -> 400  (same ENOENT)

--- B. DEFAULT Vault (<repo>/workspace)
  UI  report.html -> 200
  SVC report.html -> 200  .../view/<repoGrant>/workspace/board/report.html
  PRV report.html -> 200
  UI  notes.md    -> 200
  SVC notes.md    -> 200  .../view/<repoGrant>/workspace/board/notes.md
  PRV notes.md    -> 200

  byte-identical to the UI url today? YES
```

**Proves:** both tab kinds fail outside the repository and both work in the
default Vault. And the decisive fact for the fix: **for the default Vault,
`files.url()` produces a URL byte-identical to the one the UI builds today** —
same grant token, same path. A fix built on `files.url()` therefore cannot
regress the default case, and the ticket's acceptance item 5 is satisfiable
without a special case.

---

### 2026-11-26 02:55 — the images inside a card that lives outside the repository

`measure-card-images.mjs`: a card whose entry carries `media/shot.png`.

```
card url (UI)      : .../view/<repoGrant>/workspace/board/content.card.json
image from UI card : .../view/<repoGrant>/workspace/board/media/shot.png
  -> 404 {"error":"ENOENT: no such file or directory, realpath …"}
card url (service) : .../view/<vaultGrant>/board/content.card.json
image from svc card: .../view/<vaultGrant>/board/media/shot.png
  -> 200 image/png 70 bytes
```

**Proves:** a third symptom the ticket does not mention. The card's *document*
opens (it is fetched through `GET /api/workspace/cards/<id>/<step>`, which
resolves against `vault.root`), but its **images** resolve against the card's
report URL (`src/components/CardContent.tsx:31`, `new URL(item.image, base)`)
and come back 404. On the real Vault this hits the Epic Game Jam board's
Gallery card, whose three entries point at `media/devlog-screenshots/*.png`.

---

### 2026-11-26 03:00 — why three boards appear to work

The repository's `workspace/` still holds folders for `my-dream-game`,
`creative-mcp` and `arachne-character`, with file contents **identical** to the
Vault's copies (`cmp` reports no difference for `connect.md` and `report.html`).
They are ordinary directories, not junctions (no reparse points under
`workspace/`). The repository's own `workspace/workspace.json` still lists six
boards; the Vault's registry lists four, and the Vault is what the service
reads.

**Proves:** the masking is accidental. The boards that "work" today work
because a stale copy of the folder happens to sit under `<repo>/workspace/`.
The Epic Game Jam board has no such copy, so it is the one that fails. A fix
must not depend on those copies — and the ticket's rule "do not move the boards
back into `workspace/`" is the right call, because moving them would hide the
defect rather than fix it.

---

### 2026-11-26 03:15 — where the defect came from

Git history. Full detail in
[`m-2026-11-26-0315-origin-of-the-defect.md`](m-2026-11-26-0315-origin-of-the-defect.md).

```
upstream/main 57adc60  has no desktop/service/vault.mjs and no vaultPath setting
upstream/main:src/App.tsx:46   contentUrl(`/workspace/${entity.folder}/${step.path}`)   <- the same line, correct upstream
e6d5f1e  Initial release of Mr. Mak Workspace    <- the line enters this history
a8b888c  Give the Vault its own folder …         <- the Vault arrives; 31 src/ files touched, all labels
```

**Proves:** the defect is **ours, not inherited**. Upstream has no Vault, and
its repository-rooted path is correct because upstream's boards live in
`<repo>/workspace/`. `a8b888c` moved the boards out, taught the **service**
about the new root — and added `vaultPath` to **`Settings`**, not to the
**`DesktopState`** the UI reads from `/api/bootstrap` — while leaving the three
UI path builders untouched. The mobile side was updated in the same commit
because it builds its URL in the service; the desktop side was left behind.
