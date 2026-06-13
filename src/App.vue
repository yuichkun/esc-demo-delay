<script setup lang="ts">
import { useDelay } from '@/audio/useDelay'

const { isReady, init } = useDelay()
</script>

<template>
  <main class="flex min-h-full items-center justify-center bg-neutral-950 text-neutral-100">
    <div class="space-y-4 text-center">
      <h1 class="text-xl font-semibold tracking-tight">esc-demo-delay</h1>
      <button
        type="button"
        class="rounded-lg bg-emerald-500 px-5 py-2.5 font-medium text-neutral-950 transition hover:bg-emerald-400"
        @click="init()"
      >
        {{ isReady ? 'Audio ready' : 'Start audio' }}
      </button>
    </div>
  </main>
</template>
