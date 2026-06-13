# esc-demo-delay

Foundation for a Vue 3 app that runs audio DSP in an
[`AudioWorklet`](https://developer.mozilla.org/docs/Web/API/AudioWorklet) — worklet written
in TypeScript, bundled by Vite, hot-reloaded in dev, styled with Tailwind CSS v4.

Built on [Vite+](https://viteplus.dev/) — use the `vp` CLI, not `npm`/`pnpm`.

## Commands

```sh
vp install   # install dependencies
vp dev       # start the dev server (with worklet HMR)
vp build     # type-check + production build
vp check     # format + lint + typecheck
```

## What's wired up

The processor lives in `src/audio/worklets/delay-processor.ts` (a passthrough stub — drop
your DSP in there) and runs on the audio thread inside the `AudioWorkletGlobalScope`.

- **TypeScript worklets.** The processor is plain TypeScript. Its globals
  (`registerProcessor`, `AudioWorkletProcessor`) come from `@types/audioworklet`, scoped to
  `tsconfig.worklet.json` (which leaves out the DOM lib so it can't clash with app code).
  `tsconfig.app.json` excludes the worklet folder, so each side type-checks against the
  right globals.

- **`?worker&url` import.** `src/audio/useDelay.ts` loads it with Vite's query suffix:

  ```ts
  import processorUrl from './worklets/delay-processor.ts?worker&url'
  await ctx.audioWorklet.addModule(processorUrl)
  ```

  `?worker&url` makes Vite bundle the TypeScript into a standalone module and return its
  URL. `worker.format: 'es'` in `vite.config.ts` keeps that bundle wrapper-free so it loads
  cleanly via `addModule()`.

- **HMR.** Editing the processor fires `import.meta.hot.accept` in `useDelay.ts`, which
  rebuilds the graph on a fresh `AudioContext` (a context can't re-register a processor
  name, so a new one is the clean way to pick up edited DSP).

- **Tailwind v4** via `@tailwindcss/vite`, entry at `src/assets/main.css`.

## Layout

```
src/
  audio/
    useDelay.ts                 # composable: load worklet, HMR, teardown
    worklets/
      delay-processor.ts        # the AudioWorkletProcessor (audio thread)
  assets/main.css               # Tailwind entry
  App.vue                       # UI (Tailwind)
  main.ts                       # app entry
```
