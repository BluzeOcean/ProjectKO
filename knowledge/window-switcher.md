# Two windows, two switcher entries

The app owns exactly two windows: `chats` (Chatspace) and `workspace`
(Vaultspace). Windows should therefore show exactly two Project KO entries in
Alt+Tab. When it showed eight, none of them were extra app windows.

## What the extra entries were

They were shell-owned `Windows.Internal.Shell.TabProxyWindow` objects, not
windows of the app. Checking each one by selecting it with Alt+Tab returned
`explorer.exe` as the owner, while `EnumWindows` and UI Automation both
reported a single `projectko.exe` with two `Tauri Window` handles.

They appeared in pairs per window lifetime and carried the page title from the
build that created them (`Project KO — Chats` before the Chatspace rename,
`Project KO — Chatspace` after). They are cached by the shell and survive the
app exiting: with `projectko.exe` stopped, all eight were still listed.

## How they got there

They accumulate when the process dies without tearing its windows down, which is
what the development loop does — rebuild, kill, relaunch. A normal quit leaves
nothing: measured with a freshly restarted shell, one launch showed exactly two
entries, a clean quit (`projectko --quit`) showed none, and hiding Chatspace
before killing the process showed none either.

## What the app guarantees now

- `make_windows` is idempotent. If a window already exists it points the open
  window at the new service URL (`WebviewWindow::navigate`) and returns, so a
  restarted service can never build a second pair. This also replaces the old
  "Project KO could not open" dialog that appeared on a repeated `ready` event.
- `window_identity::hide_helper_windows` marks every top-level window of the
  process that is not a `Tauri Window` as a tool window (`WS_EX_TOOLWINDOW`),
  which keeps the single-instance event target, tao's thread window and the
  pseudo console out of Alt+Tab and the taskbar.

To verify: quit the app normally, run it once, and open Alt+Tab — two entries
while it runs and none after it quits. Entries cached from earlier crashes belong
to windows that no longer exist and are dropped when the shell restarts.

## Clearing the cached entries

Only the shell can clear them, and only a shell restart does. Measured on
2026-11-24 with four dangling `Project KO — Chatspace` entries — the title of an
older build, where the live windows are `Project KO — Chats` and
`Project KO — Workspace`:

```powershell
# The shell is the explorer.exe WITHOUT /factory. The /factory ones are COM
# helpers (thumbnail and preview hosts); they are not the shell and must be
# left alone.
$shell = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" |
  Where-Object { $_.CommandLine -notmatch '/factory' }
foreach ($p in $shell) { Stop-Process -Id $p.ProcessId -Force }
Start-Sleep -Seconds 3
Start-Process -FilePath 'C:\Windows\explorer.exe'
```

The taskbar and the desktop are back in a few seconds, and every application
keeps running: the shell restart closes no other app. **It does close open File
Explorer windows**, so look for `CabinetWClass` windows first and ask the owner
before doing it. The three `explorer.exe /factory` processes on this machine are
normal and stay as they are.

**The fix is not permanent.** The entries come back after the next rebuild,
because the development loop kills the app without a clean quit. Quitting the
app cleanly first (`projectko.exe --quit`) leaves no entry behind, so a clean
quit is the way to keep the switcher tidy; the shell restart is the on-demand
remedy for the entries that are already there.

