// The brand assets the build leaves out.
//
// vite.config.ts sets `build.copyPublicDir: false` on purpose: `public/workspace`
// is a junction into the workspace, which holds gigabytes of reports, and the
// dev-server dashboard must never copy that into dist. The side effect is that
// `npm run build` also empties `dist/assets` and `dist/fonts`.
//
// Two folders are linked from index.html and have to be there: `public/assets`
// holds the brand marks (the nose, the favicon) and `public/fonts` holds the
// web fonts and their stylesheet. Without them the app serves 404s, the nose
// mark disappears and the type falls back to the system font.
//
// This is the narrow copy of those two folders, and nothing else. The workspace
// junction is still left alone.
import { access, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folders = ['assets', 'fonts'];

for (const folder of folders) {
  const source = path.join(repo, 'public', folder);
  const target = path.join(repo, 'dist', folder);
  const exists = await access(source).then(() => true).catch(() => false);
  if (!exists) {
    console.log(`[mak] public/${folder} is not there; nothing to copy`);
    continue;
  }
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  console.log(`[mak] copied public/${folder} -> dist/${folder}`);
}
