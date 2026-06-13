<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { useMidi } from '../index'

// web runtime helper: DAW MIDI が無いので画面の鍵盤 + PC キーで virtual note を
// midi.pushNote 経由で SAB ring に流す。highlight は midi.activeNotes (= SAB を
// 読み戻した reactive) を使う = 書いた note が ring を一周して返る full loop が見える。

const BASE = 48 // C3
const OCTAVES = 2
const WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11]
const BLACK_SEMIS = [
  { semi: 1, after: 0 },
  { semi: 3, after: 1 },
  { semi: 6, after: 3 },
  { semi: 8, after: 4 },
  { semi: 10, after: 5 },
]
// PC キー = GarageBand musical typing (= 下オクターブ C3..C4)
const PC_KEYS: Record<string, number> = {
  a: 48,
  w: 49,
  s: 50,
  e: 51,
  d: 52,
  f: 53,
  t: 54,
  g: 55,
  y: 56,
  h: 57,
  u: 58,
  j: 59,
  k: 60,
}
const VELOCITY = 0.8

const midi = useMidi()

const whiteKeys = computed(() => {
  const keys: { note: number }[] = []
  for (let o = 0; o < OCTAVES; o++) {
    for (const s of WHITE_SEMIS) keys.push({ note: BASE + o * 12 + s })
  }
  return keys
})

const blackKeys = computed(() => {
  const total = whiteKeys.value.length
  const keys: { note: number; left: number }[] = []
  for (let o = 0; o < OCTAVES; o++) {
    for (const b of BLACK_SEMIS) {
      const precedingWhite = o * 7 + b.after
      keys.push({ note: BASE + o * 12 + b.semi, left: ((precedingWhite + 1) / total) * 100 })
    }
  }
  return keys
})

const held = reactive(new Set<number>())

function noteOn(note: number): void {
  if (held.has(note)) return
  held.add(note)
  midi.pushNote?.(0, note, VELOCITY)
}

function noteOff(note: number): void {
  if (!held.has(note)) return
  held.delete(note)
  midi.pushNote?.(1, note, 0)
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.repeat) return
  const note = PC_KEYS[e.key.toLowerCase()]
  if (note !== undefined) noteOn(note)
}

function onKeyUp(e: KeyboardEvent): void {
  const note = PC_KEYS[e.key.toLowerCase()]
  if (note !== undefined) noteOff(note)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <div class="keyboard">
    <div class="white-row">
      <button
        v-for="k in whiteKeys"
        :key="k.note"
        class="white"
        :class="{ active: midi.activeNotes.has(k.note) }"
        @pointerdown="noteOn(k.note)"
        @pointerup="noteOff(k.note)"
        @pointerleave="noteOff(k.note)"
        @pointercancel="noteOff(k.note)"
      ></button>
    </div>
    <button
      v-for="k in blackKeys"
      :key="k.note"
      class="black"
      :class="{ active: midi.activeNotes.has(k.note) }"
      :style="{ left: k.left + '%' }"
      @pointerdown="noteOn(k.note)"
      @pointerup="noteOff(k.note)"
      @pointerleave="noteOff(k.note)"
      @pointercancel="noteOff(k.note)"
    ></button>
  </div>
</template>

<style scoped>
.keyboard {
  position: relative;
  height: 96px;
  touch-action: none;
  user-select: none;
}

.white-row {
  display: flex;
  height: 100%;
  gap: 2px;
}

.white {
  flex: 1;
  background: #e8e9ec;
  border: none;
  border-radius: 0 0 4px 4px;
  cursor: pointer;
  padding: 0;
}

.white.active {
  background: var(--accent);
}

.black {
  position: absolute;
  top: 0;
  width: 4%;
  height: 60%;
  transform: translateX(-50%);
  background: #1b1d21;
  border: 1px solid #000;
  border-radius: 0 0 3px 3px;
  cursor: pointer;
  padding: 0;
}

.black.active {
  background: var(--accent);
  border-color: var(--accent);
}
</style>
