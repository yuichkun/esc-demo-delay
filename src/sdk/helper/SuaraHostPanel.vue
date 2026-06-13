<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { configureWebInput, createDawInput, useTransport } from '../index'
import VirtualKeyboard from './VirtualKeyboard.vue'

// web runtime の「DAW 代役」。VST では DAW が供給するので mount されない。
// 操作モデルは 1 本: Play/Stop = transport の再生 = 実際に音が鳴る/止まる
// (App が transport.isPlaying を見て graph を resume/suspend する)。
// Input はその再生時に流れるソース、Level は再生中の入力レベル。

const open = ref(true)
const transport = useTransport()

// --- 唯一の再生コントロール (= transport)。App 側の watcher が音を駆動する。 ---
function togglePlay(): void {
  transport.setPlaying?.(!transport.state.isPlaying)
}
function onTempo(e: Event): void {
  transport.setTempo?.(Number((e.target as HTMLInputElement).value))
}

// --- 入力ソース = Play 時に流れる音。再生中に変えても live で差し替わる。 ---
type Src = 'tone' | 'file'
const source = ref<Src>('tone')
const fileName = ref('')
const fileEl = ref<HTMLInputElement | null>(null)

function selectTone(): void {
  source.value = 'tone'
  configureWebInput({ kind: 'tone' })
}
function pickFile(): void {
  fileEl.value?.click()
}
function onFile(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  fileName.value = f.name
  source.value = 'file'
  configureWebInput({ kind: 'file', file: f })
}

// --- レベルメーター: 再生中だけ走り、入力 bus をタップして表示する。 ---
const level = ref(0)
let meterCtx: AudioContext | null = null
let raf = 0

async function startMeter(): Promise<void> {
  if (meterCtx) return
  meterCtx = new AudioContext()
  await meterCtx.resume()
  const stream = await createDawInput()
  const src = meterCtx.createMediaStreamSource(stream)
  const analyser = meterCtx.createAnalyser()
  analyser.fftSize = 256
  src.connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)
  const tick = (): void => {
    analyser.getByteTimeDomainData(data)
    let peak = 0
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
    level.value = Math.min(1, peak / 128)
    raf = requestAnimationFrame(tick)
  }
  tick()
}

function stopMeter(): void {
  cancelAnimationFrame(raf)
  void meterCtx?.close()
  meterCtx = null
  level.value = 0
}

watch(
  () => transport.state.isPlaying,
  (playing) => {
    if (playing) void startMeter()
    else stopMeter()
  },
)

onUnmounted(stopMeter)
</script>

<template>
  <Teleport to="body">
    <div class="dock">
      <Transition name="sheet">
        <section v-if="open" class="sheet">
          <div class="head">
            <span class="dot"></span>
            <span class="title">DAW simulator</span>
            <span class="sub">web runtime</span>
          </div>

          <!-- 一次操作: Play/Stop + tempo -->
          <div class="transport">
            <button class="play" :class="{ on: transport.state.isPlaying }" @click="togglePlay">
              <span class="glyph">{{ transport.state.isPlaying ? '◼' : '▶' }}</span>
              {{ transport.state.isPlaying ? 'Stop' : 'Play' }}
            </button>
            <label class="tempo">
              <input
                type="range"
                min="40"
                max="220"
                :value="transport.state.tempo"
                @input="onTempo"
              />
              <span class="mono">{{ transport.state.tempo }} BPM</span>
            </label>
          </div>

          <!-- 入力ソース -->
          <div class="row">
            <span class="row-label">Input</span>
            <div class="seg">
              <button :class="{ on: source === 'tone' }" @click="selectTone">test tone</button>
              <button :class="{ on: source === 'file' }" @click="pickFile">
                {{ source === 'file' && fileName ? fileName : 'audio file…' }}
              </button>
            </div>
            <input ref="fileEl" type="file" accept="audio/*" hidden @change="onFile" />
          </div>

          <!-- 入力レベル -->
          <div class="row">
            <span class="row-label">Level</span>
            <div class="meter">
              <div class="meter-fill" :style="{ width: level * 100 + '%' }"></div>
            </div>
          </div>

          <!-- MIDI -->
          <div class="row col">
            <span class="row-label">MIDI</span>
            <VirtualKeyboard />
          </div>
        </section>
      </Transition>

      <button
        class="fab"
        :class="{ open }"
        :aria-label="open ? 'close DAW simulator' : 'open DAW simulator'"
        @click="open = !open"
      >
        <svg
          v-if="!open"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <circle cx="9" cy="7" r="2.3" fill="var(--surface)" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <circle cx="15" cy="12" r="2.3" fill="var(--surface)" />
          <line x1="4" y1="17" x2="20" y2="17" />
          <circle cx="11" cy="17" r="2.3" fill="var(--surface)" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.dock {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.85rem;
}

.fab {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  backdrop-filter: blur(12px);
  border: 1px solid var(--line);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition:
    transform 0.12s ease,
    border-color 0.12s ease;
}

.fab:hover {
  transform: translateY(-1px);
}

.fab.open {
  color: var(--fg);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}

.sheet {
  width: min(440px, calc(100vw - 3rem));
  padding: 1.25rem 1.35rem;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(16px);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.sheet-enter-active,
.sheet-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.99);
}

.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}
.title {
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}
.sub {
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

/* primary transport */
.transport {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.play {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  color: #0d0d0d;
  background: var(--accent);
  border: none;
  border-radius: 10px;
  padding: 0.6rem 1.3rem;
  cursor: pointer;
  transition: filter 0.12s ease;
}
.play:hover {
  filter: brightness(1.08);
}
.play.on {
  color: var(--fg);
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
}
.play .glyph {
  font-size: 0.8rem;
  line-height: 1;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.row.col {
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
}
.row-label {
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  min-width: 3.4rem;
}

.mono {
  font-variant-numeric: tabular-nums;
}

.tempo {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.76rem;
  color: var(--muted);
}

.seg {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 9px;
  overflow: hidden;
  flex: 1;
}
.seg button {
  font: inherit;
  font-size: 0.78rem;
  color: var(--muted);
  background: transparent;
  border: none;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.seg button.on {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.meter {
  flex: 1;
  height: 7px;
  background: var(--line);
  border-radius: 999px;
  overflow: hidden;
}
.meter-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.06s linear;
}
</style>
