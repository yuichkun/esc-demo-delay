// useMidi() — DAW MIDI を runtime 抽象で供給する。
//   VST runtime: broker が書く SuaraDawMidi.buffer (= SAB ring) を wrap。
//   web runtime: SDK が同じ layout の SharedArrayBuffer を自前確保 (= helper UI が書く)。
// どちらも consumer (= worklet / GUI) には同一の sab / reactive interface を見せる。

import { reactive } from 'vue'
import { runtime } from './runtime'
import { MIDI_RING_BYTES, RING_CAPACITY, SLOT_CAPACITY, drainMidi, writeMidiEvent } from './ring'

export interface MidiNoteEvent {
  note: number
  velocity: number // 0..1
  sampleOffset: number
}

export type MidiEventName = 'noteon' | 'noteoff'
type Listener = (e: MidiNoteEvent) => void

export interface MidiHandle {
  /** worklet に processorOptions で渡す MIDI ring。両 runtime 同一 layout。 */
  readonly sab: SharedArrayBuffer
  /** 現在押されている note の reactive Set (= GUI 鍵盤ハイライト等)。 */
  readonly activeNotes: Set<number>
  on(name: MidiEventName, cb: Listener): void
  off(name: MidiEventName, cb: Listener): void
  /** web runtime のみ: helper UI が virtual note を流し込む (= VST では broker が供給、undefined)。 */
  pushNote?: (type: 0 | 1, note: number, velocity: number, sampleOffset?: number) => void
}

let handle: MidiHandle | null = null

export function useMidi(): MidiHandle {
  if (!handle) handle = create()
  return handle
}

function create(): MidiHandle {
  const { sab, keepAlive } = acquireSab()
  void keepAlive // VST: SuaraDawMidi object を GC させない
  const view = new Int32Array(sab)

  const activeNotes = reactive(new Set<number>())
  const onListeners: Listener[] = []
  const offListeners: Listener[] = []
  let tail = 0

  function poll(): void {
    tail = drainMidi(view, tail, (type, pitch, velMilli, sampleOffset) => {
      const e: MidiNoteEvent = { note: pitch, velocity: velMilli / 1000, sampleOffset }
      if (type === 0) {
        activeNotes.add(pitch)
        for (const cb of onListeners) cb(e)
      } else {
        activeNotes.delete(pitch)
        for (const cb of offListeners) cb(e)
      }
    })
    requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)

  const h: MidiHandle = {
    sab,
    activeNotes,
    on(name, cb) {
      ;(name === 'noteon' ? onListeners : offListeners).push(cb)
    },
    off(name, cb) {
      const list = name === 'noteon' ? onListeners : offListeners
      const i = list.indexOf(cb)
      if (i >= 0) list.splice(i, 1)
    },
  }

  if (runtime.isWeb) {
    h.pushNote = (type, note, velocity, sampleOffset = 0) => {
      writeMidiEvent(view, type, note, Math.round(velocity * 1000), sampleOffset)
    }
  }
  return h
}

function acquireSab(): { sab: SharedArrayBuffer; keepAlive: unknown } {
  if (runtime.isVst) {
    const midi = new SuaraDawMidi()
    // IDL 型は ArrayBuffer ([AllowShared])、runtime は SharedArrayBuffer。
    return { sab: midi.buffer as unknown as SharedArrayBuffer, keepAlive: midi }
  }
  if (!self.crossOriginIsolated) {
    throw new Error(
      '[suara] web runtime needs crossOriginIsolated (COOP/COEP) for SharedArrayBuffer',
    )
  }
  const sab = new SharedArrayBuffer(MIDI_RING_BYTES)
  new Int32Array(sab)[SLOT_CAPACITY] = RING_CAPACITY
  return { sab, keepAlive: null }
}
