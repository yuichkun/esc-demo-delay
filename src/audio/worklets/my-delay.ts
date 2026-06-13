// DSP worklet — runs on the audio rendering thread, registered as 'my-delay'.
//
// Globals (AudioWorkletProcessor, registerProcessor) come from @types/audioworklet
// via tsconfig.worklet.json. Bundled by Vite through `?worker&url` and loaded with
// addModule(). The class body below is a bare passthrough so the audio graph is
// wired end to end — replace it with your DSP.

class MyDelay extends AudioWorkletProcessor implements AudioWorkletProcessorImpl {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || !output) return true

    for (let ch = 0; ch < output.length; ch++) {
      const inCh = input[ch]
      const outCh = output[ch]
      if (inCh && outCh) outCh.set(inCh)
    }
    return true
  }
}

registerProcessor('my-delay', MyDelay)
