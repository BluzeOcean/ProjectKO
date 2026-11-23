# Restarting the app during a session

Status: measured 2026-11-24 while rewiring dictation.

The window the owner watches is `Project KO — Chats`; its handle changes on every
restart, so find it instead of remembering it:

```powershell
pwsh -NoProfile -File .cache\pko-windows.ps1
```

The app runs as `tauri dev` → `cargo run --no-default-features -- --repo <repo>`,
so the service is plain `node desktop/service/main.mjs` and the UI is the built
`dist`. A TypeScript change needs `npm run build`; a service change only needs
the restart.

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
