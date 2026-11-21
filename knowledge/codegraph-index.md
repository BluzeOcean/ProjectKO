# Code graph (codegraph index)

Status: **live in-session**, verified 2026-11-21 on dsh 0.2.2-rc.5 against codegraph 1.6.2.

`codegraph init` indexes a repository into `.codegraph/codegraph.db` (SQLite). This
repo's index is current: 760 files, 18,497 nodes, 44,522 edges, ~72 MB. One query
answers with the verbatim source of the relevant symbols, the call path among them
and the blast radius (callers plus affected tests) — what a grep / read / re-grep
loop reconstructs by hand.

## Reaching it from an agent

1. MCP tool (preferred): `mcp__codegraph__codegraph_explore`
   (`{ query, projectPath, maxFiles? }`). `projectPath` is **required** — the
   server is machine-wide and starts with no default project, so pass the repository
   (`V:\06_App\ProjectKO`) and the same server also serves any other indexed repo.
2. CLI (any shell): `codegraph explore "<query>" -p <repo>`, `codegraph impact <symbol>`,
   `codegraph callers|callees <symbol>`, `codegraph node <symbol|file>`,
   `codegraph affected <files>`, `codegraph context "<task>"`, `codegraph status`, `codegraph sync`.

## How it is mounted (and the trap that hid it)

The server is an `@deepseek-ai/dsh-mcp-client` plugin row in the desktop profile
(`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`), wrapped in a top-level
`- insert:` block. That wrapper is **mandatory**:

- `- insert: [...]` with no `id` appends the entries to the root plugin list — this
  is what mounts a brand-new plugin.
- A bare `- id: X, name: Y` entry is an **override** patch. The loader looks `X` up
  in the composed tree and, when it is missing, logs `patch: entry ... not found`
  and **drops it silently**.

That is exactly why the earlier root-level `mcp-codegraph` row never spawned a
process and no `mcp__codegraph__*` tool ever appeared, despite the row looking
correct. Source of truth: `cordis-plugin-include/src/patch.ts` (`applyPatches`).
The same trap still applies to the `mcp-gd` and `mcp-unreal` rows in that file —
they are overrides of ids that do not exist, so they mount nothing either.

The profile patch layer is **hot-reloaded**: saving the file mounts the server into
the running session, with no restart.

Launch detail: the harness spawns MCP servers without a shell, so the row uses an
absolute `node.exe` plus the npm shim (`...\npm\node_modules\@colbymchenry\codegraph\npm-shim.js`)
and `args: [serve, --mcp]`. A bare `codegraph` or `codegraph.cmd` would not resolve.
The shim survives `npm i -g` / `codegraph upgrade`.

## Keeping the index useful

- `serve --mcp` watches files once a project is accessed; after a batch of edits
  outside that loop, run `codegraph sync`.
- `codegraph index` rebuilds from scratch; `codegraph unlock` clears a stale lock.
- `.codegraph/` is per machine and stays out of git (it writes its own
  `.codegraph/.gitignore`; this repo also ignores `/.codegraph/`).
- A project with no index simply needs `codegraph init` run once in it — the running
  server picks a new index up live.

## Limits worth remembering

- File count is dominated by agent skills — 465 Python files against 177 JS, 54 TSX,
  43 TS and 7 Rust. Name repo symbols or paths in a query; one generic word mostly
  returns skill scaffolding.
- Symbols resolve inside a language. Cross-language edges (a TSX call reaching Rust
  over the Tauri bridge) are not in the graph; read `src-tauri/` for those.
- When the index is stale, the tool still answers — verify against disk before
  editing anything the query only summarised.
