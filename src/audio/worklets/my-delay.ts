// my-delay — a simple feed-forward delay line, registered as 'my-delay'.
//
// Runs on the audio rendering thread. Globals (AudioWorkletProcessor,
// registerProcessor) come from @types/audioworklet via tsconfig.worklet.json.
// Bundled by Vite through `?worker&url` and loaded with addModule().
//
// Dry input is written into a ring buffer; for each sample the read position is
// `delayTime` seconds behind the write position, so reads yield the delayed signal.
// `mix` crossfades dry against the delayed signal.

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
        name: 'mix', // dry / wet
        defaultValue: 0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'a-rate',
      },
    ]
  }

  storeDrySignals(input: Float32Array<ArrayBufferLike>[]) {
    // inputをbufferに入れる
    const leftChannel = input[0]
    for (let i = 0; i < BUFFER_SIZE; i++) {
      this.buffer[this.writeIndex] = leftChannel[i]

      // bufferの最後の要素の時
      if (this.writeIndex >= this.bufferLength - 1) {
        this.writeIndex = 0
      } else {
        this.writeIndex++
      }
    }
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
    const delayParam = parameters.delayTime
    // delayTime(秒) → サンプル数。bufferを超えないようにクランプ。
    const delaySamples = Math.min(
      this.bufferLength - 1,
      Math.max(0, Math.round(delayParam[0] * sampleRate)),
    )

    // storeDrySignalsがwriteIndexを1ブロック進めるので、読み出しの基準として
    // ブロック先頭のwriteIndexを控えておく。
    const writeStart = this.writeIndex
    this.storeDrySignals(input)

    for (let i = 0; i < BUFFER_SIZE; i++) {
      const mix = mixParam.length > 1 ? mixParam[i] : mixParam[0]

      const drySignal = leftInputCh[i]
      const readIndex = (writeStart + i - delaySamples + this.bufferLength) % this.bufferLength
      const wetSignal = this.buffer[readIndex]
      for (let ch_i = 0; ch_i < 2; ch_i++) {
        const outputChannel = output[ch_i]
        outputChannel[i] = drySignal * (1 - mix) + wetSignal * mix
      }
    }

    return true
  }
}
registerProcessor('my-delay', MyDelay)
