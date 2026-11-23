# The Vault is a folder; Vaultspace is the window

The boards used to live only in `<repo>/workspace`. That tied the app's data to
the app's checkout, so a second drive, a synced folder or a share could not hold
it, and cloning the repository copied every board with it.

Now one module resolves the folder: `desktop/service/vault.mjs`.

| Where it comes from | When |
| --- | --- |
| `vaultPath` in `.mrmak/settings.json` | the owner chose a folder in Settings |
| `<repo>/workspace` | nothing was chosen: a fresh install, and every test |

## What moves with the Vault

- `workspace.json`, the registry every board is listed in
- each board's folder, with its reports, cards, images and videos
- the folder a board's chat opens in (`board-agents.mjs` uses the same root)

## What stays with the app

- `workspace/_shared/report.css|js|examples.css` — the report chrome is app code.
  A report links `../_shared/report.js`; `files.mjs` and `mobile-reports.mjs`
  map that name to the repository whatever the Vault is.
- `.mrmak/` — settings, card backups, mobile pairing and runtime state.
- the repository itself, which still holds the starter boards a fresh install
  copies to `workspace/`.

## What changing the folder does

`Vault.pointTo()` creates the folder, writes an empty `workspace.json` when the
folder has none, and keeps the resolved path in settings. It does **not** move or
copy boards: that is the owner's decision. The service re-watches the new
registry and broadcasts `workspace-changed`, so Vaultspace repaints.

## Two places that used to assume the repository

- `files.url()` rooted every board file at the repository. A Vault file now roots
  at the Vault, and a scoped grant caps a report at its own board folder.
- The Windows/macOS launcher required `workspace/workspace.json` before opening a
  folder. `has_vault()` now also accepts a folder with `.mrmak/settings.json`, so a
  repository whose boards live elsewhere still opens.

## Tests

`desktop/service/test/vault.test.mjs` switches a service to a folder outside the
repository, reads its registry, follows a report redirect and fetches the app's
shared chrome through the report's own port, then checks the two refusals: a
relative path and the repository itself.
