# The coordinator engine

Status: verified 2026-11-20 on v0.6.4. Claude Code drives Project KO; Codex is
the fallback.

The coordinator is Mr. KO: the voice and text persona that opens chats, reads
cards and answers requests. It used to be hardwired to the Codex app-server.
It now sits behind an engine, and Claude Code answers when the CLI is
installed.

## Why the split

`desktop/service/coordinator.mjs` owns the record of what was asked and what
was done: the operations map, the queue that keeps turns in order, the prompt,
the saving, the state. The model that answers sits behind an engine with a
small interface:

```js
engine.start()                                  // ready the session
engine.ask({ prompt, images, operationId })     // resolve with the answer
engine.close()
```

`desktop/service/coordinator-claude.mjs` and `desktop/service/coordinator-codex.mjs`
are the two engines. `coordinator.build()` picks Claude Code when
`commandPath('claude')` resolves and Codex when it does not, so a machine
without Claude Code keeps a working Mr. KO.

The interface is the point: both engines see the same tools and the same rules,
so the behaviour does not depend on which one answers.

## How Claude Code answers

Claude Code runs headless. One JSON line of input goes in on stdin, JSON lines
come out on stdout:

```sh
claude -p --input-format stream-json --output-format stream-json --verbose \
  --mcp-config '{"mcpServers":{"pko":{"type":"http","url":"..."}}}' \
  --strict-mcp-config --tools '' --allowedTools mcp__pko__list_chats,... \
  --permission-mode dontAsk --permission-prompts 'none' --system-prompt '...'
```

- `--tools ''` switches off every built-in tool. The model cannot read a file,
  run a command or edit anything; it can only call the coordinator tools.
- `--permission-mode dontAsk` with `--permission-prompts none` means a turn can
  never stop on a prompt the user cannot see. Anything that would need
  permission is denied instead of waiting.
- `--strict-mcp-config` keeps other MCP servers out, so the model talks only to
  Project KO.
- `--setting-sources user` loads the signed-in account and leaves the
  repository's own settings out.

The tools themselves are an MCP server in the service process
(`openToolServer` in `coordinator-claude.mjs`), on a loopback port of its own
with a token that is new for every start. Claude Code calls a tool by name; the
service decides what the call does. The model never touches the terminal, the
filesystem or a shell by itself.

## The transport trap

The MCP SDK's `StreamableHTTPServerTransport` in stateless mode throws on the
second request: "Stateless transport cannot be reused across requests. Create a
new transport per request." A client sends `initialize` and then
`tools/list`, so the first version of the tool server failed to connect and
Claude Code reported the server as `failed`.

The tool server uses a stateful transport (`sessionIdGenerator`) instead. One
transport, one session, and every request carries the session id.

## The opening event arrives too late to wait for

Claude Code announces its session with a `system/init` event, and that event
only arrives **after the first user message**. A session that is started and
then left alone produces `hook_started` and `hook_response` and nothing else:

```
NO MESSAGE SENT, events after 20s: system/hook_started, system/hook_response
AFTER MESSAGE, events:            system/hook_started, system/hook_response, system/init, assistant/, result/success
```

So the engine writes the first turn as soon as the process is up. Waiting for
`init` before writing the message is a deadlock: the event waits for the
message, and the message waits for the event. The `init` event is read for the
model name only, once it arrives.

## The answer, not the tool calls

The turn ends on the `result` event, which carries the model's last word. The
assistant's text blocks are kept as a fallback for a turn that ends without one.
A tool call is not an answer: `tools/call` is answered by the service, and
Claude Code sends the result back before the model speaks.

## Limits

- An image travels inline only when it is under 4 MB and of a known type.
  A larger one stays a path in the prompt.
- The whole system prompt travels as one command-line argument, so the
  orientation is trimmed to keep the pair inside what a command line carries.
- The engine is chosen once, when the coordinator starts, and stays for the
  life of the service.
