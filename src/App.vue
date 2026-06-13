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
const mix = ref(0)
const delayTime = ref(0.5)

let ctx: AudioContext | null = null
let myDelayNode: AudioWorkletNode | null = null
let source: MediaStreamAudioSourceNode | null = null
let moduleUrl = workletUrl

async function buildGraph() {
  ctx = new AudioContext()
  await ctx.audioWorklet.addModule(moduleUrl)
  myDelayNode = new AudioWorkletNode(ctx, 'my-delay', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  // DAW input (VST) or the web DAW-simulator's source → worklet → output.
  const stream = await createDawInput()
  source = ctx.createMediaStreamSource(stream)
  source.connect(myDelayNode).connect(ctx.destination)
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
  myDelayNode?.disconnect()
  if (ctx && ctx.state !== 'closed') await ctx.close()
  ctx = null
  myDelayNode = null
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

watch(mix, () => {
  if (!myDelayNode) return
  const nodeMixParam = myDelayNode.parameters.get('mix')
  if (!nodeMixParam) throw new Error('mix param is not defined')
  nodeMixParam.value = mix.value
})

watch(delayTime, () => {
  if (!myDelayNode) return
  const nodeDelayTimeParam = myDelayNode.parameters.get('delayTime')
  if (!nodeDelayTimeParam) throw new Error('delayTime param is not defined')
  nodeDelayTimeParam.value = delayTime.value
})

onBeforeUnmount(teardown)
</script>

<template>
  <main
    class="flex min-h-full flex-col items-center justify-center gap-3 bg-neutral-950 text-neutral-100"
  >
    <h1 class="text-xl font-semibold tracking-tight">Escentier Demo Delay ({{ runtime.kind }})</h1>

    <div>
      mix: {{ mix }}
      <input type="range" min="0" max="1" step="0.1" v-model="mix" />
    </div>

    <div>
      delay: {{ delayTime }}s
      <input type="range" min="0" max="2" step="0.01" v-model="delayTime" />
    </div>

    <!-- Web用Debug UI -->
    <SuaraHostPanel v-if="runtime.isWeb" />
  </main>
</template>
