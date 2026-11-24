# Measurement: the hex.exe pile needs no restoring, and Toxic was restarted by another session

**Taken:** 2026-11-24 21:51-22:01 (Asia/Shanghai).
**By:** the agent that took over the handoff.
**Trigger:** the owner reported that `Ctrl+T` had stopped responding in Chrome
and suspected this agent had altered the Toxic app.

## The hex.exe question - answered

The owner asked for the killed `hex.exe` processes to be put back. **There is
nothing to put back.** Every one of the 16 extra processes was an **orphan**:
all of their parent PIDs are dead - leftovers from Toxic sessions between
11/23 and today, which could never have returned on their own.

```
parents checked: 13984 2944 37092 23160 8592 18396 33592 34344 33292
                  32200 26952 14332 24140 34504 40112 43196
-> none of them is alive
```

A live Toxic spawns **one** engine, and it does so at startup:

```
hex 37344 parent 43192 (toxic) started 2026-11-24 22:00:44
   "C:\Users\Bluze\AppData\Roaming\hex\versions\3.4.0\hex.exe" service --embedded
```

**One `hex.exe`, child of the live Toxic - that is the correct state.** The
hex kill did not cause the chord failure. (One orphan from the 21:47 Toxic,
pid 33288, is still alive; it belongs to a dead parent and does nothing.)

## What actually changed on the Toxic side

| Fact | Value |
| --- | --- |
| `toxic.exe` at 21:47 | pid **11908**, started **21:47:00** - a **restart**, not the 36488 that logged the 20:43 chord |
| how it was launched | `"...\toxic.exe"` - **no arguments, no working directory**, and **no** `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` |
| Toxic's CDP log door (9333) | **dead** after that restart - it was alive at 21:39 |
| the binary | `target\release\toxic.exe` mtime **18:29:17** - unchanged |
| `hotkeys.rs` | mtime **18:24:40** - unchanged |
| git HEAD | `50ae6d3 docs(ticket): the chain is cut for the Project KO window only` - documentation only |
| `config.json` | intact: `hotkeys.enabled true`, `sttMode "chord"`, `sttChord "Ctrl+T"` |
| **Toxic's last transcript** | **20:43:33** - "Testing, testing." (`dictation status` over MCP). **Nothing since.** |

**The 21:47 restart was not this agent's.** The same session that deleted
both ticket files from the Toxic working tree at 21:45 did it. This agent
restarted Toxic once at 22:00:44 with the original working directory
(`V:\04_Projects\Toxic\src-tauri\target\release`) and did **not** change any
Toxic file, binary or configuration.

## Why "the local app got precedence" cannot be the mechanism

The owner described it as *"the ctrl+t of the local app got precedence of the
shortcut key than Toxic"*. That model is backwards for a global hook, and the
measurement proves it:

- A `WH_KEYBOARD_LL` hook is called **before** the key reaches the window. If
  Toxic's hook had swallowed the chord, **Chrome would not have opened a tab**.
- It did open one. The hookless poller caught it:

```
22:00:55.698 | down vk=1  (VK1)  | front=11028:New Tab - Google Chrome
22:01:00.399 | down vk=17 (VK17) | front=11028:New Tab - Google Chrome   <- Ctrl
22:01:00.401 | down vk=84 (VK84) | front=11028:New Tab - Google Chrome   <- T
22:01:00.539 | up   vk=17
22:01:00.540 | up   vk=84
```

**So the chord reached Chrome and was passed through** - Toxic's hook either
was not called, or was called and declined. "The local app won" is not a
mechanism that exists; "Toxic's hook did not act" is.

Which of the two it is needs **Toxic's own log**, which needs its CDP door
(9333) open.

## The rest of the machine's state at 22:05

| Thing | State |
| --- | --- |
| `projectko.exe` | pid 37884, started 21:44:32, **with** the CDP door 9334 open (the owner approved it) |
| the in-page key recorder | armed 22:05:52 on the `surface=chats` page |
| the foreground sampler | running (`.cache/fg-watch.log`) |
| the native hook probe | running (`.cache/hookprobe2.log`) |
| the hookless poller | running (`.cache/keypoll.log`) |
| the old PowerShell probes | retired - they were the broken instrument, see [m-2026-11-24-2155-chain-dead.md](m-2026-11-24-2155-chain-dead.md) |
