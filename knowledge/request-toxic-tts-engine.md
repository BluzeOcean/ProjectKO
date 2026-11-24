# Request: Toxic's speech engine can answer with silence and never recover

**Status:** open. **Raised:** 2026-11-24 by Project KO (this repository).
**Addressed to:** whoever owns the **Toxic** repository at `V:\04_Projects\Toxic`.

This is a ticket, not a change. Project KO cannot edit Toxic; it can only report
what was measured and what has to change.

## The defect

Toxic's Pocket TTS engine can be *present* and *silent*. When it is, every
synthesis fails with "The engine returned no audio", the health check still says
`tts: "ready"`, and nothing recovers on its own.

The cause is a server that survives an earlier run. `pocket.rs::ensure()` treats
**any** process answering `/health` on the configured port as its engine:

```rust
if health(port).await {
    let external = guard.child.is_none();
    let status = if external {
        EngineStatus::ready(Some(format!("Server already running on port {port}")), None, "external", "");
    } else { ... };
```

So a `pocket-tts.exe` left behind by an earlier Toxic run is adopted as
"external", and the current Toxic speaks through it. That process answers
`/health` (so the engine reads as ready) and answers `/tts` with a WAV header
that carries **no samples at all**.

## What was measured

On this machine, 2026-11-24, with Toxic 1.2.0
(`V:\04_Projects\Toxic\src-tauri\target\release\toxic.exe`, started 01:38:49) and
`%APPDATA%\app.toxic.desktop\config.json` setting `"tts": { "port": 8124,
"keepRunning": true }`:

| Check | Result |
| --- | --- |
| Process on port 8124 | `pocket-tts.exe` pid 8872, started 00:38:13 — **one hour before the current Toxic**, and its parent (the earlier Toxic) was gone |
| `POST http://127.0.0.1:8124/tts` with the form field `text` | **HTTP 200 with exactly 44 bytes** - a RIFF header, no samples. The data chunk even claims 2,000,000,000 bytes |
| `GET http://127.0.0.1:8130/health` | `{"status":"ok","stt":"ready","tts":"ready"}` - the wedged server answers `/health`, so the engine reads as healthy |
| MCP `speak` tool | error **"The engine returned no audio"** |
| `POST /v1/audio/speech` | the same failure |
| After stopping that one process | Toxic started its own engine (pid 19700, parent `toxic.exe`) and `speak` returned **170,684 bytes of 24 kHz mono audio** |

Project KO only ever saw Toxic's error. It never contacted Pocket TTS: the
whole path is `POST /api/sessions/:id/speak` → Toxic's `speak` MCP tool → the
engine behind Toxic. Project KO has no reference to the engine binary, to the
port or to the process, by design.

## Why Toxic does not recover

The recovery is already written - it just is not triggered. `pocket.rs::stream()`
restarts the engine when the request **fails**:

```rust
match post_tts_stream(port, &text).await {
    Ok(response) => Ok(response),
    Err(first) => {
        self.stop(app).await;                 // kills a foreign pocket-tts on the port
        let port = self.ensure(app).await ... // starts a fresh engine
        post_tts_stream(port, &text).await ...
    }
}
```

A connection error or a non-2xx status takes that branch. **A 200 with an empty
body is a success** as far as Toxic is concerned, so the retry never runs, and
`stop()` - which already knows how to stop a `pocket-tts.exe` that is not its
child (`kill_port_owner`) - is never called.

## What has to change

1. **An empty WAV is an engine failure.** Validate the audio before answering:
   the `data` chunk must be larger than zero and fit the body. When it is not,
   treat it exactly like a failed request: `stop()` → `ensure()` → retry. The
   machinery exists; it only needs the empty-body case.
2. **Say what happened.** "The engine returned no audio" names nothing. The
   error should say that the server on the configured port answered with no
   sound, and that it is not Toxic's own engine - for example *"the server on
   port 8124 is not Toxic's own and returned no audio"*.
3. **Health must not lie.** `/health` reports `tts: "ready"` for an engine
   Toxic did not start. A partner app reads that as "speech works" and then
   gets silence. Report an adopted server as something else - `external`, or
   `degraded` - so a client can tell the difference before it speaks.
4. **A partner app must be able to recover.** "Restart engines" is only a tray
   command (`tray.rs`), so no other process can ask for it. An MCP tool
   (`engines`, action `restart`) or an HTTP route would let a partner app
   recover a wedged engine without the owner opening a menu. Without it, the
   only fix is a human with the tray icon.
5. **Log the adoption.** When `ensure()` finds a server on the port that it
   did not start, say so in the Logs view, with the process name and id. Today
   the only trace is the status detail "Server already running on port 8124".
6. **Consider refusing a silent server.** Adopting a foreign server is useful
   (a warm engine across restarts) and should stay, but a server that answers
   with no samples is not a warm engine. Either do not adopt it, or adopt it
   only until the first synthesis proves it can speak.

## What Project KO does meanwhile

Project KO keeps its own side engine-agnostic: it asks Toxic, and when Toxic
reports a silent engine the read-aloud bar says so in the owner's terms -
*"Toxic's speech engine answered with no sound. Right-click the Toxic tray icon
and choose Restart engines, then try again."* - instead of repeating the raw
error.

That is the whole of Project KO's workaround. It cannot restart Toxic's
engines, and it will not: the engine behind the wrapper is Toxic's business,
and a partner app has no business killing processes it does not own.

## Rules

- **Do not modify, build or commit Project KO.** It is a separate repository
  (`V:\06_App\ProjectKO`) and this ticket is the whole of what it asks for.
- Keep the change to Toxic's source, tests and docs. Commit with a clear
  message and report the hash.
- **The owner is present.** Do not restart or quit the running `toxic.exe`, do
  not install a build and do not change `%APPDATA%\app.toxic.desktop\config.json`
  without their explicit OK. The running binary also blocks
  `cargo build --release` from replacing it, so ask first.
- Read these before changing anything:
  - `src-tauri/src/engines/pocket.rs` - `ensure()`, `stream()`, `post_tts_stream()`, `kill_port_owner()`.
  - `src-tauri/src/tray.rs` - the `restart_engines` command, which is the
    recovery that no partner app can reach.
  - `src-tauri/src/engines.rs` - how the engine status becomes `/health`.
  - `src-tauri/src/mcp.rs` and `src-tauri/src/http.rs` - where a new tool or
    route would go.

## Acceptance

1. A `pocket-tts.exe` left behind by an earlier run does not make Toxic speak
   silence: the first synthesis recovers, or fails with a message that names
   the port and the foreign server.
2. An empty WAV body is treated as a failure, and the engine is restarted once
   before the request is given up.
3. `/health` does not report a ready TTS engine for a server Toxic did not
   start, or reports it in a way a client can act on.
4. A partner app can ask Toxic to restart its engines over the API.
5. The Logs view says when Toxic took over a server it did not start.
6. The existing behaviour stays: one synthesis at a time, a warm engine across
   restarts, the voice chosen in Toxic, and `speak` with `output_path` writing
   the file.
7. `cargo test --manifest-path src-tauri/Cargo.toml` passes.
