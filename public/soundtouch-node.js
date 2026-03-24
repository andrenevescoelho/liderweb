// SoundTouchNode — browser-only AudioWorkletNode wrapper
// Servido de /public para ser importado dinamicamente sem passar pelo webpack

const PROCESSOR_NAME = 'soundtouch-processor';

export class SoundTouchNode extends AudioWorkletNode {
  static async register(context, processorUrl) {
    await context.audioWorklet.addModule(processorUrl);
  }

  constructor(context) {
    super(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
  }

  get pitch() { return this.parameters.get('pitch'); }
  get tempo() { return this.parameters.get('tempo'); }
  get rate() { return this.parameters.get('rate'); }
  get pitchSemitones() { return this.parameters.get('pitchSemitones'); }
  get playbackRate() { return this.parameters.get('playbackRate'); }
}
