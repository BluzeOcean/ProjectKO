# Route B: Project KO drives a partner take

**Status:** proven on 2026-11-24 17:08, waiting for the owner's decision.

Toxic's own chord hook does not open a take over a Project KO window - it has
not for days, and it is Toxic's side to fix
(`knowledge/request-toxic-chord.md`). But the **listening bar over the chatspace
does not need that hook**: Toxic shows the same listening bar for a *partner
take*, and a partner take hands the transcript back to the app that asked for
it instead of typing it into the focused window.

That is the route this file describes, and it is what the owner asked for in
Phase 1: *"at least have the toxic app show the listening bar when ctrl+t is
pressed inside the chatspace in PKO terminal"*.

## What was measured

```
17:08:46.387 | listening=True  hud=hidden
17:08:47.026 | listening=True  hud=visible     ← the listening bar appeared
17:08:48.406 | listening=False hud=visible
```

`start` answered `"listening"`, `status` answered `{"listening": true}`, `stop`
answered with the transcript (empty, because nobody spoke). The watcher is
`.cache\phase1-watch.ps1`; it reads Toxic's MCP status and the visibility of
the HUD window every 120 ms.

## The flow

| Step | Who | What |
| --- | --- | --- |
| 1 | the owner | presses plain `Ctrl+T` in a chatspace terminal |
| 2 | the terminal | swallows the chord (as it does today) and asks Toxic to listen |
| 3 | Toxic | opens a partner take: the cue plays, **the listening bar appears**, the microphone is taken |
| 4 | the owner | speaks, then presses one key to finish |
| 5 | the terminal | swallows that key, asks Toxic to stop, and receives the transcript |
| 6 | the terminal | writes the words into the terminal, where the agent receives them |

## What it costs

- **Project KO answers the chord in its own terminal.** This reverses the
  standing decision that the chord belongs to Toxic alone, so it is the owner's
  call.
- **Toxic's own chord is ignored while Project KO listens.** That is Toxic's
  partner rule (`hotkeys.rs:654-699`): while a partner app owns the microphone,
  every key goes to that app.
- **The bar's hint text is wrong for a terminal.** A partner take says *"Click
  the microphone again to finish · Esc to cancel"*; Project KO would finish it
  on the next key. The bar still shows; only the hint is off.
- **The words are placed by Project KO, not typed by Toxic.** That is the point
  of a partner take, and it is why the words arrive in the terminal that asked
  for them - no focus guessing, and no 21-second wait for the window that
  happens to be in front.

## What it does not bring back

- No watcher over Toxic's history: the transcript comes from the take this app
  started, in the response to its own stop call.
- No focus tracker: nothing is typed into "whatever has the focus".
- No clipboard: the words are written into the terminal's input stream.
- No microphone button in the chat: the chord in the terminal is the only
  trigger, exactly as it is today.

## The two variants

| Variant | What happens on `Ctrl+T` | Delivery |
| --- | --- | --- |
| **B1 - always** | Project KO starts the partner take at once | Project KO writes the words into the terminal |
| **B2 - as a cover** | Project KO waits ~0.4 s; if Toxic's own take opened in the meantime, it does nothing | Toxic types the words (the unicode bridge), otherwise Project KO writes them |

B2 keeps the design intact for the day Toxic's hook is fixed, at the price of
two delivery paths and a small delay. B1 is one path and deterministic.

## If the owner says no

Then Phase 1 stays with Toxic, and the ticket in
`knowledge/request-toxic-chord.md` is the only way forward. The measurements in
`evidence.md` are what the owner of that repository needs.
