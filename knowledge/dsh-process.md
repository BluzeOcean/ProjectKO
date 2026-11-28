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

## The block

`src/desktop/DshProcess.tsx`. It stands **in front of the answer** its turn
produced - the thinking, then the report - and it is a **hamburger**: a bar on
top, a bar at the foot, and the work between them. Clicking either bar folds
the whole thing into one row, and **both bars carry the status**, so the fold
is never a blank.

- The **top bar** carries the counts and the state: `running · 1.2K tok` while
  the turn works, `✓ done · 12.3K tok` when it is done.
- The **foot bar** carries the same state and what it cost: the tokens, how
  long the turn took, how many steps it took, and the live detail - the
  running tool's category and its one line, or the model's last thought when
  no tool is in flight. That is the harness's own shape: its
  `processActivity` falls back to the running reasoning's last paragraph when
  nothing is running.
- **The thinking folds** to the whole text of the step, unabridged, under a
  `Step N` mark. It is not cut short: a real turn's thinking runs to about two
  hundred thousand characters across its steps, and the largest single block
  seen in a real session was sixty-eight thousand.
- **The tools are one row each**, with the one line that says what they were
  asked to do, and their state.
- **The counts are in the harness's order**: the busiest category first, ties
  by first use.
- A turn that is **working opens itself** - that is the one the reader is
  watching. A finished turn folds away, and the reader opens it if they want
  the work behind the answer.

The tokens are the turn's **output** tokens: DeepSeek reports no bucket of
its own for the reasoning, so it is counted with the answer.

The reasoning and the tool details are **plain text**, never Markdown: they
are the model's own words, and nothing in them should be read as markup.

## Where the block goes

The transcript carries the work of each turn, and each answer says which turn
it belongs to. The window puts the work of a turn in front of that turn's
first answer, and a turn whose answer has not arrived yet keeps its work at
the end, where the eye already is. The service pushes the turn that is
running, and that push is the fresher of the two.

The last three turns travel; each carries thirty tools and six steps of
thinking.

## Tests

- `desktop/service/test/dsh.test.mjs` — the projector, over the harness's own
  event shapes.
- `desktop/service/test/dsh-process-ui.mjs` — the whole road: a log on disk,
  the tailer, the projection, the websocket, and the block. It seeds a log
  and lets the service's own watcher read it.

## Still to do

- The finished turns' work is in the chat's history now, but only the last
  three turns carry their thinking. Older turns show their answer alone.
- The terminal view still prints only the reply and the tool names
  (`dsh-bridge.mjs`, `show()`).
- The other agents have structured events too — Codex accumulates deltas it
  never emits (`coordinator-codex.mjs`), Claude Code overwrites its answer on
  each frame (`coordinator-claude.mjs`) — and the same projector could serve
  them.
