# Handoff: a dictation tool for Toxic

You are taking over one task in the **Toxic** repo at `V:\04_Projects\Toxic`
(Tauri 2, Rust, branch `master` at `014f893`, working tree clean). Project KO
(`V:\06_App\ProjectKO`) is finished on its own side and is waiting for a single
MCP tool from you. Do the check in part 1 first, then implement part 2 and
part 3.

## 0. Why this exists

Project KO's chat microphone is no longer a recorder. Clicking it must start and
stop **Toxic's own listening mode**, so Toxic draws the listening HUD, plays the
cues and transcribes with Hex, and Project KO inserts the returned words into
the chat composer. Project KO records nothing, keeps no audio and shows no
recording panel.

Toxic currently publishes only `transcribe` and `speak` over MCP. Nothing can
start its listening mode from another process, so Project KO cannot complete
this without one new tool.

## 1. Check first: the settings panel

The owner reports the settings panel is broken, and the suspicion falls on
`014f893 feat(settings): set the dictation chord by pressing it` and
`a735f90 feat(hotkeys): add a key-combination dictation trigger`.

Open the app, go to Settings, and try the dictation section: the model list, the
microphone list, the cue settings, and the new **Set shortcut** capture button.
Record what actually breaks (blank section, missing controls, capture button
that does nothing, a command error, a stuck hook), with the exact click path and
the console/log message. Reproduce it from a clean build of `014f893` before
blaming anything.

The owner may have seen this on a binary that Project KO built; that build is
gone. The tree is clean at `014f893` and Project KO made no change to Toxic's
UI, commands or config schema. If the panel is fine on `014f893`, say so with
what you tested and on which build; do not "fix" it blindly.

## 2. What Project KO calls

One MCP tool on the existing `/mcp` endpoint (JSON-RPC 2.0 `tools/call`), no
token, loopback only.

```text
tool:     dictation
arguments: { "action": "start" | "stop" | "cancel" | "status" }
returns:   one text content block
```

| action | returns |
| --- | --- |
| `start` | `listening` — Toxic opens its microphone and shows its HUD |
| `stop` | the transcript, trimmed; empty string when nothing was heard |
| `cancel` | `cancelled` |
| `status` | a JSON string: `{"listening": true, "last": {"text": "...", "at": 1795414926547}}` or `{"listening": false, "last": null}` |

Rules that matter to the caller:

1. **No paste.** A take started through this tool must never call
   `paste_text`, even when `stt.pasteAfter` is on. Project KO inserts the
   transcript itself. Pasting would either duplicate the text or type it into
   whatever window has focus.
2. **A keystroke must not end it.** Today any ordinary key-down ends a take and
   is swallowed (`hotkeys.rs`, the "While listening, any ordinary key finishes
   the dictation" block). In a chat composer that eats the user's first key and
   loses the words. While this tool owns the recording, only `Esc` (cancel) may
   be intercepted; the maximum recording length still applies.
3. **The HUD says who ends it.** "Any key to finish" is wrong for a partner
   take; say "Click the microphone again to finish · Esc to cancel".
4. **`status` is the recovery path.** Project KO polls it while listening. If
   Toxic ended the take itself (Escape, maximum length), `last` has to be the
   newest transcript so those words are not lost.
5. **Errors are messages, not codes.** Return JSON-RPC error `-32000` with
   Toxic's own sentence ("Toxic is not running", the microphone error). Project
   KO shows it verbatim in the composer.
6. **Discoverable.** `tools/list` needs the tool with a description and an
   `inputSchema` whose `action` is an enum, because other agents read that
   list too.

## 3. Reference implementation

A working version was written and verified end to end against Project KO (MCP
`start` → recording, `status` → `listening: true`, `stop` → transcript, no
paste, Project KO inserted the words), then reverted, because Project KO has no
authority to change this repository. Use it as a sketch, not as authority: read
the current code and implement it the way you would.

It touched five files and 146 lines:

- `src-tauri/src/dictation.rs` — an `Owner` enum; `start`/`stop` became thin
  wrappers over `begin(app, owner)` / `finish(app, owner) -> Result<Option<String>, String>`;
  `start_partner` / `stop_partner`; paste gated on `owner == Owner::Hotkey`;
  the HUD hint chosen per owner; `partner_listening(app)`.
- `src-tauri/src/hotkeys.rs` — 5 lines in the key-down branch:

  ```rust
  let partner = crate::dictation::partner_listening(&app);
  if recording_now(&app) && (!partner || matches!(exit_action(vk), ExitAction::Cancel)) {
      // ... existing end-the-take block
  ```

- `src-tauri/src/lib.rs` — `pub partner: AtomicBool` on `AppState`, set in
  `begin`, cleared in `finish` and `cancel`.
- `src-tauri/src/mcp.rs` — the tool in `tools()` and a match arm in
  `call_tool()` that calls the partner functions and returns
  `json!({ "content": [{ "type": "text", "text": text }] })`; `status` reads
  `state.history.first()` for `last`.
- `MCP_README.md` — the tools table and the tool-result notes.

The full patch as it was written is kept in Project KO at
`V:\06_App\ProjectKO\.cache\toxic-dictation.patch` until this lands. Read it,
do not copy it blindly, and write it however fits your code.

## 4. How Project KO calls it

To test end to end without touching Project KO's code, read these:

- `desktop/service/toxic.mjs` → `ToxicClient.dictation(action)` sends the
  `tools/call`.
- `desktop/service/server.mjs` → `POST /api/dictation/listen` with
  `{ "action": "start" | "stop" | "cancel" | "status" }`, returns
  `{ listening, text? }` or `{ listening, last }`.
- `desktop/service/toxic-launch.mjs` → starts Toxic when it is closed (Start
  Menu shortcut, `%LOCALAPPDATA%\Programs\Toxic\Toxic.exe`, `Program Files`,
  `PKO_TOXIC_EXE`) and asks the user to install it when nothing is found. Your
  app does not need to change for that; it only needs `/health` and `/mcp` to
  answer once it is started.
- `src/desktop/DictationButton.tsx` → the switch in the chat composer.

## 5. Acceptance

1. `tools/list` shows `dictation` with its schema.
2. `tools/call start` opens the microphone, plays the start cue, shows the
   `Listening` HUD with the partner wording, and answers `listening`.
3. `tools/call status` while recording answers `{"listening": true, ...}`.
4. `tools/call stop` returns the transcript, adds it to Toxic's history, and
   pastes nothing into any window, with `stt.pasteAfter` both on and off.
5. Typing a key during a partner take does not end it; `Esc` cancels; the
   maximum recording length still stops and transcribes it.
6. Toxic's own hotkey take and the `speak` tool behave exactly as before.
7. In Project KO: click the chat microphone, speak, click it again — the words
   appear in the composer; clicking it while Toxic is closed opens Toxic first.

## 6. Rules

- Do not modify, build or commit Project KO; it is a separate repository and its
  side of this work is already finished.
- Keep this change to Toxic's source, tests and docs. Commit with a clear
  message, for example `feat(mcp): let a partner app drive dictation`, and
  report the commit hash.
- The owner is present. Do not restart Toxic, install a build, or change its
  runtime config without their explicit OK; a running `toxic.exe` also blocks
  `cargo build --release` from replacing the binary, so ask first.
