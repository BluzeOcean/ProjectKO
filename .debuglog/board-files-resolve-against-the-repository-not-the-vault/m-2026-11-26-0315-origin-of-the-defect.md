# Where the defect came from

**Measured 2026-11-26 03:15.** The question: is this inherited from Mr. Mak, or
was it created during the Project KO customisation?

**Answer: created during the customisation.** The *code* is inherited; the
*defect* is ours.

## The evidence

**The upstream has no Vault at all.**

```
$ git remote -v
upstream  https://github.com/witnesstodark/mr-mak-workspace.git
$ git log --oneline -1 upstream/main
57adc60 Prepare 0.6.4 with compact New chat and Conversation fixes
$ git ls-tree upstream/main desktop/service/ --name-only | grep -i vault
(no output — there is no desktop/service/vault.mjs upstream)
```

**Upstream's UI builds the very same path, and it is correct there.**

```
$ git show upstream/main:src/App.tsx | grep -n "contentUrl"
46:  const reportUrl = entity && step ? contentUrl(`/workspace/${entity.folder}/${step.path}`) : null
178:  ... relativePath={`workspace/${entity.folder}/${step?.path}`} ...
```

Upstream's boards live in `<repo>/workspace/`, so a repository-rooted path is
the right path. The line came into this repository's history with
`e6d5f1e Initial release of Mr. Mak Workspace` — it is upstream code, unchanged.

**The Vault arrived in `a8b888c`.**

```
$ git log --oneline --diff-filter=A -- desktop/service/vault.mjs
a8b888c Give the Vault its own folder, name both windows, and let Toxic do the listening
```

That commit (2026-11-23) is the whole customisation: it added `vault.mjs`, the
`vaultPath` setting, the Vault-aware branches in `files.mjs` (`files.url()`),
`workspace.mjs`, `mobile-reports.mjs`, `card-documents.mjs` and `server.mjs`,
and `desktop/service/test/vault.test.mjs`. It moved the boards out of the
repository — so it made the inherited assumption false.

**And it updated the UI — but only the labels.**

`a8b888c` touched 31 files under `src/`. Every one of those changes was a
word: "Workspace" → "Vaultspace", "cards" → "boards", and one new field:

```
src/desktop/types.ts
- export interface Settings { …; systemEvents?: SystemEventsMode }
+ export interface Settings { …; systemEvents?: SystemEventsMode; vaultPath?: string }
```

Note where that field went: **`Settings`**, the saved settings the service
reads — not **`DesktopState`** (`src/desktop/types.ts:43`), the runtime
payload the UI reads from `/api/bootstrap`. The service learned the Vault root;
the UI's runtime state never did. That is the gap this whole bug is.

The three path builders — `src/App.tsx:65`, `src/App.tsx:213`,
`src/components/Sidebar.tsx:35` — and `src/components/ReportViewer.tsx:24`
were **not** touched. Neither were they touched by the four later commits that
came near them (the dictation and briefing work: `b239639`, `d021b43`,
`8f48f7b`, `14829d4`).

## Why the mobile preview works and the desktop does not

`a8b888c` did update `mobile-reports.mjs`, because the mobile side builds its
report URL **in the service**. The desktop side builds its URL **in the UI**,
and the UI was left behind. Same feature, one side updated, one side not.

## What this settles

- **Ours to fix.** It is not an upstream defect and there is nothing to report
  to `witnesstodark/mr-mak-workspace`.
- **A pKO regression**, in the sense that upstream's behaviour was correct and
  a customisation broke it without updating the code that depended on it.
- **The shape of the fix is a pKO decision.** Upstream will never need this
  repair, so the fix does not have to be shaped the way upstream would shape
  it — and the Vault base, the board-scoped grant and the choice between "the
  UI learns the Vault" and "the service owns board URLs" are all pKO's to make.
