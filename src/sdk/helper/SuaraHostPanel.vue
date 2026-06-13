<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { configureWebInput, createDawInput, useTransport } from '../index'
import VirtualKeyboard from './VirtualKeyboard.vue'

// web runtime だけ出る「DAW 代役」。普段は隠れていて floating トグルで開閉 (= 邪魔しない)。
// MIDI (= virtual 鍵盤) / transport (= play・stop・tempo) / audio input (= test tone or file) を供給。
// VST では DAW が供給するので mount されない。

const open = ref(false)
const transport = useTransport()

function togglePlay(): void {
  transport.setPlaying?.(!transport.state.isPlaying)
}
function onTempo(e: Event): void {
  transport.setTempo?.(Number((e.target as HTMLInputElement).value))
}

// audio input = createDawInput() が web で MediaStream を返すことの実証 + level meter。
type Src = 'tone' | 'file'
const inputSrc = ref<Src>('tone')
const fileName = ref('')
const inputOn = ref(false)
const inputLevel = ref(0)
const fileEl = ref<HTMLInputElement | null>(null)

let currentFile: File | null = null
let stream: MediaStream | null = null
let meterCtx: AudioContext | null = null
let raf = 0

async function startInput(): Promise<void> {
  stream = await createDawInput()
  meterCtx = new AudioContext()
  await meterCtx.resume()
  const src = meterCtx.createMediaStreamSource(stream)
  const analyser = meterCtx.createAnalyser()
  analyser.fftSize = 256
  src.connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)
  const tick = (): void => {
    analyser.getByteTimeDomainData(data)
    let peak = 0
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
    inputLevel.value = Math.min(1, peak / 128)
    raf = requestAnimationFrame(tick)
  }
  tick()
  inputOn.value = true
}

function stopInput(): void {
  cancelAnimationFrame(raf)
  stream?.getTracks().forEach((t) => t.stop())
  void meterCtx?.close()
  stream = null
  meterCtx = null
  inputLevel.value = 0
  inputOn.value = false
}

async function restartIfOn(): Promise<void> {
  if (inputOn.value) {
    stopInput()
    await startInput()
  }
}

function selectTone(): void {
  inputSrc.value = 'tone'
  configureWebInput({ kind: 'tone' })
  void restartIfOn()
}
function selectFile(): void {
  fileEl.value?.click()
}
function onFile(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  currentFile = f
  fileName.value = f.name
  inputSrc.value = 'file'
  configureWebInput({ kind: 'file', file: f })
  void restartIfOn()
}
function toggleInput(): void {
  if (inputOn.value) stopInput()
  else void startInput()
}

onUnmounted(stopInput)
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

          <div class="row">
            <span class="row-label">MIDI</span>
            <VirtualKeyboard />
          </div>

          <div class="row inline">
            <span class="row-label">Transport</span>
            <button class="ctl" :class="{ on: transport.state.isPlaying }" @click="togglePlay">
              {{ transport.state.isPlaying ? 'stop' : 'play' }}
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

          <div class="row inline">
            <span class="row-label">Audio in</span>
            <div class="seg">
              <button :class="{ on: inputSrc === 'tone' }" @click="selectTone">tone</button>
              <button :class="{ on: inputSrc === 'file' }" @click="selectFile">file</button>
            </div>
            <span v-if="inputSrc === 'file' && fileName" class="fname mono">{{ fileName }}</span>
            <button class="ctl power" :class="{ on: inputOn }" @click="toggleInput">
              {{ inputOn ? 'on' : 'off' }}
            </button>
            <div class="meter">
              <div class="meter-fill" :style="{ width: inputLevel * 100 + '%' }"></div>
            </div>
            <input ref="fileEl" type="file" accept="audio/*" hidden @change="onFile" />
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
  gap: 1rem;
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

.row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.row.inline {
  flex-direction: row;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.row-label {
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  min-width: 4.2rem;
}

.mono {
  font-variant-numeric: tabular-nums;
}

.ctl {
  font: inherit;
  font-size: 0.78rem;
  color: var(--fg);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 0.28rem 0.7rem;
  cursor: pointer;
}
.ctl.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.power {
  min-width: 2.6rem;
}

.seg {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.seg button {
  font: inherit;
  font-size: 0.76rem;
  color: var(--muted);
  background: transparent;
  border: none;
  padding: 0.28rem 0.7rem;
  cursor: pointer;
}
.seg button.on {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.fname {
  font-size: 0.72rem;
  color: var(--muted);
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tempo {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.76rem;
  color: var(--muted);
}

.meter {
  flex: 1;
  min-width: 60px;
  height: 6px;
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
