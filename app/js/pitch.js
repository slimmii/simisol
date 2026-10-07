// Microfoon-toonhoogteherkenning. Het rekenwerk zit in detector-worklet.js (audiothread).

export class PitchDetector {
  constructor(ctx) {
    this.ctx = ctx;
    this.onFrame = null; // ({time, freq, midi, cents, rms, level})
    this.onNote = null; // ({time, midi, attack, strength})
    this.running = false;
    this.echoCancellation = false;
    this._sensitivity = 0.5; // 0..1
    this._latency = 0.06; // seconden die we van een aanslag aftrekken
  }

  get sensitivity() { return this._sensitivity; }
  set sensitivity(v) { this._sensitivity = v; this.node?.port.postMessage({ sensitivity: v }); }
  get latency() { return this._latency; }
  set latency(v) { this._latency = v; this.node?.port.postMessage({ latency: v }); }

  // Klinkende midi-noten die nu (of zo meteen) verwacht worden; helpt de detector als er nog snaren naklinken.
  setExpect(midis) {
    const key = midis.join(',');
    if (key === this._expectKey) return;
    this._expectKey = key;
    this.node?.port.postMessage({ expect: midis });
  }

  async start() {
    if (this.running) return;
    await this.ctx.audioWorklet.addModule(new URL('./detector-worklet.js', import.meta.url));
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: this.echoCancellation, noiseSuppression: false, autoGainControl: false },
    });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'simisol-detector', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    this.node.port.postMessage({ sensitivity: this._sensitivity, latency: this._latency });
    this.node.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'frame') this.onFrame?.(m);
      else if (m.type === 'note') this.onNote?.(m);
    };
    // Een stille uitgang houdt de worklet actief.
    this.mute = this.ctx.createGain();
    this.mute.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(this.mute).connect(this.ctx.destination);
    this.running = true;
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.node?.disconnect();
    this.mute?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.node = null;
  }
}
