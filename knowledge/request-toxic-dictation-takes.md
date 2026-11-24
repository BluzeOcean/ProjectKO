# Request: tell a partner app which window a dictation take was typed into

**Status:** open. **Raised:** 2026-11-24 by Project KO (this repository).
**Addressed to:** whoever owns the **Toxic** repository at `V:\04_Projects\Toxic`.

This is a ticket, not a change. Project KO cannot edit Toxic; it can only report
what was measured and what has to change.

It is related to [the chord ticket](request-toxic-chord.md), which asks for the
chord to open a take while a Project KO window is in front. This ticket asks for
something else: when a take **does** happen, the partner app has to learn where
the words went, without guessing.

## The problem

Toxic is a machine-wide tool. Its chord opens a take in whatever application
has the focus, and the transcript is typed into that same window with
`SendInput` (`src-tauri/src/input.rs` -> `inject::type_text`). A partner app
that is not that window has to decide whether the words belong to it, and
today it cannot - so it guesses.

Project KO's guess lives in `src/desktop/useToxicTranscripts.ts`: it polls
Toxic's transcript history every 900 ms and compares timestamps against its own
window focus. **That guess was wrong, and it shipped a defect.** On 2026-11-24
a take made in Chrome was also typed into the Project KO terminal, because
Toxic's history holds every take on the machine and nothing in the answer says
which window a take belonged to. The fix in Project KO
(`knowledge/dictation-memory.md`) makes the guess much more careful - a
transcript is only placed when the take ended while the Project KO window had
the focus - but it is still a guess, reconstructed from two clocks.

Toxic already knows the answer. Toxic performs the typing itself, so it knows
the window that received the words. It just does not say.

The cost of the guess, measured on this machine against the running Toxic:

| | per poll | at 1.11 polls/s |
| --- | --- | --- |
| Project KO service (HTTP in, MCP out) | 1.18 ms CPU | ~1.3 ms |
| Toxic (answering `status`) | 0.125 ms CPU | ~0.14 ms |

Small, but it is a question asked forever to recover something Toxic already
knows, and it is the reason the ownership rule had to be a guess at all.

## What Project KO asks for

### 1. A take that says where its words went

Extend the `dictation` tool's `status` action with a `takes` array: the recent
takes, newest last, each entry carrying the transcript and the window it
belongs to.

```json
{
  "listening": false,
  "last": { "text": "hello world", "at": 1795495697636 },
  "takes": [
    {
      "id": 7,
      "text": "hello world",
      "startedAt": 1795495690000,
      "at": 1795495697636,
      "owner": "hotkey",
      "openedIn":  { "pid": 11028, "process": "chrome.exe", "title": "YouTube - Google Chrome" },
      "typedInto": { "pid": 11028, "process": "chrome.exe", "title": "YouTube - Google Chrome" }
    }
  ]
}
```

