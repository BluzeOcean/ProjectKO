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
