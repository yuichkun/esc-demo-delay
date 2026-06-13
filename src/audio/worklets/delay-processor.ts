/**
 * AudioWorklet processor template — runs on the audio rendering thread.
 *
 * Runs inside the `AudioWorkletGlobalScope`, so its globals
 * (`AudioWorkletProcessor`, `registerProcessor`) come from `@types/audioworklet`
 * via tsconfig.worklet.json, not the DOM lib.
 *
 * Currently a passthrough. Put the actual DSP here.
 */
const PROCESSOR_NAME = 'delay-processor'

class DelayProcessor extends AudioWorkletProcessor implements AudioWorkletProcessorImpl {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]
    if (input && output) {
      for (let ch = 0; ch < output.length; ch++) {
        const inChannel = input[ch]
        if (inChannel) output[ch].set(inChannel)
      }
    }
    return true
  }
}

registerProcessor(PROCESSOR_NAME, DelayProcessor)