| field | meaning |
| --- | --- |
| `id` | an identifier for this take, unique and increasing. `HistoryEntry.id` is currently `now_ms()`, so a take and its start can share a value; a real id is wanted. |
| `text` | the transcript, as it is today |
| `startedAt` | when the take opened (epoch ms), so a partner can tell a long take from a stale entry |
| `at` | when the transcript was produced (epoch ms) - the existing `last.at` |
| `owner` | who opened the take: `"hotkey"` (Toxic's own chord) or `"partner"` (a partner app asked Toxic to listen). Toxic already has this distinction internally as `Owner::Hotkey` / `Owner::Partner` in `src-tauri/src/dictation.rs`; it is simply not published. |
| `openedIn` | the foreground window when the take opened |
| `typedInto` | the foreground window when the words were typed - `null` for a partner take, because a partner take is handed back instead of typed |

`openedIn` and `typedInto` are the same object:

```json
{ "pid": 11028, "process": "chrome.exe", "title": "YouTube - Google Chrome" }
```

- `pid` - the process that owns the foreground window
  (`GetForegroundWindow` -> `GetWindowThreadProcessId`).
- `process` - the executable name, so a caller can match without knowing the
  pid. Project KO's own windows are `projectko.exe`.
- `title` - the window title. Project KO's two windows are `Project KO — Chats`
  and `Project KO — Workspace`, so the title tells the two apart where the pid
  cannot.

`openedIn` and `typedInto` differ when the person moves between windows during
a take; the second is the one that matters, because it is where the words
actually went.

**This must be additive.** `listening` and `last` keep their current shape and
meaning, so a partner that ignores the new fields keeps working. `takes` holds
the recent takes only (the last 10 is enough for a partner; the history itself
stays at 100).

### 2. A way to learn about a take without asking every 900 ms

The richer answer alone already helps: a self-describing take stays correct
however late it is noticed, so Project KO can poll slowly (every few seconds)
and stop guessing. But the polling can go away entirely if Toxic offers a push.

Any of these is acceptable; **(a) is what Project KO would use first**.

**(a) A callback.** A new action on the same tool:

```text
dictation { "action": "subscribe", "callback": "http://127.0.0.1:54646/api/dictation/take" }
```

Toxic POSTs the take object (the entry above, without the array) to that
address when a take ends. Loopback only, like Toxic's own MCP server; an
optional bearer token may be passed alongside so the partner can authenticate
the call. `unsubscribe` removes it.

**(b) An event stream.** `GET /mcp/events` with `text/event-stream`, emitting a
`dictation` event per finished take. Toxic already emits `dictation:state` and
`history:changed` to its own window; this would be the same idea over HTTP for
partners.

**(c) Nothing new.** Only the richer `status` from part 1. Project KO then
polls slowly and stops needing a fast poll at all.

### 3. A take Toxic opened is invisible while it runs

`listening` in the `status` answer is `partner_listening()`
(`src-tauri/src/dictation.rs`, line ~496), which is true only while a **partner
app** owns the microphone. A take opened by Toxic's own chord is therefore
reported as `listening: false` for as long as the microphone is open, and a
partner only learns that it happened when the transcript appears in the history
afterwards.

Please keep `listening` as it is - partners depend on its current meaning - and,
if it is easy, publish the microphone itself separately:

```json
{ "listening": false, "micOpen": true, "owner": "hotkey", "last": { ... } }
```

`owner` here is the owner of the **open** take (`"hotkey"` / `"partner"` /
`null`), and `micOpen` says the microphone is open whoever opened it.

## What Project KO will do with it

The rule becomes a comparison instead of an inference:

```ts
// The words are ours when Toxic typed them into our own window.
const mine = take.typedInto?.process === 'projectko.exe'
```

- `typedInto` is another application - the words went there, and Project KO
  does nothing. The defect of 2026-11-24 cannot happen.
- `typedInto` is `projectko.exe` - the words were typed into a Project KO
  window. Injected keystrokes do not reach a web view, so Project KO places
  the words itself, exactly as it does today.
- `owner` is `"partner"` - the take was opened by Project KO and the transcript
  was handed back with `stop`; the history entry is only a record.

With that, `src/desktop/useToxicTranscripts.ts` loses the 900 ms timer, the
watermark, the focus-period rule and the freshness guard, and
`src/desktop/windowFocus.ts` is no longer needed for dictation. The polling
stops, and Toxic is asked a question only when something is happening.

## Where to look in Toxic

- `src-tauri/src/dictation.rs`
  - `Owner` (line ~30) - `Hotkey` / `Partner`; publish it instead of discarding it.
  - `begin()` (line ~44) - where a take opens; capture the foreground window here
    for `openedIn`.
  - `finish()` (line ~130) - where the transcript is produced and
    `input::type_text(&text)` is called (line ~221); capture the foreground
    window here, just before the typing, for `typedInto`.
  - `push_history()` (line ~563) - where `HistoryEntry` is written
    (`id`, `at`, `text`, `engine`); the new fields belong on the entry, or on a
    parallel list of takes.
- `src-tauri/src/mcp.rs`
  - the `dictation` tool in `tools()` (line ~281) - the schema and its
    description;
  - the `status` arm (line ~363) - where `listening` and `last` are built today;
  - `call_tool()` - where a `subscribe` / `unsubscribe` action would go.
- `src-tauri/src/input.rs` - `type_text()` is the call that decides where the
  words went; the window belongs next to it.
- `src-tauri/src/config.rs` - `now_ms()` (line ~378) and the history file.

`GetForegroundWindow` is not called anywhere in Toxic today (this was checked
while writing the chord ticket), so this adds a first use of the Windows window
API in the dictation path. `inject.rs` already links `windows-sys`, so the
dependency is there.

## Acceptance

1. `dictation` with `action: "status"` answers `takes`, newest last, each
   entry with `id`, `text`, `startedAt`, `at`, `owner`, `openedIn` and
   `typedInto`.
2. `listening` and `last` are unchanged in shape and meaning.
3. A take opened with Toxic's own chord reports `owner: "hotkey"`.
4. A take opened by a partner app reports `owner: "partner"`, and its
   `typedInto` is `null` - a partner take is still handed back and still never
   typed.
5. A take that ended over another application reports that application's pid,
   process name and title in `typedInto`.
6. A take that ended over a Project KO window reports `projectko.exe` in
   `typedInto`.
7. `openedIn` and `typedInto` differ when the foreground window changed during
   the take.
8. The `takes` array is capped (10 is enough) and does not grow without bound.
9. A partner can subscribe (or read the event stream) and receives the take
   once, without polling - if (a) or (b) is implemented.
10. `listening` keeps its current meaning; if `micOpen` and the owner of the
    open take are published, a hotkey take is visible while the microphone is
    open.
11. Everything a partner app does today keeps working: `start`, `stop`,
    `cancel`, `status`, the transcript returned by `stop`, and no typing
    during a partner take.
12. The MCP tool's description and schema mention the new action and fields, so
    another agent reading `tools/list` can find them.

## Rules

- Do not modify, build or commit Project KO; it is a separate repository.
- Keep the change to Toxic's source, tests and docs. Commit with a clear
  message, for example `feat(mcp): publish the window a take was typed into`,
  and report the commit hash.
- Do not change how a partner take behaves today: it is still returned to the
  caller and still never typed into a window.
- The owner is present. Do not restart Toxic, install a build, or change its
  runtime config without their explicit OK; a running `toxic.exe` also blocks
  `cargo build --release` from replacing the binary, so ask first.
- The chord defect (the chord does nothing while a Project KO window is in
  front) is a separate ticket, [request-toxic-chord.md](request-toxic-chord.md).
  This ticket does not depend on it, and fixing that one does not replace this
  one: a take opened by Toxic's own chord still has to say where its words
  went.

## Note on the shape of the answer

The point of part 1 is not that Project KO cannot work out the answer itself -
it can, and does, with focus events and timestamps. The point is that the
answer Toxic gives is **true by construction** rather than reconstructed from
two clocks and a window-focus guess, and that it costs the partner nothing to
receive. A take that names its window cannot be misfiled by a partner that
arrives late, on another machine, or after a reload.
