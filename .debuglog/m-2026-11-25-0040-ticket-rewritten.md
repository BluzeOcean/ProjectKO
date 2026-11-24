# The Toxic ticket, rewritten (2026-11-25 00:40)

**Taken:** 2026-11-25 00:38-00:40 (Asia/Shanghai).
**By:** the agent that took over the handoff.
**Written to:** `V:\04_Projects\Toxic\ticket\(open) 2026-11-24-dictation-chord-and-typing-target.md`
(commit `7f8cdbe` in that repository - the only write made there).

## Why it was rewritten

The ticket's newest section still carried the **20:43** conclusion - *"the
chain is cut for the Project KO window only"* - which is the diagnosis that
was later measured to be wrong. An agent picking that up would go hunting for
a hook defect that does not exist. Its appendix also pointed at
`debug/toxic-stt-terminal/`, a folder that has moved.

The owner asked for a clean rewrite from the current understanding, rather
than a patch on top of the old text. The dated sections it replaces are kept
in that repository's history (`50ae6d3`) and, with every measurement behind
them, in `.debuglog/`.

## What the rewritten ticket says

1. **The chord defect is not fixable on this side and does not need to be.** A
   Chromium web view takes the keyboard as raw input, so the low-level hook
   chain is never called for it - there is no chord decision to get right and
   no trace to add. The measurement (the same physical chord in Project KO
   and in Notepad), the cause, and everything ruled out (elevation, a raw
   input registration in Project KO, an injected DLL, a swallowed key, a dead
   hook, the `hex.exe` pile) are all in it, with the note that Project KO now
   covers the chord with a partner take, owner-approved and verified live.
2. **What is left on the Toxic side:**
   - the **typing target** - a take is typed into whatever has the focus ~21 s
     later, not into the window that started it - with the four things that
     would close it (remember the window, show the wait, report a vanished
     window, name the window in the transcript);
   - the **partner-take hygiene** - an abandoned partner take must not leave
     the chord dead for good, which matters more now that Project KO is a
     partner app;
   - the **engine's transcript quality** - *"What are you doing"* came back as
     *"What are you ggggg"*, the classic streaming-ASR hallucination on
     trailing silence.
3. **What is already done there** - three of the five original items (the
   per-press trace, the hook keepalive, the stale-modifier fix), with the
   evidence taken from Toxic's own log.
4. **The two instrument traps** - no file I/O in a hook callback, and never
   kill a process that owns a hook - in case the chain is ever measured again.
5. **The corrected paths** to the working log (`.debuglog\`, with the dated
   measurement files).

The rules are unchanged: do not modify Project KO, the owner is present, and
the partner contract (a partner take returns its transcript and is not ended
by a keystroke) must not change.
