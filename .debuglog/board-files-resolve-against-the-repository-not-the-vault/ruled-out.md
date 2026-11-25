# Ruled out

Every entry here was measured and found wanting. **Do not try it again.** If
you think an entry is wrong, the way to reopen it is a new measurement in
[`evidence.md`](evidence.md) that contradicts it — not a re-run of the old one.

---

### "The Vault setting is wrong"

**Dead.** `vaultPath` in `.mrmak/settings.json` is `V:\03_Vault\PKO`, and
`Vault.root` resolves to it (`desktop/service/vault.mjs:15`). The board is
found, listed, and its steps are named correctly in the tab strip. The
measurement of 02:50 read the same Vault through the same service and served
the board's report with 200.

### "The registry is wrong"

**Dead.** `V:\03_Vault\PKO\workspace.json` is the file being read; the board
appears with all eleven of its steps, and `workspace.json` was read in the
measurement of 02:50.

### "Cards are broken too, so the service is not Vault-aware"

**Dead.** `GET /api/workspace/cards/<entityId>/<step>` answered **200** in the
measurement of 02:50. It goes through `cards.read()` → `resolve()` →
`realpath(this.workspace.vault.root)`, which is the Vault root. The card's
*document* is fine. (Its *images* are not — see
[`m-2026-11-26-0255-card-images-404.md`](m-2026-11-26-0255-card-images-404.md);
that is a different fault, in the URL the card's images are resolved against.)

### "The file server cannot serve a Vault outside the repository"

**Dead.** `desktop/service/test/vault.test.mjs` already proves it, and the
measurements of 02:50 and 02:52 serve the same board's report with **200**
through `files.url()`.

### "The report content is broken"

**Dead.** The board's own HTML is correct and is served from the Vault folder
with 200 in the measurement of 02:50.

### "Only the Markdown tab is broken"

**Dead.** The measurement of 02:52 shows both: the `.html` step answers 404
through the UI's URL and 200 through the service's, and the `.md` step behaves
the same way. The ticket could only read the HTML failure from the code; it is
now observed.

### "The UI cannot build a Vault-rooted URL, because it has no grant for the Vault"

**Partly dead, and the reason it matters.** The UI holds one grant —
`contentBase` is `${files.origin}/view/${files.repoGrant}` — and the grant
token for a second root is a secret the service holds. So the UI cannot mint a
Vault URL on its own. But it does not have to: the **service** already can,
through `files.url()`, and that builder is byte-identical to the UI's URL for
the default Vault (measurement of 02:52). The ticket's option (a) therefore
needs one thing it does not mention — the service must hand the UI a
Vault-rooted base, or answer for the URL itself. See
[`open-questions.md`](open-questions.md).

### "The stale copies in `<repo>/workspace/` are the fix"

**Dead, and dangerous.** Three boards work today only because an identical copy
of their folder still sits in the repository's `workspace/` (measurement of
03:00). Copying the Vault back into the repository is what the ticket's rules
forbid, and it would hide the defect rather than repair it: the moment a board
is created in the Vault and not copied, its tabs break again.
