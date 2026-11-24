# Request: tell a partner app which window a dictation take was typed into

**Status: withdrawn 2026-11-24.** Nothing has to change in Toxic for this.
**Raised:** 2026-11-24 by Project KO (this repository).

> **Why it was withdrawn.** The request asked Toxic to publish which window a
> take was typed into, so a partner app could stop guessing. Project KO stopped
> guessing instead: on 2026-11-24 it deleted the watcher that read Toxic's
> transcript history, and it no longer asks Toxic for a take at all. Toxic owns
> the chord, the recording and the typing, so the words land in the window they
> belong to and no partner has to be told anything.
>
> The delivery half of this ticket - "deliver the words in a way a terminal can
> receive" - was solved on Project KO's side instead, by a bridge for the text
> Windows injects (`src/desktop/terminalUnicode.ts`). Toxic's typing now reaches
> a Project KO terminal as well.
>
> The rest of this file stays as the record of the problem and of what was
> measured, in case the arrangement ever comes back. The state of the feature
> now is in [the dictation memory](dictation-memory.md).

## The problem

Toxic is a machine-wide tool. Its chord opens a take in whatever application
has the focus, and the transcript is typed into that same window with
`SendInput` (`src-tauri/src/input.rs` -> `inject::type_text`). A partner app
that is not that window has to decide whether the words belong to it, and
today it cannot - so it guesses.

Project KO's guess lived in `src/desktop/useToxicTranscripts.ts`: it polled
Toxic's transcript history every 900 ms and compared timestamps against its own
window focus. **That guess was wrong, and it shipped a defect.** On 2026-11-24
a take made in Chrome was also typed into the Project KO terminal, because
Toxic's history holds every take on the machine and nothing in the answer says
which window a take belonged to. The fix in Project KO
(`knowledge/dictation-memory.md`) made the guess much more careful - a
transcript is only placed when the take ended while the Project KO window had
the focus - but it was still a guess, reconstructed from two clocks.

Toxic already knows the answer. Toxic performs the typing itself, so it knows
the window that received the words. It just did not say.

The cost of the guess, measured on this machine against the running Toxic:

| | per poll | at 1.11 polls/s |
| --- | --- | --- |
| Project KO service (HTTP in, MCP out) | 1.18 ms CPU | ~1.3 ms |
| Toxic (answering `status`) | 0.125 ms CPU | ~0.14 ms |

Small, but it ran for as long as the window was open, and it was the reason
Project KO had to reason about focus at all.

## What was asked for, and why it is not needed any more

The original ask had two halves.

**1. A take that names its window.** `dictation status` was to grow a `takes`
array with `id`, `text`, `startedAt`, `at`, `owner` (`hotkey` or `partner`),
`openedIn` and `typedInto` (pid, process, title), so a partner app could
compare instead of guess.

**2. Delivery without the poll.** A `subscribe` callback, an event stream, or
at least an answer rich enough to place a take without watching the history.

Both are answered by not doing the work: Project KO asks Toxic for no take, so
there is nothing to place and nothing to compare. The words arrive where Toxic
typed them.

## What a partner app needs instead

If another app ever wants the same thing, the shape that works is the one
Project KO ended up with:

- the partner does not open a take. It lets the global chord do it and lets the
  words be typed into the focused control.
- the partner makes sure it can **receive** text that another process injects.
  On Windows that text arrives as a `VK_PACKET`, and a web view terminal drops
  it unless it is bridged.
- the partner keeps its own keyboard gesture out of the way: no interception of
  the chord, and a guard so the chord never reaches the CLI underneath.

## The remaining Toxic defect

The chord itself is still the open question, and it is a different ticket:
[request-toxic-chord.md](request-toxic-chord.md). Toxic's hook does not always
act on the chord while a Project KO window is in front. With Project KO no
longer taking the chord over, that defect means the chord does nothing at all
in Project KO, so Toxic should be kept in chord mode until the hook is fixed.
