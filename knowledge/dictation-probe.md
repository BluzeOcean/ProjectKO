# The dictation probe

**Status:** kept on purpose, 2026-11-24. It is a diagnostic, not product
behaviour, and the owner asked for it to stay.

The probe records what a Project KO window receives when another process types
into it. It exists because the dictation chord has been investigated for days
without a way to see what the window actually got: Toxic writes nothing to
disk, so the only trace of a failed delivery is what the app itself saw.

## What it records

| Event | Line |
| --- | --- |
| the chord and its modifiers | `keydown code=17 key=Control ctrl=1 shift=0 alt=0 composing=0 target=textarea.xterm-helper-textarea` |
| whether the app cancelled it | `  ^ after: defaultPrevented=1` |
| the release of a key | `keyup   code=84 key=t ctrl=0 target=...` |
| a unicode packet (the text Windows injects) | `keydown code=229 key=Unidentified ...` |
| the text that arrived | `beforeinput type=insertText data="Hello" ...` |
| which control has the focus | `focus textarea.xterm-helper-textarea` |

The lines are kept in the window's own web view storage under
`mrmak.dictationProbe`, so an agent can read them from disk after the fact
without asking anyone to copy anything off a badge.

## Switching it

The service owns the setting, and an agent switches it over the API:

```powershell
$body = '{"badge":true}'
Invoke-RestMethod -Uri "$origin/api/dictation/probe" -Method POST `
  -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body
```

| Field | Meaning | Default |
| --- | --- | --- |
| `recording` | keep writing the lines into the window's storage | **on** |
| `badge` | show the overlay on screen | off |

Recording starts on because a measurement that is never taken cannot be read.
The badge starts off because it must not block the view; the owner asked to see
it and could not, so it is now a small, bright tab in the corner that opens on
hover and stays open when it is clicked.

The setting is saved with the rest of the settings, so it survives a restart of
the app and the service.

## Reading the lines

```powershell
$dir = "$env:LOCALAPPDATA\com.projectko.workspace\EBWebView\Default\Local Storage\leveldb"
Get-ChildItem -LiteralPath $dir -File | ForEach-Object {
  try { $fs=[System.IO.File]::Open($_.FullName,'Open','Read','ReadWrite'); $ms=New-Object System.IO.MemoryStream; $fs.CopyTo($ms); $fs.Dispose() } catch { return }
  $text = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
  foreach ($m in [regex]::Matches($text, '\d\d:\d\d:\d\d\.\d\d\d \| [^"\r\n]{0,220}')) { $m.Value }
}
```

The file is locked while the app runs, so it has to be opened with
`FileShare.ReadWrite`; `ReadAllBytes` throws.

## The bug it is used for

`.debuglog/` is the working log for the chord defect. Its
`evidence.md` is written from these lines.

## Limits

- It records only dictation-relevant keys: the chord, its modifiers, and any
  unicode packet. An ordinary letter is not written down.
- It never reads the clipboard, never sends anything, and stays inside the
  window.
- Both desktop windows share one storage key, so the lines of the Chatspace and
  the Vaultspace are merged. The probe merges rather than overwrites for that
  reason.
