# Measurement: the Project KO side carries no input synthesis at all

**Taken:** 2026-11-24 21:18 (Asia/Shanghai).
**By:** the agent that took over the handoff.
**Machine:** no owner action needed.

## Why

The corrected reading of the 20:43 evidence
([m-2026-11-24-2115-chain-gap.md](m-2026-11-24-2115-chain-gap.md)) says the
key event that reached the web view was produced *inside* the application.
Before hunting outside, the inside must be cleared.

## What was checked

**1. Source.** `grep` over `src/`, `src-tauri/`, `desktop/` for
`PostMessage`, `SendMessage`, `RegisterRawInputDevices`, `RIDEV_*`, `WM_INPUT`,
`RAWINPUT`, `dispatchEvent`, `new KeyboardEvent`:

| Hit | What it is |
| --- | --- |
| `src-tauri/src/window_identity.rs:53` | `SendMessageW(hwnd, WM_SETICON, ...)` - sets the window icon |
| `desktop/service/node_modules/@modelcontextprotocol/**` | the MCP SDK's `postMessage`, in `node_modules` |

Nothing else. There is **no** raw-input registration, **no** posted
`WM_KEYDOWN`, and **no** synthesised keyboard event anywhere in the product
code.

**2. The Rust keyboard hook.** `src-tauri/src/win_key.rs` installs a
`WH_KEYBOARD_LL` (line 42) and a `WH_MOUSE_LL` (line 44), re-arms the
keyboard hook every 10 s (line 67-74), and always ends its callback in
`CallNextHookEx` (line 139). Its only write to the input stack is a
`SendInput` of a Win-key mask (`wVk 0xE8`, lines 58-63) - and `SendInput`
**does** produce low-level hook events, so it could not hide. Zero `0xE8`
rows exist in the whole probe log, so that path never fired while the probe
was alive.

**3. The WebView2 host.** The command line of the focused process
(`msedgewebview2.exe`, pid 33424) carries no debugging door:

```
--embedded-browser-webview=1 --webview-exe-name=projectko.exe
--webview-exe-version=0.6.4 --user-data-dir=... --noerrdialogs
--embedded-browser-webview-dpi-awareness=2
--autoplay-policy=no-user-gesture-required
--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection
--lang=en-US --mojo-named-platform-channel-pipe=...
```

There is **no `--remote-debugging-port`**, so nothing is driving the Project
KO web view over CDP.

**4. Injected modules.** `CreateToolhelp32Snapshot` +
`Module32First/Next` over the WebView2 processes and PKO:

| Process | PID | Modules | Third-party modules |
| --- | --- | --- | --- |
| `msedgewebview2.exe` (browser, focused) | 33424 | 121 | **0** |
| `msedgewebview2.exe` (renderer A) | 8316 | 21 | **0** |
| `msedgewebview2.exe` (renderer B) | 39004 | 21 | **0** |
| `projectko.exe` | 18776 | 55 | 1 (the exe itself) |
| `toxic.exe` | 36488 | 61 | 1 (the exe itself) |

No overlay, no game trainer, no macro tool is patched into the web view or
into PKO.

## Verdict

**Project KO does not synthesise the key.** Not in the renderer, not in the
Rust side, not through a debugging door, and not through an injected DLL.

Combined with the previous two measurements, the cause of the 20:43 event is
now narrowed to exactly three candidates, all of them *outside* Project KO:

1. **A posted `WM_KEYDOWN` / `WM_SYSKEYDOWN`** into the WebView2 window by
   another process on the machine (the browser process turns it into the DOM
   keydown itself).
2. **A protocol-driven input** into the web view (CDP-style dispatch), from
   a process that can reach it.
3. **A synthesised DOM event** inside the page by code that is not in this
   repository (an extension, an injected script, or the app's own
   dependencies at runtime).

The next measurement separates them: `event.isTrusted` is `false` only for
case 3, and a CDP-driven event is trusted but produces no OS-level keyboard
event, exactly like a posted message.
