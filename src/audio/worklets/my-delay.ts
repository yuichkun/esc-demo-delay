// my-delay — a feedback delay line, registered as 'my-delay'.
//
// Runs on the audio rendering thread. Globals (AudioWorkletProcessor,
// registerProcessor) come from @types/audioworklet via tsconfig.worklet.json.
// Bundled by Vite through `?worker&url` and loaded with addModule().
//
// Per sample: read the signal `delayTime` seconds behind the write head, write
// `dry + feedback * delayed` back into the ring buffer (so echoes repeat and
// decay), and output `dry` crossfaded with the delayed signal by `mix`.

const BUFFER_SIZE = 128
const MAX_DELAY_SECONDS = 2

class MyDelay extends AudioWorkletProcessor implements AudioWorkletProcessorImpl {
  private bufferLength: number
  private buffer: Float32Array
  private writeIndex: number = 0

  constructor() {
    super()
    this.bufferLength = Math.ceil(sampleRate * MAX_DELAY_SECONDS)
    this.buffer = new Float32Array(this.bufferLength)
  }

  static get parameterDescriptors() {
    return [
      {
        name: 'delayTime', // ディレイ長（秒）
        defaultValue: 0.5,
        minValue: 0,
        maxValue: MAX_DELAY_SECONDS,
        automationRate: 'k-rate', // ブロック毎で十分
      },
      {
        name: 'feedback', // 書き戻し量（0..0.95、1未満で発散を防ぐ）
        defaultValue: 0,
        minValue: 0,
        maxValue: 0.95,
        automationRate: 'k-rate',
      },
      {
        name: 'mix', // dry / wet
        defaultValue: 0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'a-rate',
      },
    ]
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || !output) return true
    const leftInputCh = input[0]
    if (!leftInputCh) return true

    const mixParam = parameters.mix
    const feedback = parameters.feedback[0]
    // delayTime(秒) → サンプル数。bufferを超えないようにクランプ。
    const delaySamples = Math.min(
      this.bufferLength - 1,
      Math.max(0, Math.round(parameters.delayTime[0] * sampleRate)),
    )

    for (let i = 0; i < BUFFER_SIZE; i++) {
      const mix = mixParam.length > 1 ? mixParam[i] : mixParam[0]
      const drySignal = leftInputCh[i]

      // delaySamplesぶん後ろを読む
      const readIndex = (this.writeIndex - delaySamples + this.bufferLength) % this.bufferLength
      const wetSignal = this.buffer[readIndex]

      // dry + フィードバックした遅延信号を書き戻す（= エコーが減衰しながら繰り返す）
      this.buffer[this.writeIndex] = drySignal + wetSignal * feedback
      this.writeIndex = this.writeIndex >= this.bufferLength - 1 ? 0 : this.writeIndex + 1

      for (let ch_i = 0; ch_i < 2; ch_i++) {
        const outputChannel = output[ch_i]
        outputChannel[i] = drySignal * (1 - mix) + wetSignal * mix
      }
    }

    return true
  }
}
registerProcessor('my-delay', MyDelay)
