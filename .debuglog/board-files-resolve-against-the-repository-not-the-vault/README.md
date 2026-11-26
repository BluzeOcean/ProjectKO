# Bug: a board in a Vault outside the repository cannot open its tabs

**Status:** fixed on 2026-11-26 in **shape A** — see
[`m-2026-11-26-2037-fix-landed.md`](m-2026-11-26-2037-fix-landed.md).
**Raised:** 2026-11-25 — `ticket/(open) 2026-11-25-board-files-resolve-against-the-repository-not-the-vault.md`
**Investigated:** 2026-11-26 03:00 by Claude Code
**Owner:** Kudavi. **Repo:** `V:\06_App\ProjectKO`. **Vault:** `V:\03_Vault\PKO`.

This folder is the working log for **this bug only**. It is what agents share,
so that the next one does not repeat these measurements. Read it before
measuring anything.

## The rule for this folder

1. **Read first.** `symptom.md`, then `evidence.md`, then `ruled-out.md`, then
   `open-questions.md`.
2. **Write as you measure.** Every measurement goes into `evidence.md` with the
   time it was taken and what it proves. A measurement without a verdict is noise.
3. **A hypothesis moves to `ruled-out.md` only when a measurement kills it**, and
   the entry names that measurement.
4. **Do not disturb the running app.** The owner has `projectko.exe` open. Do
   not quit it, restart it, or replace the installed build without their
   explicit OK. Measure with a service instance of your own (see below).

## The defect in one paragraph

The desktop UI addresses a board's files against the **repository**:
`<repo>/workspace/<board folder>/<file>`. The service addresses them against
the **Vault**: `<vault root>/<board folder>/<file>`. When the Vault is the
default (`<repo>/workspace`) the two are the same place and everything works.
When the Vault is somewhere else, the UI's path names a folder that is not
there, and the tab shows `ENOENT ... realpath '<repo>/workspace/<board>/<file>'`
(Markdown) or `404` (HTML).

The service is already Vault-aware everywhere — cards, board text, the mobile
preview, `files.url()`. The three places that still build a repository-rooted
path are all in the UI:

| Where | What it builds |
| --- | --- |
| `src/App.tsx:65` | the report URL for every tab |
| `src/App.tsx:213` | the path handed to the Markdown preview |
| `src/components/Sidebar.tsx:35` | the board icon |

`src/components/ReportViewer.tsx:24` prepends `desktopState().repo` to that
second path, which is why the Markdown failure happens one step earlier.

## How to measure it without touching the running app

Start a service instance of your own against a throwaway state directory. The
owner's `.mrmak/settings.json` must not be touched, so `stateDir` must be a
temporary folder holding the `vaultPath` you want to test:

```js
const service = await createService({ repo, uiDir: path.join(repo, 'dist'), stateDir });
const headers = { Authorization: `Bearer ${service.token}` };
const bootstrap = await (await fetch(`${service.origin}/api/bootstrap`, { headers })).json();
```

`service.files.url(absolutePath)` is the Vault-aware URL builder;
`${bootstrap.contentBase}/workspace/<folder>/<file>` is the one the UI builds.
Compare the two. The scripts in this folder do exactly that and are
re-runnable:

| Script | What it measures |
| --- | --- |
| `measure-board-urls.mjs` | the real repository and the real Vault: the UI's URL against the service's |
| `measure-board-fixture.mjs` | a controlled board outside the repository, and the same board in the default Vault |
| `measure-card-images.mjs` | the images inside a card that lives outside the repository |

## Status in one paragraph

**The defect is real and it is broader than the ticket says.** The HTML tab and
the Markdown tab both fail for a board that exists only in the Vault, and the
**images inside a card** fail too — the card's document opens (it is fetched
through an API route), but its images resolve against the card's report URL and
come back 404. Three older boards appear to work only because stale copies of
their folders still sit in `<repo>/workspace/`; that accident is the mask, not
the cure. The service's own URL builder produces a **byte-identical** URL for
the default Vault, so a fix built on it cannot regress the default case.
