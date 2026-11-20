# A build empties dist/assets and dist/fonts

Status: verified 2026-11-20 on v0.6.4.

`vite.config.ts` sets `build.copyPublicDir: false` on purpose: `public/workspace`
is a junction into `workspace/`, which holds gigabytes of reports, and the
dev-server dashboard must never copy it into `dist`.

The side effect is that `npm run build` also empties `dist/assets` and
`dist/fonts`. The hashed JS and CSS are written by the build itself, but the files
that come from `public/` are not copied. `index.html` asks for two of them
directly — `/assets/pko-mark.png` as the favicon and `/fonts/fonts.css` as the
web-font stylesheet — and `src/components/PkoLogo.tsx` loads
`/assets/pko-mark.png` and `/assets/pko-mark-chats.png` for the nose.

So after a plain build the app serves 400s for those paths: the nose mark
disappears and Fraunces, Inter and JetBrains Mono fall back to system fonts. The
page still renders, so it is easy to miss in a screenshot that was taken before
the copy.

## After every build

```powershell
Copy-Item -Path 'public\assets\*' -Destination 'dist\assets' -Recurse -Force
Copy-Item -Path 'public\fonts' -Destination 'dist\fonts' -Recurse -Force
```

Copy the folder, not its contents, when `dist/fonts` does not exist yet. Copying
`public/fonts` into an existing `dist/fonts` leaves a stray file named `fonts`
inside it; delete `dist/fonts` and copy the folder again to clean that up.

## What the tests already do

`desktop/service/test/ui.mjs` and `desktop/service/test/theme-ui.mjs` copy
`public/assets` into `dist/assets` before their browser runs, for the same
reason. They do not restore `dist/fonts`, so a browser test on a fresh build
runs on fallback fonts.

## Why it is not fixed in the build script

`copyPublicDir: false` protects the repository from copying gigabytes of
reports into `dist`. The fix is therefore a narrow copy of two folders, not a
re-enable of `copyPublicDir`, and it is left as an explicit step until that
narrow copy is wired into `npm run build`.
