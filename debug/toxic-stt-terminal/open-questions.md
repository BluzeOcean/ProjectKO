# Open questions

What is still unknown, what would answer it, and what each answer would mean.
Keep this file short and current: when a question is answered, the measurement
goes into [`evidence.md`](evidence.md) and the question moves to
[`ruled-out.md`](ruled-out.md) or is deleted here.

---

## H1 - A partner take was recording, so the chord was passed to the app

**Mechanism** (`hotkeys.rs:654-699`): while a partner app owns the microphone,
the hook returns `false` for every key, so the key reaches the foreground
window. The agent app is such a partner: the owner's dictation to the agent
goes through Toxic's MCP `dictation` tool, which is a partner take
(`mcp.rs:282`, `dictation.rs:26-42`).

**Fits the evidence:** the probe's signature is exactly this - the key arrives
with `ctrl=1`, no HUD, no take, and the terminal swallows the chord. The
16:31:31 press fell between two partner takes (16:24:16 and 16:31:39), and the
16:04:02 press fell between the 16:03:45 and 16:04:14 ones.

**Against it:** `dictation status` said `listening: false` when it was checked
afterwards, and the 14:45-14:53 test recorded no take at all - a partner take
that was cancelled would leave no trace either, so that window is not excluded.

**Answered by:** the test below, step 1 and 2.

## H2 - Toxic's tracked modifier mask disagrees with the chord

**Mechanism** (`inject.rs:311-325`, `hotkeys.rs:618-622, 701-717`): `PHYSICAL`
is Toxic's own bitmask, updated only from the hook, and `modifiers_held()`
demands an exact four-way match. One bit left set - Shift, Alt or Win whose
key-up the hook never saw - makes **every** `Ctrl+T` fail silently, with no log
line, on every application.

**Fits the evidence:** the failure is silent, it is invisible in Toxic's Logs
view, and it needs no foreground-window test (there is none in Toxic's dictation
path).

**Against it:** a fresh Toxic install at 16:21:59 was followed by presses at
16:23:01 and 16:31:31 that still failed - so whatever set the bit must be
something that happens again quickly (the owner uses Alt constantly, and Toxic
swallows the physical Alt-up when it masks the menu).

**Answered by:** the test below, steps 1 and 3.

## H3 - Toxic's hook is not installed at the moment of the press

**Mechanism:** Windows removes a `WH_KEYBOARD_LL` hook silently when its
callback is slow. Toxic installs its hook once and never reinstalls it, while
Project KO reinstalls its own every 10 seconds - the chain is re-ordered
constantly and every hook in it shares one timeout budget.

**Fits the evidence:** a silent, machine-wide failure.

**Against it:** the press at 16:31:31 came after a Toxic restart, so the hook
had been installed eight minutes earlier - long enough for it to have been
dropped, but long enough for it to have survived as well. Not excluded.

**Answered by:** the test below, step 1. If the chord works over another
application, H3 is dead.

---

## The test

**One keypress by the owner, in another application, with nothing dictating.**

1. Open Notepad (or any plain app - not a browser, not the agent). Make sure
   **nothing is dictating**: the agent app must not be recording, and no take
   may be in progress.
2. Press **plain `Ctrl+T`**, once.

Then read the result:

| What happens | What it means | What to do next |
| --- | --- | --- |
| Toxic's HUD appears | The chord works. H1 and H3 are dead; the failure is specific to the Project KO window, or it was the partner rule during every earlier test. | Repeat the same press **in a Project KO terminal**, again with nothing dictating. If the HUD appears there, the bug is closed and what remains is the delivery (the bridge) and the typing target. |
| Nothing happens | The chord is dead machine-wide. H2 and H3 are alive. | Go to step 3. |
| A HUD appears but no take is recorded | A different failure: the take starts and is lost. | Check `history.json` and `dictation status` immediately after. |

3. If nothing happened in step 2, **tap each modifier once, one at a time**:
   press and release `Alt`, then `Shift`, then `Ctrl`, then `Win`. Each tap
   gives Toxic's hook the key-up it may have missed. Then press plain `Ctrl+T`
   again, in the same plain app.

| What happens | What it means |
| --- | --- |
| The HUD appears now | **H2 confirmed**: a stale bit in Toxic's modifier mask. The fix is Toxic-side - the chord decision must not depend on a bitmask that a missed key-up can poison. The ticket already asks for exactly that. |
| Still nothing | **H2 is not it.** The hook is not acting at all - H3. Restart Toxic and press `Ctrl+T` once more in the plain app: if that works, the hook had been dropped by Windows, and the fix is Toxic-side - reinstall the hook on a timer or a liveness check. |

**Rules for this test:** do it with **nothing dictating** (the agent app idle,
no take in progress). Do it in a **plain application**, not in a browser and not
in the agent. Report what happened, and the clock time.

---

## Also open

- **Has a real take ever delivered a packet into a Project KO terminal?** No.
  The bridge has never been exercised by a real take, so it is unproven in the
  live direction. The first successful chord in a Project KO terminal answers
  this.
- **Toxic types into the window that has the focus ~21 s later.** Separate
  Toxic-side defect, ticketed in `knowledge/request-toxic-typing-target.md`.
  It will show up in the first successful test as words landing in the wrong
  place.
