# Project KO — the folders, the terms, and the loop

Read this before you hunt for a file. It is the map of where things live and
what the loop is. It does not describe the Vault's schema, the skills or the
MCP servers — those have their own module in `desktop/modules/`.

The failure this file prevents: an agent asked for a board, a design document
or a game project, searches the application folder, finds nothing, and reports
that the work does not exist. It exists. It is in the **Vault** or in the
**Workspace**, and neither of them is inside the application folder.

---

## 1. The three terms

Project KO has exactly three places. One name each.

| Term | What it is | Resolved from |
| --- | --- | --- |
| **App** | The application folder: the source, the skills, the owner's working material. | The folder the app was launched with |
| **Vault** | The owner's documents: boards, cards, reports, concept art, the registry. | `.mrmak/settings.json` → `vaultPath` |
| **Workspace** | The code project a chat works in: an Unreal, Unity or Godot project. | The chat's own working folder |

**The house convention: the Vault and the Workspace are always outside the App
folder.** The App folder holds Project KO and its configuration — never the data
of a project the owner is working on. The two are linked by path, never by
copying content between them.

The worker briefing states this on every launch
(`desktop/service/briefing.mjs`):

```
- App: V:\06_App\ProjectKO
- Vault: V:\03_Vault\PKO
- Workspace: D:\UE\EpicJam2026
```

---

## 2. The map of this installation

Concrete paths, as they are on this machine. The Vault and the Workspace move
per owner; read the first two from the sources in the table above rather than
trusting these lines.

| Thing | Path here |
| --- | --- |
| App | `V:\06_App\ProjectKO` |
| Vault | `V:\03_Vault\PKO` |
| Registry (every board) | `V:\03_Vault\PKO\workspace.json` |
| A board's own folder | `V:\03_Vault\PKO\<YYYY-MM-DD>_<slug>\` |
| A game project (Workspace) | `D:\UE\IronPath` |
| Unreal procedures | `V:\04_Projects\Workshops\Unreal_Workshop\.skills\` |

---

## 3. Inside the App folder

| Folder | Holds | Status |
| --- | --- | --- |
| `src/`, `desktop/`, `src-tauri/` | the application | current |
| `docs/` | guides, including this file | current |
| `.agents/skills/` | the project skills, maintained source | current |
| `.claude/skills/` | the complete Claude Code copy of the skills | current |
| `processes/` | repeatable workflows and checklists | current |
| `knowledge/` | lessons that should guide future work | current |
| `context/` | the owner's preferences and goals | current |
| `inbox/` | incoming references and clipboard screenshots | current |
| `.mrmak/` | settings, card backups, runtime state, briefings | current |
| `projects/` | project specifications | see §5 |
| `workspace/` | the pre-split default Vault location | **deprecated — see §5** |

The Files rail shows the App's own folders: `inbox`, `projects`, `workspace`,
`knowledge`, `processes`, `context` (`desktop/service/files.mjs`). A board is
**not** one of them. A board is a folder in the Vault.

---

## 4. The loop

```
you  ──▶  coordinator (Mak, in the app)
             │  names the chat, picks the agent and the effort,
             │  opens the chat with cwd = the Workspace
             ▼
        worker chat  ──▶  reads the Workspace's own AGENTS.md / CLAUDE.md
             │           does the work in the Workspace
             ▼
        deliverable  ──▶  a board in the Vault
                             registry updated, tab registered,
                             captures and playtest notes kept beside it
