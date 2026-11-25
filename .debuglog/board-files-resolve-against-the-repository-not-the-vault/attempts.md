# Attempts

Every approach that has been tried on this bug, what it was, where it lives and
what came of it. The point is that the next agent skips the road that does not
lead anywhere.

**Verdicts:** `kept` (in the product), `kept as evidence` (it earns its place
as a tool), `removed` (it was taken out for a reason — do not bring it back),
`dead` (it proved nothing), `invalid` (it produced false readings).

---

| # | Attempt | Where | Verdict |
| --- | --- | --- | --- |
| 1 | Read the ticket's three path builders and the service's Vault-aware ones | `src/App.tsx:65,213`, `src/components/Sidebar.tsx:35`, `src/components/ReportViewer.tsx:24`, `desktop/service/files.mjs:96,126,164` | **kept as evidence** — every claim in the ticket checked out |
| 2 | Measure the UI's URL against the service's URL on the real repository and the real Vault | `measure-board-urls.mjs` | **kept as evidence** — the HTML 404 is now observed, not read |
| 3 | Measure a controlled board outside the repository, and the same board in the default Vault | `measure-board-fixture.mjs` | **kept as evidence** — both tab kinds fail outside, both work by default, and the service's URL is byte-identical by default |
| 4 | Measure the images inside a card that lives outside the repository | `measure-card-images.mjs` | **kept as evidence** — a third symptom the ticket does not mention |
| 5 | Start a service instance of our own against the real repository and the real Vault | `createService({ repo, uiDir, stateDir })` with a temporary `stateDir` | **kept as method** — the owner's `.mrmak/settings.json` is never touched, and the running app is never disturbed |
| 6 | Measure against the running `projectko.exe` | — | **dead** — `/api/*` needs the bearer token, which lives in the UI's memory; the instance cannot be asked |

---

## 1. The three path builders

Read, not changed. The ticket's table is accurate: `src/App.tsx:65` builds the
report URL for every tab, `src/App.tsx:213` builds the path the report viewer
prepends the repository to, and `src/components/Sidebar.tsx:35` builds the
board icon. `contentBase` is the repository's grant
(`desktop/service/server.mjs:335`), and `files.content()` resolves a grant
against its own root (`desktop/service/files.mjs:164-188`).

The service is Vault-aware everywhere the ticket says: `workspace.mjs:64`,
`card-documents.mjs:27`, `files.mjs:96`, `mobile-reports.mjs:26`.

## 2-3. The two URL builders, measured

The whole defect is the difference between two ways of naming the same file:

```
UI:     ${contentBase}/workspace/<board folder>/<file>   -> resolves against the REPOSITORY
service: files.url(<vault root>/<board folder>/<file>)    -> resolves against the VAULT
```

For the default Vault the two names the same thing — down to the grant token
and the path segments (measurement of 02:52, `byte-identical to the UI url
today? YES`). For a Vault elsewhere they name different things, and only one
of them exists.

## 4. The third symptom

A card's images resolve against the card's report URL
(`src/components/CardContent.tsx:31`), so they fail the same way the tab does —
404 with the same ENOENT. The card's *document* is fine because it comes
through an API route that resolves against the Vault.

**This symptom is not in the ticket.** Whoever fixes the bug must fix it too,
or the Gallery of a Vault board shows empty pictures.
