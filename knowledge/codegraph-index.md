# Code graph (codegraph index)

Status: available on this machine, verified 2026-11-17 against codegraph 1.6.2.

`codegraph init` indexes the repository into `.codegraph/codegraph.db` (SQLite, ~70 MB):
742 files, 18,164 nodes, 43,778 edges, built in 2.8 s. A query answers with the
verbatim source of the relevant symbols, the call path among them and the blast
radius (callers plus affected tests) — what a grep / read / re-grep loop
reconstructs by hand.

## Reaching it from an agent

Two paths, both verified.

1. MCP tool (preferred). The desktop profile
   (`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`) carries a
   `mcp-codegraph` row, so every later session exposes
   `mcp__codegraph__codegraph_explore` with `{ query, projectPath?, maxFiles? }`.
   The row is deliberately not pinned to one directory: with no default project
   the schema requires `projectPath`, so pass the workspace
   (`V:\06_App\ProjectKO`) and the same server also serves any other indexed repo.
2. CLI (any shell, no harness restart): `codegraph explore "<query>" -p <repo>`,
   `codegraph impact <symbol>`, `codegraph callers|callees <symbol>`,
   `codegraph node <symbol|file>`, `codegraph affected <files>`,
   `codegraph context "<task>"`, `codegraph status`, `codegraph sync`.

## Keeping the index useful

- `serve --mcp` watches files and syncs itself once a project is accessed; after a
  batch of edits outside that loop, run `codegraph sync`.
- `codegraph index` rebuilds from scratch; `codegraph unlock` clears a stale lock.
- `.codegraph/` is per machine and stays out of git: the tool writes its own
  `.codegraph/.gitignore` (`*` plus `!.gitignore`) and this repo ignores
  `/.codegraph/`.

## Limits worth remembering

- The file count is dominated by agent skills — 465 Python files against 164 JS,
  52 TSX, 40 TS and 7 Rust. Name repo symbols or paths in a query; one generic
  word mostly returns skill scaffolding.
- Symbols resolve inside a language. Cross-language edges (a TSX call reaching
  Rust over the Tauri bridge) are not in the graph; read `src-tauri/` for those.
- Launch detail: the harness spawns MCP servers without a shell, so the profile
  row uses absolute `node.exe` plus the npm shim. A bare `codegraph` or
  `codegraph.cmd` would not resolve.
