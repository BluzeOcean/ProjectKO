# The harness's process, in the chat window

Status: written 2026-11-28.

A DeepSeek Harness chat used to be silent while it worked. The harness reports
everything it does as session events; Project KO was reading only the answers
out of them. Now the chat shows the work: the thinking, the tools, and what
each tool was asked to do.

## Where the data comes from

The road is already there, and it was already carrying the data:

1. `dsh --profile sdk` runs behind `desktop/service/dsh-bridge.mjs`, speaking
   JSON-RPC over stdio.
2. The harness forwards **every** session event to the bridge, unfiltered, as
   a `session.event` notification.
3. The bridge writes every one of them to `<stateDir>/dsh/<sessionId>.jsonl`
   (`dsh-bridge.mjs`, `record()` — the raw event, before anything is printed).
4. `sessions.watchDsh` tails that file every 700 ms and reads the usage from
   it. It now reads the process from it too.
5. The service emits `dsh-process`; the window shows it.

So the thinking and the tool arguments were **on disk all along**. Nothing
about the harness had to change, and no token is spent on showing them.

The tailer only reads when the log grows, so an idle harness pushes nothing.
The process therefore also travels on **subscribe**: a window that opens a
chat, or a second window that joins later, is sent the work that is already
done. Without that, the panel would stay empty until the harness did
something.

## What is worth knowing about the events

| the data | where it sits in the log |
| --- | --- |
| the thinking | `assistant/message` → `data.message.content[]`, a block of type `reasoning` |
| the tool's arguments | `tool/call` → `data.arguments` (raw JSON string, unparsed by the harness) |
| the tool's answer | `tool/result` → `data.message.content`, and `data.meta` (the tool's own presentation) |
| the token stream | `assistant/message` → `data.stream[]`, with per-token `texts[]` and `dt[]` (ms) |
| the lifecycle | `turn/start`, `step/start`, `step/end`, `turn/end`, `job/registered`, `job/settled` |

The whole vocabulary is `KNOWN_SESSION_EVENT_TYPES` in
`@deepseek-ai/dsh-session`. The harness's source, TypeScript and all, is
inside the app's `app.asar`; read it with an asar reader rather than guessing.

## The ceiling: per step, not per token

The SDK profile notifies `session.event`, `session.status`,
`subagent.started` and `subagent.finished` — and nothing else. It does **not**
forward the harness's live `agent/assistant-stream` frames. So:

- **live, as it happens:** every tool call, every tool result, every step and
  turn boundary.
- **at the end of each model step:** that step's reasoning text.
- **never token by token.**

Going finer would mean either patching the harness or using its headless
runner — and the headless runner is **one prompt per process**
(`dsh-headless`: "the prompt text for the single run"), which cannot replace
a persistent multi-turn chat with its approval channel. Do not go looking for
a token stream the SDK profile does not carry.

## The vocabulary is the harness's own

`toolCategory()` and `toolDetail()` in `desktop/service/dsh.mjs` are the
harness's map, taken from `dsh-client-ui-chat`'s `process-activity`:

- the categories: `read`, `readImage`, `search` (grep, glob, `*_inspect`),
  `write`, `edit` (edit, apply_patch), `commands` (bash, pwsh, exec_command,
  write_stdin, `terminal_*`), `code` (run_code), `webSearch`, `webFetch`,
  `subagents`, `plan` (todo_write, create_goal, …), `questions`, and `tools`
  for anything else;
- the live detail: the first of `title, description, objective, task, …,
  command, pattern, file_path, path, target, …` present in the arguments,
  cut to 160 characters.

So a summary reads the way the harness's own chat reads: `read 2 · commands 1`.

## The panel

`src/desktop/DshProcess.tsx`, drawn in the conversation column above the
composer.

- While the agent works, the panel is open: the newest thinking is open, the
  tools are one row each with their state (running, completed, failed), and
  the header counts the categories.
- When the turn ends, the panel folds into a `<details>`, in the manner of the
  existing `conversation-activity` block.
- The last two turns travel; each carries thirty tools, six steps of thinking
  and four thousand characters of thinking. The full text stays in the log.

The reasoning and the tool details are **plain text**, never Markdown: they
are the model's own words, and nothing in them should be read as markup.

## Tests

- `desktop/service/test/dsh.test.mjs` — the projector, over the harness's own
  event shapes.
- `desktop/service/test/dsh-process-ui.mjs` — the whole road: a log on disk,
  the tailer, the projection, the websocket, and the panel. It seeds a log
  and lets the service's own watcher read it.

## Still to do

- The finished turns' processes are not kept in the chat's history; the panel
  holds the last two. Folding each turn's process into the transcript, the way
  the harness's own chat does, is the natural next step.
- The terminal view still prints only the reply and the tool names
  (`dsh-bridge.mjs`, `show()`).
- The other agents have structured events too — Codex accumulates deltas it
  never emits (`coordinator-codex.mjs`), Claude Code overwrites its answer on
  each frame (`coordinator-claude.mjs`) — and the same projector could serve
  them.
