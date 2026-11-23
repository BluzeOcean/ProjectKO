# Restarting the app during a session

Status: measured 2026-11-24 while rewiring dictation.

The window the owner watches is `Project KO — Chats`; its handle changes on every
restart, so find it instead of remembering it:

```powershell
pwsh -NoProfile -File .cache\pko-windows.ps1
```

The app runs as `tauri dev` → `cargo run --no-default-features -- --repo <repo>`,
so the service is plain `node desktop/service/main.mjs`. In development it serves
the UI from **Vite**, not from `dist`: the page loads `/@vite/client` and
`/src/main.tsx` (measured 2026-11-24), so a component change arrives on reload
and `npm run build` is only for the packaged app. A service change still needs the
restart.

That also means the window runs the **development** React build, where
`<StrictMode>` double-invokes effects and production-only assumptions break — see
[the mounted-guard lesson](toxic-voice.md#a-mounted-guard-has-to-survive-strictmode).

## Driving the running window

Clicking by screen coordinates is guesswork, and this machine's screens are at 125%
with windows that report virtualised rectangles. Ask WebView2 for DevTools instead:

```powershell
Start-Process cmd.exe -ArgumentList '/c','set "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222" && npm run desktop:dev > .cache\pko-dev.log 2>&1' -WorkingDirectory <repo> -WindowStyle Hidden
```

`http://127.0.0.1:9222/json/version` then answers, and Playwright can drive the
real app — real button clicks, real `page.keyboard.press`, real DOM reads:

```js
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('surface=chats'))
await page.getByRole('button', { name: 'Dictate a message', exact: true }).click()
```

Keyboard events sent this way are browser-level, so they test the page's handlers
and not Toxic's system hook — a `Control+t` pressed through CDP proves nothing
about Toxic, but it does prove whether the page still binds the chord. Restart
without the variable when finished: the port is a remote-control door.

## The colour trap

Do not start it from an agent shell that carries `NO_COLOR`. The app hands its
environment to the CLIs it spawns, and Claude Code and Codex honour `NO_COLOR` by
dropping every ANSI colour: the terminal turns into pale white text and the
session looks like a theme change. It is not.

Measured: with `NO_COLOR=1` inherited, the banner art drew as near-white with no
saturated pixels; after restarting with the variable cleared, the same banner
was `#d07050` again. Start it from a clean environment:

```powershell
Start-Process cmd.exe -ArgumentList '/c','set "NO_COLOR=" && npm run desktop:dev > .cache\pko-dev.log 2>&1' -WorkingDirectory <repo> -WindowStyle Hidden
```

The theme knobs are separate and unchanged by any of this: Settings → Appearance
sets the chat palette, and the chat menu holds **Terminal appearance**
(`Original CLI colors` lets the CLI paint itself, `Project KO Focus` overlays the
role colours).
