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

## Where the harness's own chat lives

Its source is in the app's `app.asar`, under
`/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/`. The files that matter
for the look of the chat:

| file | what it holds |
| --- | --- |
| `src/client/conversation-nodes/README.md` | the rules of the chat: how a turn folds, what a group is, what is visible when |
| `src/client/conversation-nodes/process-activity.ts` | the categories, the live detail, and the running/preparing states |
| `src/client/conversation-nodes/turn-process.ts` | the control that owns a turn's process |
| `src/client/conversation-nodes/turn-tail.ts` | the completed-turn footer: facts at the end of a turn |

The asar is readable with a small script: the header is a JSON index at
offset 16, and a file's bytes sit at `8 + readUInt32LE(4) + offset`. Name the
helper `.cjs` — a `package.json` with `"type": "module"` up the tree makes a
`.js` helper an ES module and `module.exports` disappears.

## The panel

`src/desktop/DshProcess.tsx`, drawn in the conversation column above the
composer. It follows the harness's own chat:

- **The last line is the live detail.** The harness's `processActivity` puts
  the running tool's category and its one line there, and when no tool is in
  flight it falls back to the last paragraph of the running reasoning. This
  panel does the same, and says **Done** when the turn has ended.
- **The working state is on that last line**, not on the head of the box. The
  head carries the counts and nothing else.
- **The thinking folds** to one line that says what the step was thinking
  about - the last paragraph, in the harness's own terms. Opened, it is the
  whole of it: the thinking is not cut short. A real turn's thinking runs to
  about two hundred thousand characters across its steps, and the largest
  single block seen in a real session was sixty-eight thousand.
- **The tools are one row each**, with the one line that says what they were
  asked to do, and their state.
- **The counts are in the harness's order**: the busiest category first, ties
  by first use.
- When the turn ends the panel folds into a `<details>`, in the manner of the
  existing `conversation-activity` block.

The last two turns travel; each carries thirty tools and six steps of
thinking. The reasoning and the tool details are **plain text**, never
Markdown: they are the model's own words, and nothing in them should be read
as markup.

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
