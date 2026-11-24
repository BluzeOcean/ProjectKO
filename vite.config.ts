import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3009,
    open: true,
    fs: {
      allow: ['.'],
    },
    // The repository carries trees that have nothing to do with the
    // interface: the Rust build directory, the scratch folder, the vault
    // (which also arrives through a junction in public/), and the built
    // output. Watching them cost about seven seconds at every start, because
    // the watcher registered a watch for every directory it found - 3,832 of
    // them under .cache alone - before the first page could be served.
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.cache/**',
        '**/dist/**',
        '**/target/**',
        '**/workspace/**',
      ],
    },
  },
  publicDir: 'public',
  build: {
    // public/workspace is a junction into workspace/ (gigabytes of reports).
    // The dashboard is a dev-server tool, so never copy publicDir into dist.
    copyPublicDir: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
})
