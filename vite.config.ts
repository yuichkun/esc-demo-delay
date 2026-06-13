import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// dev port は suara.json の devUrl が source of truth (= broker も同じ suara.json を読む)。
const manifest = JSON.parse(readFileSync(new URL('./suara.json', import.meta.url), 'utf8'))
const devPort = Number(new URL(manifest.devUrl).port)

// worklet (src/audio/worklets/ 配下) を編集したら HMR せず window ごと full-reload する
// 即席プラグイン。worklet の HMR は AudioContext を作り直す必要があって複雑なので、
// まるごと reload に倒してシンプルに保つ。
interface WorkletReloadCtx {
  file: string
  server: { ws: { send: (payload: { type: 'full-reload' }) => void } }
}
function workletFullReload() {
  return {
    name: 'worklet-full-reload',
    handleHotUpdate(ctx: WorkletReloadCtx) {
      if (ctx.file.includes('/audio/worklets/')) {
        ctx.server.ws.send({ type: 'full-reload' })
        return [] // 既定の HMR はスキップ
      }
    },
  }
}

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
  plugins: [vue(), vueDevTools(), tailwindcss(), workletFullReload()],
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
