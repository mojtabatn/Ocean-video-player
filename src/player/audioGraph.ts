// Web Audio chain behind the <video>: delay → 10-band EQ → compressor (normalize) → gain (boost up to 200%).

export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Voice / Dialogue': [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
  Movie: [3, 2, 1, 0, -1, 0, 1, 2, 3, 3],
  Music: [3, 2, 0, -1, -1, 0, 1, 2, 3, 3],
  'Treble boost': [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  'Night mode': [-4, -3, -1, 1, 3, 3, 2, 0, -2, -4],
};

export class AudioGraph {
  private ctx: AudioContext;
  private delay: DelayNode;
  private eq: BiquadFilterNode[];
  private compressor: DynamicsCompressorNode;
  private makeup: GainNode;
  private gain: GainNode;
  private normalizing = false;

  constructor(video: HTMLVideoElement) {
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    const source = this.ctx.createMediaElementSource(video);
    this.delay = this.ctx.createDelay(10);
    this.eq = EQ_BANDS.map((f, i) => {
      const b = this.ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.1;
      return b;
    });
    this.compressor = this.ctx.createDynamicsCompressor();
    this.makeup = this.ctx.createGain();
    this.gain = this.ctx.createGain();

    source.connect(this.delay);
    let node: AudioNode = this.delay;
    for (const b of this.eq) {
      node.connect(b);
      node = b;
    }
    node.connect(this.compressor);
    this.compressor.connect(this.makeup);
    this.makeup.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.setNormalize(false);

    // Autoplay policy: resume on first play.
    video.addEventListener('play', () => this.ctx.state === 'suspended' && this.ctx.resume());
  }

  /** 0..2 (values above 1 boost beyond the source level). */
  setVolume(v: number) {
    this.gain.gain.setTargetAtTime(Math.max(0, Math.min(2, v)), this.ctx.currentTime, 0.02);
  }

  /** Positive seconds only: delays audio relative to video. */
  setDelay(seconds: number) {
    this.delay.delayTime.value = Math.max(0, Math.min(10, seconds));
  }

  setEq(gains: number[]) {
    gains.forEach((g, i) => this.eq[i] && (this.eq[i].gain.value = g));
  }

  setNormalize(on: boolean) {
    this.normalizing = on;
    const c = this.compressor;
    if (on) {
      c.threshold.value = -28;
      c.knee.value = 20;
      c.ratio.value = 6;
      c.attack.value = 0.005;
      c.release.value = 0.3;
      this.makeup.gain.value = 1.9;
    } else {
      // Transparent: threshold at 0 dB with ratio 1 passes audio through untouched.
      c.threshold.value = 0;
      c.knee.value = 0;
      c.ratio.value = 1;
      this.makeup.gain.value = 1;
    }
  }

  get isNormalizing() {
    return this.normalizing;
  }
}
