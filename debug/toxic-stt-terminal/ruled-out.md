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

**Answered, and it was the bug in the *old* build - not in this one.** The
stale-bit theory explains the old build's intermittency: `fbbd015` matched on
Toxic's own tracked mask, so one modifier bit left set (a key-up another
application swallowed) refused every `Ctrl+T`, silently, on every application.
That is what the ticket's item 3 is about, and `4e57aa3` fixed it - by
ANDing the mask with `GetAsyncKeyState`, which broke fast presses instead.
The current failure is the asynchronous lag, not a stale bit.

### "A partner take was refusing the chord"

**Dead.** The MCP `dictation status` action reports `partner_listening`
(`mcp.rs:366`), so `listening: false` says nothing about a chord take - but it
does prove there was no partner take. The one press that *was* traced matched
and started a take, and the partner branch returns the transcript instead of
typing it, which is not what happened.

### "Toxic's hook was never called for the Project KO presses"

**REOPENED 2026-11-24 20:04 - the ruling was based on faulty logic.** It argued:
"a matched chord swallows the key, the probe received the key-down, so no hook
swallowed it, and since the hook is global it must have been called and must have
declined to act."

That last step does not follow. **A hook that is called and declines to act also
lets the key through** - the key reaching the application proves only that *no
hook swallowed it*, not that Toxic's hook was called.

The second half of the old argument is the part that holds, and it is decisive:
a refusal always writes a line when a modifier is held
(`check.tracked.any() || check.live.any()`), and `live` is `GetAsyncKeyState`,
which cannot read "up" while Ctrl is physically down for 3.9 seconds. So the
absence of any line means **neither mask was ever consulted**.

**This is now the live hypothesis** (see [`evidence.md`](evidence.md),
2026-11-24 20:04). It is being tested against a stand-alone `WH_KEYBOARD_LL`
probe installed on this machine at 20:22:23: if the probe sees the chord over
the Project KO window while Toxic's log stays empty, the chain is healthy and
**Toxic's hook is the broken link**.

### "The Project KO window is elevated, so UIPI hides its input from other hooks"

**Dead.** Measured 2026-11-24 20:10: `OpenProcess(PROCESS_ALL_ACCESS)` against
`projectko.exe` (18776), `toxic.exe` (36488), `chrome.exe` (11028) and
`Overwatch.exe` (28828) succeeds from this shell for **all four** - they run at
the same integrity level. Neither binary carries `requireAdministrator`,
`highestAvailable` or `asInvoker` in its manifest, and the machine has no
`EnableLUA` policy key.

### "Project KO's own keyboard hook breaks Toxic's chain"

**Dead.** Project KO installs a `WH_KEYBOARD_LL` hook of its own
(`src-tauri/src/win_key.rs:42`) and reinstalls it every 10 seconds, like
Toxic. But its callback never swallows: it always ends in `CallNextHookEx`
(`win_key.rs:139`). Both hooks were installed when the press in another
window was traced at 18:50:01, so the chain was working at that moment.

### "Windows removed Toxic's hook"

**Dead for the current build.** The keepalive reinstalls the hook every 10
seconds and logs `Windows had removed the keyboard hook` when an unhook fails
(`hotkeys.rs:632-638`). That line is not in the log, and the trace at 18:50:01
shows the hook alive with 5440 events behind it.

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
