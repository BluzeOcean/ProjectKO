# The worker briefing

Status: shipped 2026-11-25. Every chat Project KO starts begins with a short briefing:
that this is a Project KO project, where the app and the Vault are, and which module to
read before acting.

## Why it exists

A terminal chat used to receive nothing but its working folder. The agent did not know
Project KO existed, did not know what a board or a card is, and searched the disk to find
the app — which is what the owner saw.

Mr. Mak, the fork parent, never injected anything either. It only *seemed* to know,
because the boards lived inside the repository (`<repo>/workspace/<board>`), so Claude
Code and Codex found `<repo>/CLAUDE.md` and `AGENTS.md` by walking up from the working
folder. Commit `a8b888c` moved the Vault out of the repository, and that inheritance
went with it.

## The rule: the briefing is an index, not a description

Project KO is still being built, so anything the briefing repeats will go stale. The
briefing carries only what is true everywhere, and points at one module per domain:

| Module | Owns |
| --- | --- |
| `desktop/modules/vault.md` | the Vault, boards, tabs, cards, the registry |
| `desktop/modules/skills.md` | the project skills and what a skill does not promise |
| `desktop/modules/assets.md` | raw and generated assets |
| `desktop/modules/mcp.md` | MCP servers, codegraph |
| `desktop/modules/rules.md` | the working rules that matter to a worker |

The map is **generated from that folder** (`desktop/service/briefing.mjs`, `modules()`),
so a new domain is a new file and the map follows. `desktop/briefing.md` holds the
owner's prose; the service appends the map and the live paths. The coordinator reads the
same map through `ContextLibrary.orientation()`, so Mak and the workers share one
vocabulary.

The rule lives in `AGENTS.md`: change a domain by editing its module file; never
describe a domain in `desktop/briefing.md` or `desktop/coordinator.md`.

## The three channels, and what was measured

| Harness | Channel | Measured |
| --- | --- | --- |
| Claude Code | `--append-system-prompt-file <path>` | The flag exists in the installed CLI 2.1.287 (probed: an unknown option errors, this one does not). It **fails when the file is missing**, so the service writes the file before the launch. |
| DeepSeek Harness | `dsh --profile sdk --patch <overlay>` on the `system-prompt` row | The overlay reaches the row: `dsh --profile sdk --dump-config --patch <file>` prints the new `personaSuffix` in the composed tree. The probe runs once per machine (854 ms) and caches the persona in `.mrmak/dsh-briefing.json`. |
| OpenCode | `instructions` in the `OPENCODE_CONFIG_CONTENT` pKO already builds | `opencode debug config` reads the key back from a config document; the documented behaviour is that absolute paths are used as-is and a missing file is skipped. |

The fallback, when a harness has no usable channel, is the chat's first message: the
service pastes it with `sessions.input(..., { coordinator: true, submit: true })`, which
is a bracketed paste, so multi-line text stays one prompt. It waits for the CLI to be
ready first (`composerText(screen) !== null && terminalPrompt(screen) === null`) and
never types into a prompt it does not recognise.

## The traps

- **`--add-dir` takes every following argument.** The briefing flag must come before
  it, and `--add-dir` must be last, or the flag is swallowed silently.
- **A dsh patch replaces the whole config of the row it targets.** `personaPrefix` has
  to be restated or the harness loses its persona line.
- **The dsh persona strings are `{{variable}}` templates** and fail assembly on an
  unknown group, so the briefing is made literal before it goes into the overlay.
- **A patch with the wrong `name` is skipped in silence.** The name must be exactly
  `@deepseek-ai/dsh-system-prompt`.
- **OpenCode re-sends its instruction files with every request**, so the briefing stays
  small.
- The DeepSeek bridge watches for a harness that dies while it starts: that is what a
  refused patch looks like, and the briefing then goes in as the first message.

## Turning it off

Settings > Chats > **Brief worker chats**, on by default. The setting is read at launch
time, so turning it off stops the briefing for every later launch, including chats that
are resumed later; a chat that is already running keeps the briefing it started with.
