<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createDawInput, runtime } from '@suara/sdk'
import SuaraHostPanel from '@suara/sdk/helper/SuaraHostPanel.vue'

// The DSP worklet, written in TypeScript and bundled by Vite. `?worker&url` hands
// back a URL for addModule(); `worker.format: 'es'` (vite.config) keeps it
// wrapper-free so it loads straight into the AudioWorkletGlobalScope.
import workletUrl from './audio/worklets/my-delay.ts?worker&url'

const started = ref(false)

let ctx: AudioContext | null = null
let node: AudioWorkletNode | null = null
let source: MediaStreamAudioSourceNode | null = null
let moduleUrl = workletUrl

async function buildGraph() {
  ctx = new AudioContext()
  await ctx.resume()
  await ctx.audioWorklet.addModule(moduleUrl)
  node = new AudioWorkletNode(ctx, 'my-delay', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  // DAW input (VST) or the web DAW-simulator's virtual source → worklet → output.
  const stream = await createDawInput()
  source = ctx.createMediaStreamSource(stream)
  source.connect(node).connect(ctx.destination)
}

async function teardown() {
  source?.disconnect()
  node?.disconnect()
  if (ctx && ctx.state !== 'closed') await ctx.close()
  ctx = null
  node = null
  source = null
}

async function start() {
  if (started.value) return
  await buildGraph()
  started.value = true
}

// VST runtime has no user-gesture requirement, so start immediately there.
onMounted(() => {
  if (runtime.isVst) void start()
})

// HMR: rebuild the graph on a fresh AudioContext when the worklet's DSP changes
// (a context can't re-register a processor name, so a new one is the clean way).
if (import.meta.hot) {
  import.meta.hot.accept('./audio/worklets/my-delay.ts?worker&url', async (mod) => {
    const next = (mod as { default: string } | undefined)?.default
    if (!next || !started.value) return
    moduleUrl = next
    await teardown()
    await buildGraph()
  })
}
</script>

<template>
  <main
    class="flex min-h-full flex-col items-center justify-center gap-6 bg-neutral-950 text-neutral-100"
  >
    <div class="text-center">
      <h1 class="text-xl font-semibold tracking-tight">SuaraDevEffect</h1>
      <p class="mt-1 text-sm text-neutral-400">runtime: {{ runtime.kind }} · in → my-delay → out</p>
    </div>

    <button
      v-if="!started"
      type="button"
      class="rounded-lg bg-emerald-500 px-5 py-2.5 font-medium text-neutral-950 transition hover:bg-emerald-400"
      @click="start()"
    >
      Start audio
    </button>
    <p v-else class="text-sm text-emerald-400">running</p>

    <!-- web runtime only: stands in for the DAW (MIDI / transport / audio input). -->
    <SuaraHostPanel v-if="runtime.isWeb" />
  </main>
</template>
