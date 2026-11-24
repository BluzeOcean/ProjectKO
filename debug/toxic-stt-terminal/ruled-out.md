# Ruled out

Every entry here was measured and found wanting. **Do not try it again.** If
you think an entry is wrong, the way to reopen it is a new measurement in
[`evidence.md`](evidence.md) that contradicts it - not a re-run of the old one.

---

### "Project KO's terminal dropped the words"

**Dead.** No take was ever recorded during the failing tests (14:45:45 to
14:53:25), so no text was ever injected. There was nothing to drop. The
terminal bridge has still never been exercised by a real take.

### "Toxic's hook was removed by Windows"

**Dead.** Toxic was restarted at 16:21:59, which installs the hook anew, and
the physical chord still did not act at 16:23:01 and at 16:31:31. A hook that
Windows removed *before* the restart cannot explain the presses *after* it.

### "Project KO's 10-second hook re-registration kills Toxic's hook"

**Dead.** A/B with a working injector: the chord fired with Project KO running
and with it stopped. The re-registration is not the cause.

### "The owner restarted Project KO, so Toxic's hook died"

**Dead.** Same A/B: the chord fired with Project KO running.

### "The owner's 14:45 test was Ctrl+Shift+T"

**Unproven, and now unlikely.** There was no probe at 14:45. Later presses were
recorded with `ctrl=1, shift=0, alt=0` - a plain `Ctrl+T`.

### "Injected text never reaches a web view"

**False.** The control case showed text arriving character by character in
another Chromium app. But see the correction in
[`evidence.md`](evidence.md): those takes were most likely *partner* takes, in
which the **caller** inserted the transcript. So the statement "Toxic's typed
text reaches a web view" is **not** proven - but the bridge's justification
never depended on it: xterm's own cancellation of `keyCode 229` is verified by
`desktop/service/test/desktop-dictation-ui.mjs`.

### "The chord behaves differently for injected and for physical keys"

**Dead.** `hotkeys.rs:600-604`: the hook ignores only Toxic's own marked
events, so input injected by another program is observed exactly like a
physical key. Injection is not the variable - Toxic's state at that moment is.

### "The `SendInput` experiments showed the chord does not work"

**Invalid readings.** A 32-byte `INPUT` struct is a silent no-op on x64 (it
must be 40 bytes). Every conclusion drawn from those runs was an artefact.
With a 40-byte struct the injected chord *did* fire the HUD.

### "A stale modifier bit is stuck right now"

**Not measured.** `inject::PHYSICAL` is Toxic's own mask, not the OS state, and
there is no way to read it from outside Toxic. The physical key-ups were seen by
the app, but that says nothing about Toxic's mask. Still open - see
[`open-questions.md`](open-questions.md), H2.

### "A partner take left open disables the chord forever"

**Not the case right now.** `dictation status` over MCP returns
`listening: false` at 16:34 and 16:36. A partner take is open only while the
owner is dictating to the agent.

### "The transcript watcher, the focus tracker or the microphone switch is missing"

**By design, not a bug.** They were removed on 2026-11-24 because a take made
in another application was typed into Project KO as well. Toxic owns the chord,
the microphone, the recording and the typing. Do not re-add them - the ledger
is in `knowledge/dictation-failed-attempts.md`.

### "The clipboard can stand in for the delivery"

**Refused by the owner.** *"I don't want the toxic app to use the clipboard,
because that will populate my clipboard every time I speak to it."* The bridge
writes into xterm's input stream and never touches the clipboard.

### "Project KO should ask Toxic to open the take again"

**Refused by the design and by the ticket.** The takeover is gone; Toxic owns
the chord. See `knowledge/request-toxic-chord.md`.

### CDP experiments as a substitute for the real thing

**Dead.** CDP `rawKeyDown` with `windowsVirtualKeyCode: 229` is dropped by
Chromium; CDP `char` dispatch double-types once the bridge is installed. CDP
keys also never reach Toxic's system hook, so they prove nothing about the
chord.

### Driving the keyboard or the mouse to test

**Forbidden by the owner, 2026-11-24.** The owner is at the machine. Ask the
owner to press the key and report. It also produced false conclusions once
(32-byte `INPUT`).
