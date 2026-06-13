import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// dev port は suara.json の devUrl が source of truth (= broker も同じ suara.json を読む)。
const manifest = JSON.parse(readFileSync(new URL('./suara.json', import.meta.url), 'utf8'))
const devPort = Number(new URL(manifest.devUrl).port)

// https://vite.dev/config/
export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
  plugins: [vue(), vueDevTools(), tailwindcss()],
  // AudioWorklet processors are imported with `?worker&url`. Bundling them as ES
  // modules keeps the output wrapper-free so addModule() can load it directly.
  worker: {
    format: 'es',
  },
  resolve: {
    alias: [
      // @suara/sdk → the SDK vendored in src/sdk (same import name as the real
      // package, so userland works under web / VST / prod unchanged).
      {
        find: /^@suara\/sdk$/,
        replacement: fileURLToPath(new URL('./src/sdk/index.ts', import.meta.url)),
      },
      {
        find: /^@suara\/sdk\//,
        replacement: fileURLToPath(new URL('./src/sdk/', import.meta.url)),
      },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  // SAB (useMidi / useTransport / useParam) needs crossOriginIsolated === true,
  // so the dev server sends COOP/COEP on every response.
  server: {
    port: devPort,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
