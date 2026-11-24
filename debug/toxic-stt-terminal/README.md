# Bug: the dictation chord never opens a take over a Project KO window

**Status:** open. **The decisive test has been run (2026-11-24 20:43) and it
moved the fault out of Toxic.** The `WH_KEYBOARD_LL` chain does not run for keys
that reach the Project KO window; the one open question is what delivers them.
**Owner:** Kudavi. **Repo:** `V:\06_App\ProjectKO`. **Other app:** Toxic at
`V:\04_Projects\Toxic` (read-only from here — changes there become tickets).

This folder is dedicated to **this bug only**. It is the working log that agents
share, so that the third agent does not repeat the first agent's measurements.
Read it before doing anything.

## The rule for this folder

1. **Read first.** `symptom.md`, then `ruled-out.md`, then `open-questions.md`.
   `ruled-out.md` is a list of things that were measured and found wanting — do not
   try them again.
2. **Write as you measure.** Every measurement goes into `evidence.md` with the
   time it was taken and what it proves. A measurement without a verdict is noise.
3. **A hypothesis moves to `ruled-out.md` only when a measurement kills it**, and
   the entry names that measurement. "I think it is not X" is not enough.
4. **Never drive the keyboard or the mouse to test.** The owner is at the machine.
   Ask the owner to press the key and report. Injection experiments are forbidden
   (they also produced false conclusions once — see `ruled-out.md`).

## The rule that will spoil a test

**Do not dictate to the agent while the chord is being tested.** The agent app is
a **partner** of Toxic: the owner's speech to the agent is recorded by Toxic's
MCP `dictation` tool, which is a partner take, and while a partner take is
recording, Toxic's hook **passes every key to the app that owns the
microphone — including the chord** (`hotkeys.rs:654-699`). The key then arrives
in the focused window with the right modifiers, no HUD opens, and nothing is
typed. That is indistinguishable from a broken chord, and it is what the
recorded presses at 16:04:02 and 16:31:31 were most likely.

So: the test window has to be quiet. Nothing recording, nothing dictating, the
agent idle.

## The two phases

| Phase | Question | Where |
| --- | --- | --- |
| **1** | Does `Ctrl+T` in a Project KO chatspace terminal open a take in Toxic at all? | [phase-1-chord.md](phase-1-chord.md) |
| **2** | Do the words of that take arrive in the terminal? | [phase-2-delivery.md](phase-2-delivery.md) |

Phase 1 is finished before Phase 2 starts. A take that never opens cannot
deliver anything, and every Phase 2 question is meaningless until Phase 1
answers yes.

## Where the permanent records live

| What | Where |
| --- | --- |
| The working design of the dictation path | `knowledge/dictation-memory.md` |
| The attempts that failed, with reasons | `knowledge/dictation-failed-attempts.md` |
| The ticket for Toxic's chord defect | `knowledge/request-toxic-chord.md` |
| The ticket for Toxic typing into the wrong window | `knowledge/request-toxic-typing-target.md` |
| The live probe in the app | `src/desktop/dictationProbe.ts` |

## Status in one paragraph

The chord (`Ctrl+T`) reaches the Project KO window with the exact modifier state
it asks for, and the window swallows it, so the CLI never sees `^T`. Toxic's own
hook did not open a take: no HUD, no microphone, no transcript, no row in
Toxic's history. Two mechanisms fit that evidence, and both are Toxic-side:
**(H1)** a *partner take* was recording, and Toxic deliberately passes every key
to the app that owns the microphone - including the chord; **(H2)** Toxic's
tracked modifier mask (`inject::PHYSICAL`) disagreed with the chord's exact
four-way match. The single test that tells them apart is in
[`open-questions.md`](open-questions.md), and it is the owner's to run.

**A live take has never delivered a packet into the Project KO terminal**, so the
terminal bridge (`src/desktop/terminalUnicode.ts`) has still never been exercised
by a real take.

**Update, 2026-11-24 20:43 - the decisive test has been run and it moved the
fault out of Toxic.** With a stand-alone `WH_KEYBOARD_LL` probe and Toxic's own
log watching the same chain: **Toxic's hook is alive and healthy** - in the very
process that refuses to act over Project KO it matched the chord in Chrome and
opened a take (`19382 keys seen`) - and the chord works in every other window.
But **over the Project KO window the chain does not run at all**: the probe
logged **zero** rows with Project KO in front across 2445 rows, while the PKO
web view received the same Ctrl+T presses as ordinary keydowns (`keyCode 84`,
`ctrlKey 1`, `defaultPrevented=1`).

**So the fault is not in Toxic's chord decision, its modifier mask, its refusal
logic or its hook lifetime - the key reaches the Project KO window by a path
that does not go through the `WH_KEYBOARD_LL` chain.** The candidates are a
raw-input / `WM_INPUT` path, an input-sink registration, a posted `WM_KEYDOWN`,
or a synthesised DOM event. The newest suspect is the pile of 17 `hex.exe`
processes (Toxic's STT engine), whose per-application modes consume the chord.
The live hypothesis and the next test are in
[`open-questions.md`](open-questions.md); the full handoff for the next agent
is `knowledge/handoff-toxic-stt-terminal.md`.
