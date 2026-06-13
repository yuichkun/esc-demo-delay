// DSP worklet — runs on the audio rendering thread, registered as 'my-delay'.
//
// Globals (AudioWorkletProcessor, registerProcessor) come from @types/audioworklet
// via tsconfig.worklet.json. Bundled by Vite through `?worker&url` and loaded with
// addModule(). The class body below is a bare passthrough so the audio graph is
// wired end to end — replace it with your DSP.

const BUFFER_SIZE = 128

class MyDelay extends AudioWorkletProcessor implements AudioWorkletProcessorImpl {
  private delayTimeInSamples: number = 48000 / 2
  private bufferLength: number = 48000 * 2
  private buffer: Float32Array
  private writeIndex: number = 0
  private readIndex: number = 0
  constructor() {
    super()
    this.buffer = new Float32Array(this.bufferLength)
  }

  static get parameterDescriptors() {
    return [
      {
        name: 'mix', // パラメータ名（必須）
        defaultValue: 0, // デフォルト値
        minValue: 0.0, // 最小値
        maxValue: 1.0, // 最大値
        automationRate: 'a-rate', // 'a-rate'（サンプル毎）or 'k-rate'（ブロック毎）
      },
    ]
  }

  storeDrySignals(input: Float32Array<ArrayBufferLike>[]) {
    // inputをbufferに入れる

    const leftChannel = input[0]
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const sampleValue = leftChannel[i]

      this.buffer[this.writeIndex] = sampleValue

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
    const mixParam = parameters.mix

    this.storeDrySignals(input)

    for (let i = 0; i < BUFFER_SIZE; i++) {
      const mix = mixParam.length > 1 ? mixParam[i] : mixParam[0]

      const drySignal = leftInputCh[i]
      const wetSignal = Math.random()
      for (let ch_i = 0; ch_i < 2; ch_i++) {
        const outputChannel = output[ch_i]
        outputChannel[i] = drySignal * (1 - mix) + wetSignal * mix
      }
    }

    return true
  }

  readBuffer(): number {
    const value = this.buffer[this.readIndex]
    // bufferの最後の要素の時
    if (this.readIndex >= this.bufferLength - 1) {
      this.readIndex = 0
    } else {
      this.readIndex++
    }

    return value
  }
}
registerProcessor('my-delay', MyDelay)
