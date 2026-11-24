# The development server's start-up cost

Status: measured 2026-11-24 on this machine (Windows, Project KO 0.6.4).

The `pKO` shortcut opens a development build: `pKO-Dev.cmd` runs
`tauri dev`, the debug binary starts the service, and the service starts a
**Vite** dev server that serves the interface from source. That server was
spending about **twelve seconds** before the window had anything to show.
Other Tauri apps start instantly on dev builds, and so does this one now.

## Where the time went

Measured with the service started the same way the debug build starts it, and
a headless Edge loading the chat window (no window, no focus taken):

| Stage | Before | After |
| --- | --- | --- |
| npm + `tauri dev` CLI | 0.9 s | 0.9 s |
| cargo compile of the shell | 12.2 s, every launch | 0.3 s, once |
| Node service → `ready` | 0.68 s | 0.57 s |
| **first page load** | **12.2 s** | **0.20 s** |
| service spawn → rendered | 13.5 s | **1.56 s** |

The whole cost was inside the first page load, and a CPU profile of that call
named the culprit: **57% of the time was `FSWatcher`** - the dev server's file
watcher, registering a watch for every directory it found before it would serve
the first page.

## What was being watched

Vite watches the repository root. The repository is not only interface source:

| Folder | Files | Directories |
| --- | --- | --- |
| `.cache/` | 30,047 | 17,983 |
| `src-tauri/target/` | 13,738 | 2,248 |
| `node_modules/` | 9,666 | 1,058 |
| `.git/` | 125 | 89 |
| `workspace/` | 210 | 27 |
| `src/` | 120 | 6 |

`.cache/` is scratch (probes, screenshots, captures), `src-tauri/target/` is the
Rust build tree, and `workspace/` is the vault - which also arrives through a
**junction** at `public/workspace`, so the watcher followed it as well. The
watcher was also holding the event loop: the same 42 modules that took 5.3 s to
transform took 196 ms once the watcher was out of the way.

## The fix

`vite.config.ts` now tells the watcher to leave those trees alone:

```ts
server: {
  watch: {
    ignored: ['**/node_modules/**', '**/.git/**', '**/.cache/**', '**/dist/**', '**/target/**', '**/workspace/**'],
  },
}
```

Measured with that one change: `transformIndexHtml` **6,864 ms → 187 ms**, and
the whole start-to-rendered path **13.5 s → 1.56 s**.

The ignores only stop *watching*. Serving is untouched: `server.fs.allow` and
`publicDir` still reach `workspace/`, and the vault's own watcher in the service
(`watch(vault.file, ...)`) is a separate one.

## The other way to start

Serving the **built** interface instead of the source skips Vite entirely: the
service serves `dist/`, there is no watcher and no module transform.

| Mode | Service → rendered | Requests | Transferred |
| --- | --- | --- | --- |
| Development (Vite, hot reload) | 1.56 s | 44 | 3.9 MB |
| Built interface (`dist/`) | 0.82 s | 14 | 615 KB |

The development launcher keeps the source interface, because editing it should
reload the running window. A launcher that only opens the app would use the
built one - the debug binary always asks for development mode
(`MRMAK_DEV=1` in `src-tauri/src/main.rs`), so that is the piece to change.

## The shell recompiled itself on every launch

The console told the second half of the story:

```
Compiling projectko v0.6.4 (V:\06_App\ProjectKO\src-tauri)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 12.24s
```

Twelve seconds, every time, on a crate whose sources had not changed. The
cause is cargo's rule for a **missing** watched path: `tauri_build::build()`
emits

```
cargo:rerun-if-changed=..\src-tauri\capabilities
```

and `src-tauri/capabilities` **does not exist** (the configuration lists no
capability files, and the interface talks to its own service over HTTP rather
than the Tauri JavaScript API, so it needs none). Cargo re-runs a build script
on every build when a watched path is missing. The rewritten build output is
then newer than the crate's fingerprint, so the crate itself is dirty, and the
shell is compiled again - forever.

Measured with the directory present:

| Build | Before | After |
| --- | --- | --- |
| first | 11.8 s, "Compiling projectko" | 11.3 s, "Compiling projectko" |
| second | 11.8 s, "Compiling projectko" | **0.28 s, "Finished"** |

`src-tauri/capabilities/.gitkeep` now holds the directory. An empty
directory cannot be committed to git, and the file has to exist for cargo to
have something stable to watch.

One more compile is expected on the next launch, and only that one: cargo also
watches `TAURI_CONFIG`, which the Tauri CLI sets and a plain `cargo build`
does not, so the two environments take turns invalidating each other. Within
the launcher's own environment every launch after the first is clean.

## Not the cause

- **The Rust shell was not slow to start.** It spawns the service and waits for
  its `ready` line before it builds the windows. It was slow to *compile*, for
  the reason above.
- **Cargo's fingerprint stamp is not the whole story.** A plain `cargo build`
  from an agent shell can also *look* like a rebuild because plain `cargo build`
  and `tauri dev` use different environment fingerprints (`TAURI_CONFIG`), so
  each one invalidates the other. While the app is running, cargo also cannot
  replace `target/debug/projectko.exe` ("Access is denied"), which makes it
  compile again on the next attempt.

## Reproducing the measurement

The service can be started alone, and the window loaded headlessly:

```powershell
$env:MRMAK_DEV = '1'
node desktop/service/main.mjs --repo V:\06_App\ProjectKO --ui V:\06_App\ProjectKO\dist --state V:\06_App\ProjectKO\.cache\pko-boot-probe
```

Then load the printed `chats` URL with Playwright's headless Edge and read
`performance.getEntriesByType('navigation')`. A CPU profile of the same call
(`node --cpu-prof`) names the watcher in one step.
