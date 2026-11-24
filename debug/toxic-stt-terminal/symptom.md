# The symptom, exactly

## The one fact that localises the bug

**The chord works in every window on this machine except the Project KO
terminal.** The owner has tested and confirmed it repeatedly: a native
**PowerShell** console brings Toxic's listening bar up, and so does every
other application. **Only the Project KO terminal refuses it.**

So Toxic's hook is alive, installed, and doing its job. The fault is in the
**Project KO window's input path** - the way the key events reach that web
view - not in Toxic's chord handling, not in its hook, and not in its
configuration. Anything that blames Toxic's side for this is chasing the
wrong end of the chain.

*(Owner, 2026-11-24 19:30: "all other windows even the powershell terminal can
bring up the listening bar, only pKO terminal can't".)*

## What the owner sees

1. The owner is in a Project KO terminal (the Chatspace chat terminal, or any
   terminal pane in the app).
2. The owner presses **plain `Ctrl+T`** - no Shift, no Alt, no other modifier.
3. **Toxic's listening bar (the HUD) does not appear.**
4. Toxic's microphone is not taken; nothing is recorded; nothing is typed.
5. The terminal itself shows nothing: no `^T` reaches the CLI, because Project KO
   swallows the chord so the agent does not receive a stray control character.

**And Toxic's own trace says nothing either** - no line at all for these
presses, while the same chord in another window produces
`T pressed · chord Ctrl+T · ... · matched · starting a take`. A chord press
that the hook sees always leaves a line, so **the hook is not being called for
the keys that go into the Project KO window.**

## What "working" looks like

1. The owner presses plain `Ctrl+T` in a Project KO terminal.
2. Toxic's HUD appears and shows that it is listening.
3. The owner speaks, then presses one ordinary key to finish the take.
4. Toxic types the words into the terminal, and the agent receives them.

## What is *not* a symptom

- **The words landing in another window.** Toxic types into whatever has the
  focus when the typing starts, which is about 21 s after the chord. That is a
  separate Toxic-side defect, ticketed in
  `knowledge/request-toxic-typing-target.md`. It is not this bug.
- **The Project KO terminal swallowing the chord.** That is deliberate and
  correct: the CLI must not receive `^T`.

## The environment it must work in

**Before any test: nothing may be dictating.** The agent app is a Toxic
*partner*; while a partner take is recording, Toxic passes the chord to the
focused window instead of opening a take. A test made while dictating to the
agent proves nothing. See the README.

| Thing | Value on this machine |
| --- | --- |
| Toxic | 1.2.0, release build, `V:\04_Projects\Toxic\src-tauri\target\release\toxic.exe` |
| Chord | `Ctrl+T`, `sttMode: "chord"`, `hotkeys.enabled: true` |
| Project KO | debug build, `src-tauri\target\debug\projectko.exe`, service `desktop/service/main.mjs` |
| Terminal | xterm.js v6 inside the web view |
| Config | `%APPDATA%\app.toxic.desktop\config.json` |
| Takes | `%APPDATA%\app.toxic.desktop\history.json`, schema `{id, at, text, engine}` - **no target field, so it records *that* a take happened, never *where* it was typed** |
| Toxic's own log | **none on disk** - `engines::log` goes to the Logs view of the Toxic window and to a Tauri event, nowhere else |

## How to observe it

The probe (`src/desktop/dictationProbe.ts`) records, per window, every chord
key-down and key-up, every unicode packet (`keyCode 229`) and every
`beforeinput` of inserted text, and keeps the lines in the web view's storage
under `mrmak.dictationProbe`. It is read from disk, so nobody has to copy
anything off a badge:

```powershell
$dir = "$env:LOCALAPPDATA\com.projectko.workspace\EBWebView\Default\Local Storage\leveldb"
Get-ChildItem -LiteralPath $dir -File | ForEach-Object {
  try { $fs=[System.IO.File]::Open($_.FullName,'Open','Read','ReadWrite'); $ms=New-Object System.IO.MemoryStream; $fs.CopyTo($ms); $fs.Dispose() } catch { return }
  $text = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
  foreach ($m in [regex]::Matches($text, '\d\d:\d\d:\d\d\.\d\d\d \| [^"\r\n]{0,220}')) { $m.Value }
}
```

The badge on screen is the same lines, for a human who wants to watch them live.
