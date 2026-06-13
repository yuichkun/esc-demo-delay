<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createDawInput, runtime, useTransport } from '@suara/sdk'
import SuaraHostPanel from '@suara/sdk/helper/SuaraHostPanel.vue'

// The DSP worklet, written in TypeScript and bundled by Vite. `?worker&url` hands
// back a URL for addModule(); `worker.format: 'es'` (vite.config) keeps it
// wrapper-free so it loads straight into the AudioWorkletGlobalScope.
import workletUrl from './audio/worklets/my-delay.ts?worker&url'

const transport = useTransport()
const playing = ref(false)

let ctx: AudioContext | null = null
let node: AudioWorkletNode | null = null
let source: MediaStreamAudioSourceNode | null = null
let moduleUrl = workletUrl

async function buildGraph() {
  ctx = new AudioContext()
  await ctx.audioWorklet.addModule(moduleUrl)
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

async function stop() {
  if (ctx && ctx.state === 'running') await ctx.suspend()
  playing.value = false
}

async function teardown() {
  source?.disconnect()
  node?.disconnect()
  if (ctx && ctx.state !== 'closed') await ctx.close()
  ctx = null
  node = null
  source = null
  playing.value = false
}

// VST runtime: audio flows from the DAW continuously, so start on mount.
// Web runtime: the DAW-simulator's transport (Play / Stop) drives playback.
onMounted(() => {
  if (runtime.isVst) void play()
})
watch(
  () => transport.state.isPlaying,
  (isPlaying) => {
    if (runtime.isWeb) void (isPlaying ? play() : stop())
  },
)

// HMR: rebuild the graph on a fresh AudioContext when the worklet's DSP changes
// (a context can't re-register a processor name, so a new one is the clean way).
if (import.meta.hot) {
  import.meta.hot.accept('./audio/worklets/my-delay.ts?worker&url', async (mod) => {
    const next = (mod as { default: string } | undefined)?.default
    if (!next) return
    moduleUrl = next
    const wasPlaying = playing.value
    await teardown()
    if (wasPlaying) await play()
  })
}

onBeforeUnmount(teardown)
</script>

<template>
  <main
    class="flex min-h-full flex-col items-center justify-center gap-3 bg-neutral-950 text-neutral-100"
  >
    <h1 class="text-xl font-semibold tracking-tight">SuaraDevEffect</h1>
    <p class="text-sm text-neutral-400">runtime: {{ runtime.kind }} · in → my-delay → out</p>
    <p class="text-sm" :class="playing ? 'text-emerald-400' : 'text-neutral-500'">
      {{ playing ? '● playing' : '○ stopped' }}
    </p>
    <p v-if="runtime.isWeb" class="text-xs text-neutral-600">controls in the DAW simulator ↘</p>

    <!-- web runtime only: stands in for the DAW (transport / audio input / MIDI). -->
    <SuaraHostPanel v-if="runtime.isWeb" />
  </main>
</template>
