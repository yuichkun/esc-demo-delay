// createDawInput() — DAW audio input を runtime 抽象で供給する。
//   VST runtime: SuaraDawInput(busIndex) (= 段3b 経路、DAW main / sidechain(kAux)
//                bus → MediaStreamTrack)。
//   web runtime: DAW が無いので helper が選んだ仮想源から MediaStream を合成。
//                main = test tone / file、sidechain = 内蔵リズムパルス (= ducking が
//                聞こえるよう default で鳴る key 信号)。
// どちらも userland は `ctx.createMediaStreamSource(stream)` で同じに繋ぐ。
//
// web の肝: bus ごとに MediaStreamDestination を 1 個だけ持ち続け、source だけを
// configureWebInput で live に差し替える (= VST の DAW bus と同じく、consumer は
// 一度繋いだら繋ぎ直し不要で、流れる音だけが変わる)。

import { runtime } from './runtime'

export type Bus = 'main' | 'sidechain'

export interface DawInputOptions {
  bus?: Bus
}

export type WebInputSource = { kind: 'tone' } | { kind: 'pulse' } | { kind: 'file'; file: File }

// per-bus web 仮想源。main = test tone (default)、sidechain = リズムパルス (= ducking
// を自己完結で聞かせる key 信号)。
const webSources: Record<Bus, WebInputSource> = {
  main: { kind: 'tone' },
  sidechain: { kind: 'pulse' },
}

// web 用の共有 AudioContext。bus ごとに new すると context が乱立して browser 上限に
// 当たるため 1 個を lazy に共有する (= VST 経路では使わない)。
let webCtx: AudioContext | null = null
function getWebCtx(): AudioContext {
  if (!webCtx) webCtx = new AudioContext()
  void webCtx.resume()
  return webCtx
}

// bus ごとの永続 destination と、今そこに繋がっている source ノード群。stream は
// destination 由来で安定し、source の差し替えだけを wireSource が担う。
interface BusGraph {
  dest: MediaStreamAudioDestinationNode
  nodes: AudioNode[]
}
const busGraphs: Partial<Record<Bus, BusGraph>> = {}
// 差し替え世代。file は decode が async なので、追い越された古い build を捨てる。
const busGen: Partial<Record<Bus, number>> = {}

// 内蔵リズムパルス = square tone を ~2.2Hz (≈132 BPM) の square LFO で gate した
// 「四つ打ち」風 key 信号。sidechain ducking が耳で一目瞭然になる。
function buildPulse(ctx: AudioContext, dest: AudioNode): AudioNode[] {
  const tone = ctx.createOscillator()
  tone.type = 'square'
  tone.frequency.value = 70
  const gate = ctx.createGain()
  gate.gain.value = 0
  const lfo = ctx.createOscillator()
  lfo.type = 'square'
  lfo.frequency.value = 2.2
  const lfoAmt = ctx.createGain()
  lfoAmt.gain.value = 0.5
  const bias = ctx.createConstantSource()
  bias.offset.value = 0.5 // square -1..1 → gate 0..1
  lfo.connect(lfoAmt).connect(gate.gain)
  bias.connect(gate.gain)
  tone.connect(gate).connect(dest)
  tone.start()
  lfo.start()
  bias.start()
  return [tone, gate, lfo, lfoAmt, bias]
}

// 古い source を destination から外して止める。
function teardownNodes(g: BusGraph): void {
  for (const n of g.nodes) {
    try {
      n.disconnect()
    } catch {
      // already disconnected
    }
    const stoppable = n as { stop?: () => void }
    if (typeof stoppable.stop === 'function') {
      try {
        stoppable.stop()
      } catch {
        // never started / already stopped
      }
    }
  }
  g.nodes = []
}

// bus の永続 destination に source を繋ぎ直す。destination 自体は触らないので、
// 既に createDawInput() で受け取った stream はそのまま生き続け、中身だけ変わる。
async function wireSource(g: BusGraph, src: WebInputSource, bus: Bus): Promise<void> {
  const ctx = getWebCtx()
  const token = (busGen[bus] = (busGen[bus] ?? 0) + 1)
  teardownNodes(g)

  if (src.kind === 'file') {
    const bytes = await src.file.arrayBuffer()
    const buffer = await ctx.decodeAudioData(bytes)
    if (busGen[bus] !== token) return // 新しい source に追い越された
    const node = ctx.createBufferSource()
    node.buffer = buffer
    node.loop = true
    node.connect(g.dest)
    node.start()
    g.nodes = [node]
  } else if (src.kind === 'pulse') {
    g.nodes = buildPulse(ctx, g.dest)
  } else {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 110
    osc.connect(g.dest)
    osc.start()
    g.nodes = [osc]
  }
}

function ensureBus(bus: Bus): BusGraph {
  let g = busGraphs[bus]
  if (!g) {
    g = { dest: getWebCtx().createMediaStreamDestination(), nodes: [] }
    busGraphs[bus] = g
    void wireSource(g, webSources[bus], bus)
  }
  return g
}

/** web runtime のみ: helper UI が指定 bus の仮想 input 源を live に差し替える。 */
export function configureWebInput(source: WebInputSource, bus: Bus = 'main'): void {
  webSources[bus] = source
  const g = busGraphs[bus]
  // 既存 consumer の stream は維持したまま、destination に流す source だけ差し替える。
  if (g) void wireSource(g, source, bus)
}

export async function createDawInput(opts: DawInputOptions = {}): Promise<MediaStream> {
  const bus: Bus = opts.bus ?? 'main'

  if (runtime.isVst) {
    // 段3b phase3: SuaraDawInput(busIndex) — 0 = main, 1 = sidechain (kAux)。
    const busIndex = bus === 'sidechain' ? 1 : 0
    return new MediaStream([new SuaraDawInput(busIndex)])
  }

  // 永続 destination の track を clone して渡す。consumer ごとに独立した track なので
  // 片方が track.stop() しても源と他の consumer は生きたまま、source 差し替えは全 clone に
  // live で伝わる。
  const g = ensureBus(bus)
  return new MediaStream(g.dest.stream.getAudioTracks().map((t) => t.clone()))
}
