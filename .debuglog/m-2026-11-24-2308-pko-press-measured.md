# Measurement: the chord reaches the Project KO page, and never reaches Toxic

**Taken:** 2026-11-24 23:08-23:09 (Asia/Shanghai).
**By:** the agent that took over the handoff.
**Status:** the root cause of Phase 1, as far as it can be established without
changing the Toxic app.

## What the owner did

- **23:08:33** - `Ctrl+T` in the **Project KO terminal**. No listening bar.
- **23:09:13** - `Ctrl+T` in **Notepad**. The bar appeared, "hello hello" was
  spoken and the words were typed into Notepad.

**Toxic's shortcut works in every window except Project KO.** That is the
symptom, and it is not in question.

## What the instruments say

### 1. The keystroke really happened, in the Project KO window

`.cache/keypoll.log` (a `GetAsyncKeyState` poller - **no hook at all**, so it
cannot be blamed on the hook chain):

```
[23:08:33.366] down vk=1   (VK1)   | front=37884:Project KO - Chats | focus=7980:Project KO - Chatspace
[23:08:33.875] down vk=17  (VK17)  | front=37884:Project KO - Chats | focus=7980:Project KO - Chatspace
[23:08:33.877] down vk=84  (VK84)  | front=37884:Project KO - Chats | focus=7980:Project KO - Chatspace
[23:08:33.879] down vk=162 (VK162) | front=37884:Project KO - Chats | focus=7980:Project KO - Chatspace
[23:08:34.402] up   vk=17  | ... | up vk=84 | up vk=162
```

The same shape in Notepad 40 seconds later:

```
[23:09:13.645] down vk=17  (VK17)  | front=29980:Untitled - Notepad
[23:09:13.648] down vk=162 (VK162) | front=29980:Untitled - Notepad
```

**The physical chord is identical in both windows.** Note the focused window
in Project KO: **pid 7980, `msedgewebview2.exe`** - the WebView2 browser
process, a *different process* from the foreground window (`projectko.exe`
37884).

### 2. The page received it as a real, trusted key event

The in-page recorder (`.cache/pko-keytrace.mjs`, armed 23:00:24, read over
Project KO's CDP door 9334):

```
{"t":"23:08:33.841","kind":"keydown","code":17,"key":"Control","domCode":"ControlLeft",
 "ctrl":1,"TRUSTED":1,"composing":0,"target":"textarea.xterm-helper-textarea","focus":1,"prevented":0}
{"t":"23:08:33.842","kind":"keydown","code":84,"key":"t","domCode":"KeyT",
 "ctrl":1,"TRUSTED":1,"composing":0,"target":"textarea.xterm-helper-textarea","focus":1,"prevented":1}
```

`TRUSTED=1` - the browser delivered this from a Windows message; it was not
fabricated in the page. `composing=0` - no IME was involved. The event landed
on the terminal's own hidden textarea, so the terminal really had the focus.
`prevented=1` on the `t` is xterm cancelling a key it does not use (by
design - the CLI must never see `^T`).

### 3. No low-level hook is called for it

The stand-alone probe of 20:43 logged **no rows of any kind** between
20:43:01.914 and 20:43:29.178 - a hole that opens exactly when Project KO
takes the foreground and closes when Chrome takes it. That probe demonstrably
worked: it logged 2445 rows, the owner's typing, and the Chrome chord at
20:43:29. A removed hook never comes back on its own, and this one logged
again on both sides of the hole.

**And this session confirmed the chain is healthy**: the Notepad chord at
23:09:13 was matched by Toxic and typed "hello hello" into Notepad.

## The conclusion

For a key to reach an application as a **trusted** key event while **no
`WH_KEYBOARD_LL` hook on the machine is called for it**, the only route left
is the **raw input path** (`WM_INPUT`):

| How the key arrives | DOM event | low-level hook |
| --- | --- | --- |
| `WM_KEYDOWN` | trusted | **called** |
| `WM_INPUT` (raw input) | trusted | **not called** |
| `dispatchEvent` in the page | untrusted | not called |
| CDP `Input.dispatchKeyEvent` | trusted | not called |

CDP is excluded (Project KO's WebView2 has no debugging port in the running
build), and `dispatchEvent` is excluded by `TRUSTED=1`.

**So: the WebView2 host takes the keyboard as raw input, Chromium builds the
DOM key event from it, and the keyboard message - the one that runs the
low-level hook chain - is never generated.** That is why:

- the chord works in every other application on the machine, and
- it can never work in a Project KO terminal, because **no global chord
  shortcut can reach a Chromium web view that takes the keyboard through raw
  input**.

Project KO's own code is not involved: `src-tauri/src/win_key.rs` installs a
`WH_KEYBOARD_LL` of its own, and its callback always ends in
`CallNextHookEx` (`win_key.rs:139`) - it never swallows a key. There is no
`RegisterRawInputDevices`, no `PostMessage` and no synthesised key event
anywhere in the repository, and no third-party DLL is injected into the
WebView2 processes (see
[m-2026-11-24-2118-pko-side-is-clean.md](m-2026-11-24-2118-pko-side-is-clean.md)).

## What follows from it

The chord *is* delivered to the page - as a trusted `keydown` on the
terminal's own textarea, with `ctrl=1`. **Project KO can see the chord.**
It is only Toxic that cannot.

**The decision this forces is the owner's** (B1/B2 in the handoff):

- **B1 - Project KO drives a partner take.** The page sees the chord, asks
  Toxic's MCP to open a take (`dictation start`), the owner speaks, Toxic
  returns the transcript (`dictation stop`) and Project KO writes it into the
  terminal through the bridge it already has. **Toxic needs no new feature:
  the MCP already supports partner takes**, and a partner take returns the
  transcript instead of typing it, so nothing leaks into other windows.
- **B2 - Toxic finds a way to see the chord.** A ticket for the Toxic side:
  its hook is not called for input destined to a Chromium web view, so it
  would need a mechanism that does not depend on the low-level chain.

The earlier decision ("Toxic owns the chord") was made when the chord was
believed to reach Toxic normally. **That premise is now measured to be
false**, which is why the decision has to be looked at again - by the owner,
not by this agent.