```

1. **Say what you want to the coordinator.** It names the chat (2–5 words,
   English), chooses the agent, sets the reasoning effort, and opens the chat
   in the right Workspace. If more than one project matches, it asks which.
2. **The worker reads the project's own rules**, not Project KO's. A game
   repository carries its own `AGENTS.md`; that file is the rulebook for work
   inside it.
3. **Work happens in the Workspace** — the code folder.
4. **Deliverables land in the Vault.** A board, a tab, a card, the captures.
   Register the tab in `workspace.json`; do not create a second copy of the
   same work.
5. **If a board is generated from a repository, re-run its generator** after a
   session. The board follows the records; a figure that is not in the records
   does not go on the board.
6. **Continue in the same chat.** Reopen it rather than opening a duplicate.

### What to say to the coordinator

The shape that works: **context, then a concrete target, then the folder.**

> *Read `projects/<name>/README.md` and the level contract, then greybox the
> first island: a third-person character with run, jump and double jump, and
> one collectible. Unreal Engine 5.9, Blueprints. Confirm the target
> `.uproject` before editing it. Verify the editor and the MCP bridge are
> actually up before you promise an in-engine result. Show real editor
> captures, and record what you tested in the project's board.*

An overview with no target gets a question back. A target with no folder gets
"which project?". Both are the app working correctly.

### What the coordinator does not do

It does not write project code, and it does not keep project data. It routes
work to a visible worker chat and reports back what that chat verified. Routine
operations — reading a card, archiving a board, changing a status — it does
itself, without opening a chat.

---

## 5. The two leftovers, and what was decided

Both are pre-split artefacts. Neither breaks anything today, and both are
misleading when an agent (or a person) takes the folder name literally.

### `workspace/` in the App folder — deprecated, name kept for now

Before the Vault was split out, the boards lived in `<repo>/workspace/`. That
folder is still the **default Vault location** for a fresh install
(`desktop/service/vault.mjs`) and still holds the starter boards. Once
`vaultPath` is set, it is inert.

The name is the problem: `workspace/` in the App folder means "the default
Vault", while `Workspace` everywhere else means "the code project". A reader
who takes the folder name literally will look for boards in the App folder,
and for game code in the Vault.

It also appears in the Files rail as a peer of `projects/` and `knowledge/`,
which reads as "this is where project deliverables go".

**Decision: the folder is not renamed in this change.** Renaming it is small
and contained, but it moves the default Vault path for every install that has
not chosen one, it needs a data migration for the starter boards already in
the folder, and it only takes effect once a new build is installed — so the
installed app and this document would disagree until then. The naming is
neutralised in the places a reader actually meets it instead: this file, the
in-app help, `AGENTS.md` and the code comment at the default path.

| File | What depends on the literal path |
| --- | --- |
| `desktop/service/vault.mjs` | the default Vault root |
| `desktop/service/files.mjs` | the Files rail root and its folder list |
| `scripts/ensure-workspace-link.mjs` | the `public/workspace` junction the dev server serves |
| `scripts/check-template.mjs` | the template check reads `workspace/workspace.json` |

Rename it when a build that moves the default path is the next thing shipped.
Until then, `vaultPath` is the answer, and every install that has chosen a
Vault is unaffected.

### `projects/` in the App folder — ambiguous

`AGENTS.md` describes it as *project specifications*. Under the house
convention, a project's documents belong in the Vault, with its code in the
Workspace — which is exactly where the IronPath specification already lives,
as a board. Two homes for one document is the confusion this file is meant to
end.

**Decision:** a board in the Vault is the home for a project's specification,
design record and work board. `projects/` keeps only what is genuinely
app-level scaffolding, and is otherwise retired. `My Dream Game` keeps its
`projects/my-dream-game/README.md` because it is a shipped sample whose board
links to it.

---

## 6. Where a deliverable goes

| The deliverable | Goes in |
| --- | --- |
| A board, a card, a report, concept art | the Vault, in a board folder |
| The registry entry for a board | the Vault's `workspace.json` |
| Game code, assets, `.uproject` | the Workspace |
| A reusable workflow | the App's `processes/` |
| A lesson worth keeping | the App's `knowledge/` |
| A skill | the App's `.agents/skills/`, then `npm run skills:sync` |
| The owner's preferences and goals | the App's `context/` |

---

## 7. How to find things without guessing

| You want | Look here |
| --- | --- |
| The Vault path | `.mrmak/settings.json` → `vaultPath` |
| Every board | the Vault's `workspace.json` → `entities[]` |
| A chat's working folder | its briefing file, `.mrmak/briefing-<id>.md` |
| The Vault's rules, the skills' rules | `desktop/modules/` — one file per domain |
| A game project's rules | that project's own `AGENTS.md` / `CLAUDE.md` |
| The project skills | `.agents/skills/` (source), `.claude/skills/` (copy) |
| The connected tools | the MCP panel — configuration, not live connections |

**Configured is not connected.** A server listed in a config file may be
missing its binary, its key or its account. Before promising a result from a
tool, call it once and look at what comes back.

---

## 8. Wording that was wrong, and what it says now

These were the places that taught a reader the wrong map. They are corrected,
but the old wording is listed here because the same mistake is easy to repeat.

| Where | It used to say | It says now |
| --- | --- | --- |
| `docs/getting-started.md` — "Choose a folder" | the folder must contain `workspace/workspace.json` | it may also hold `.mrmak/settings.json` (`has_vault` in `src-tauri/src/main.rs`) |
| `docs/getting-started.md` — "Connect one agent" | "choose the repository as the workspace" | choose the **workspace** — the code project the chat works in |
| `workspace/_shared/help.md` — "Two windows, one repository" | one repository | two folders: the Vault and the Workspace, both outside the App |
| `workspace/_shared/help.md` — Files table | `workspace/` holds cards, reports and deliverables | it holds the starter boards; a chosen Vault holds the cards and reports |
| `src-tauri/src/main.rs` — error text | "No Workspace repository selected" | "No Project KO folder selected" |
| `desktop/service/knowledge/providers.mjs` — provider label | "This Workspace repository" | "This Project KO folder" |
| `AGENTS.md` — repository map | `workspace/`: reports and example cards | the default Vault location, deprecated once `vaultPath` is set |
