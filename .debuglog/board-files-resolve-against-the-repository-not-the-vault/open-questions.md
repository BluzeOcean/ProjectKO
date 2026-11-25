# Open questions

What is still undecided. Each one names the measurement that settles it.

---

## Q1. Which way the fix goes: the UI learns the Vault, or the service owns board URLs?

The ticket offers two. The measurement of 02:52 settles the *second half* of
the question: `files.url()` produces a **byte-identical** URL for the default
Vault, so a fix built on it cannot regress the default case.

But the ticket's option (a) — "give the UI the Vault root" — is **incomplete as
written**. The UI holds exactly one grant: `contentBase` is
`${files.origin}/view/${files.repoGrant}`, and the token for a second root is a
secret the service holds. The UI cannot mint a Vault-rooted URL on its own. So
option (a) needs one thing the ticket does not mention: the service must hand
the UI either

- a **Vault-rooted base** (`${files.origin}/view/<vaultGrant>`, plus the
  `workspace/` segment when the Vault is the default), or
- the **vault grant token** itself, or
- the **absolute vault root**, from which the UI can build the path it sends to
  `/api/preview` — but not a URL it can serve.

### The three shapes that actually work

| Shape | What the service gives the UI | What the UI builds | Cost |
| --- | --- | --- | --- |
| **A** — a board base | `boardBase` (one string) | `boardBase + '/' + folder + '/' + file` | smallest; the UI still builds paths |
| **B** — the service answers | `GET /api/workspace/entities/<id>/<step>/url` → `{ url }` | nothing — it uses what it is given | the URL becomes async in a render path that is synchronous today |
| **C** — a registry that carries the URL | each step's `url` in `/api/workspace` | nothing | one round trip fewer than B; changes the shape of the registry the desktop surface reads |

**A is the smallest and it keeps the default Vault byte-identical** (Q2). **B
and C keep the Vault in one place**, which is what the ticket prefers, but C
changes the registry the desktop surface reads and B makes the report URL
asynchronous in `src/App.tsx:65` — a loading state and a failure path where
there is none today.

### What A needs

1. `DesktopState` gains `vaultRoot` (absolute) — for `/api/preview?path=` and
   for the Markdown save, both of which take a path, not a URL.
2. `DesktopState` gains `boardBase` — the base a board file's URL is built on.
   For the default Vault it must be `${contentBase}/workspace`, so the result
   is byte-identical to today; for a Vault elsewhere it is
   `${files.origin}/view/<vaultGrant>`.
3. `src/App.tsx:65`, `src/App.tsx:213` and `src/components/Sidebar.tsx:35`
   build on `boardBase` instead of `contentBase` + `/workspace/…`.
4. `src/components/ReportViewer.tsx:24` sends `${vaultRoot}/${folder}/${file}`
   instead of `${repo}/workspace/${folder}/${file}`.

### What B and C need instead

The service resolves the step to an absolute file and answers with
`files.url(file)`. The traversal check then lives in one place, and the desktop
and mobile sides agree by construction.

**Undecided.** It is the owner's call, and the ticket asks that the choice be
named in the commit.

---

## Q2. Does the default Vault come out byte-identical?

**Answered, yes.** The measurement of 02:52: for the default Vault,
`files.url()` returns the same grant token and the same
`workspace/<folder>/<file>` path as `contentBase + '/workspace/' + folder + '/' + file`.
**Settled** — any fix built on `files.url()` is safe by default.

---

## Q3. Does a board path stay inside the Vault?

**Answered, yes — provided the UI sends a path, not a grant.** `files.content()`
resolves against the grant's root and `realFile()` refuses anything outside it
(`desktop/service/util.mjs:52-57`); `realpath` is resolved on both sides, so a
junction cannot be used to step out either. A vault-rooted grant is therefore
bounded by the Vault, and a repository-rooted grant by the repository.

The one thing to watch: the grant for the Vault covers the **whole** Vault,
not one board. The repository grant already covers the whole repository, so
this is not a new kind of exposure — but it is a new scope, and the owner
should know that the UI would hold it. A board-scoped grant (the kind
`scopedGrant()` mints for a report's own port) would be narrower.

**Undecided:** whether the whole-Vault grant is acceptable, or whether the fix
should mint a scoped grant per board.

---

## Q4. Is this an upstream defect that belongs to Mr. Mak?

**Answered: no.** Upstream has no Vault at all, and its repository-rooted path
is correct there because upstream's boards live in `<repo>/workspace/`. The
Vault arrived in `a8b888c`, which taught the service about the new root and
left the UI's three path builders behind. The defect is ours to fix and there
is nothing to report upstream — see
[`m-2026-11-26-0315-origin-of-the-defect.md`](m-2026-11-26-0315-origin-of-the-defect.md).

It also means the **shape of the fix is a Project KO decision**: upstream will
never need this repair, so the Vault base, a board-scoped grant, and the choice
between "the UI learns the Vault" and "the service owns board URLs" are all
ours to make.

## Q5. Does the fix have to reach the running app?
Yes, if it touches the service. `desktop/prepare.mjs:101` copies
`desktop/service/` into `.cache/desktop-runtime/service/`, and the running
`projectko.exe` (pid 9672 at 02:42) serves from that copy. **A service-side
change needs a rebuild, and the app has to be restarted — and the owner is
present.** Do not restart it without their explicit OK.

A UI-only change is cheaper to try: the UI is served from `dist/`, so a
rebuild of the front end may be enough. That is one more argument for shape A.

---

## Q6. The stale copies under `<repo>/workspace/`

Three boards work today only because an identical copy of their folder sits in
the repository's `workspace/` (measurement of 03:00). Those copies are not in
the Vault's registry and the Vault is what the service reads, so they are
leftovers.

**Undecided:** whether they should be removed. Removing them would make the
defect honest — the affected boards would fail until the fix lands — so they
are better left alone until the fix is in. The ticket's rule "do not move the
boards back into `workspace/`" is right; the question of deleting the stale
copies afterwards is the owner's.
