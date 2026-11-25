---
name: mcp
label: MCP servers, and the codegraph index
description: The MCP servers a chat can reach, how to check them, and the codegraph index.
---

# MCP servers

MCP servers give a chat tools that reach other programs. Project KO keeps its own tools
for its coordinator; **you are a worker in a terminal, and your tools come from the CLI
you are running.**

## What is configured

- The repository's `.mcp.json` is the project's own list and is currently empty.
- The user's global and plugin MCP servers are the ones a CLI picks up on its own.
  Project KO inventories them in its MCP panel (`desktop/service/mcp.mjs`) — the panel
  lists configuration, not live connections.
- The DeepSeek Harness mounts servers through its profile patch layer
  (`~/.dsh/profiles/<profile>/cordis.patch.yml`).

**Configured is not connected.** A server listed in a config file may be missing its
binary, its key or its account. Before you promise a result from an MCP tool, call it
once and look at what comes back.

## codegraph

The codegraph index answers code questions about a repository with one query: the
verbatim source of the relevant symbols, the call path between them, and the blast
radius — the callers plus the affected tests.

- MCP tool (preferred): `mcp__codegraph__codegraph_explore` with
  `{ query, projectPath }`. `projectPath` is **required** — the server is machine-wide
  and starts with no default project. Pass the repository you are asking about.
- CLI (any shell): `codegraph explore "<query>" -p <repo>`, plus `impact`, `callers`,
  `callees`, `node`, `affected`, `context`, `status` and `sync`.

The index in this repository is current; `knowledge/codegraph-index.md` has the details
and the reachability notes.

## Asking for a connection

If the task needs a server that is not there, say which one and what it would do, and
let the owner connect it. Do not install a server, add a key, or write a config file
outside the project you were pointed at.
