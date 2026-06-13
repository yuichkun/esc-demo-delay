import { onBeforeUnmount, ref } from 'vue'

// `?worker&url` makes Vite bundle the TypeScript processor into a standalone ES
// module and hand back its URL — what `addModule()` wants. `worker.format: 'es'`
// in vite.config.ts keeps that bundle wrapper-free so it loads cleanly.
import processorUrl from './worklets/delay-processor.ts?worker&url'

const PROCESSOR_NAME = 'delay-processor'

/**
 * Loads the AudioWorklet and exposes its node. The graph is built lazily on the
 * first user gesture, since an `AudioContext` may only start in response to one.
 */
export function useDelay() {
  const isReady = ref(false)

  let ctx: AudioContext | null = null
  let node: AudioWorkletNode | null = null
  let moduleUrl = processorUrl

  async function init() {
    if (!ctx) ctx = new AudioContext()
    if (!node) {
      await ctx.audioWorklet.addModule(moduleUrl)
      node = new AudioWorkletNode(ctx, PROCESSOR_NAME)
      node.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') await ctx.resume()
    isReady.value = true
    return { ctx, node }
  }

  async function teardown() {
    node?.disconnect()
    if (ctx && ctx.state !== 'closed') await ctx.close()
    ctx = null
    node = null
    isReady.value = false
  }

  // HMR: when the processor changes, rebuild on a fresh context — a context can't
  // re-register a processor name, so a new one is the clean way to pick up edits.
  if (import.meta.hot) {
    import.meta.hot.accept('./worklets/delay-processor.ts?worker&url', async (mod) => {
      const next = (mod as { default: string } | undefined)?.default
      if (!next) return
      const wasReady = isReady.value
      moduleUrl = next
      await teardown()
      if (wasReady) await init()
    })
  }

  onBeforeUnmount(teardown)

  return { isReady, init }
}
