<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createDawInput, runtime } from '@suara/sdk'
import SuaraHostPanel from '@suara/sdk/helper/SuaraHostPanel.vue'

// The DSP worklet, written in TypeScript and bundled by Vite. `?worker&url` hands
// back a URL for addModule(); `worker.format: 'es'` (vite.config) keeps it
// wrapper-free so it loads straight into the AudioWorkletGlobalScope.
import workletUrl from './audio/worklets/my-delay.ts?worker&url'

const playing = ref(false)

let ctx: AudioContext | null = null
let node: AudioWorkletNode | null = null
let source: MediaStreamAudioSourceNode | null = null

async function buildGraph() {
  ctx = new AudioContext()
  await ctx.audioWorklet.addModule(workletUrl)
  node = new AudioWorkletNode(ctx, 'my-delay', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  // DAW input (VST) or the web DAW-simulator's source → worklet → output.
  const stream = await createDawInput()
  source = ctx.createMediaStreamSource(stream)
  source.connect(node).connect(ctx.destination)
}

async function play() {
  if (!ctx) await buildGraph()
  await ctx?.resume()
  playing.value = true
}

// VST runtime: audio flows from the DAW continuously, so start on mount.
// Web runtime: the DAW-simulator's transport (Play / Stop) drives playback.
onMounted(() => {
  if (runtime.isVst) void play()
})
</script>

<template>
  <main
    class="flex min-h-full flex-col items-center justify-center gap-3 bg-neutral-950 text-neutral-100"
  >
    <h1 class="text-xl font-semibold tracking-tight">Escentier Demo Delay ({{ runtime.kind }})</h1>

    <!-- Web用Debug UI -->
    <SuaraHostPanel v-if="runtime.isWeb" />
  </main>
</template>
