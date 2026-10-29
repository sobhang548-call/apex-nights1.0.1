// Fully synthesized audio — engine, tyres, wind and UI. No assets needed.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volume = 0.7;
    this.noiseBuffer = null;
    this.nodes = null;
  }

  init() {
    if (this.ready) {
      this.ctx?.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 700;
    engineFilter.Q.value = 1.1;
    engineFilter.connect(engineGain);
    engineGain.connect(this.master);

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 60;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 30;
    oscB.detune.value = 4;
    const oscSub = ctx.createOscillator();
    oscSub.type = 'sine';
    oscSub.frequency.value = 24;
    const gA = ctx.createGain(); gA.gain.value = 0.5;
    const gB = ctx.createGain(); gB.gain.value = 0.22;
    const gS = ctx.createGain(); gS.gain.value = 0.5;
    oscA.connect(gA); oscB.connect(gB); oscSub.connect(gS);
    gA.connect(engineFilter); gB.connect(engineFilter); gS.connect(engineFilter);

    // Intake / turbo whoosh
    const intake = ctx.createBufferSource();
    intake.buffer = this.noiseBuffer;
    intake.loop = true;
    const intakeFilter = ctx.createBiquadFilter();
    intakeFilter.type = 'bandpass';
    intakeFilter.frequency.value = 850;
    intakeFilter.Q.value = 0.7;
    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0;
    intake.connect(intakeFilter); intakeFilter.connect(intakeGain); intakeGain.connect(this.master);

    // Tyre squeal
    const tyre = ctx.createBufferSource();
    tyre.buffer = this.noiseBuffer;
    tyre.loop = true;
    const tyreFilter = ctx.createBiquadFilter();
    tyreFilter.type = 'bandpass';
    tyreFilter.frequency.value = 1850;
    tyreFilter.Q.value = 7;
    const tyreGain = ctx.createGain();
    tyreGain.gain.value = 0;
    tyre.connect(tyreFilter); tyreFilter.connect(tyreGain); tyreGain.connect(this.master);

    // Wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 520;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(this.master);

    // Nitrous
    const nos = ctx.createBufferSource();
    nos.buffer = this.noiseBuffer;
    nos.loop = true;
    const nosFilter = ctx.createBiquadFilter();
    nosFilter.type = 'highpass';
    nosFilter.frequency.value = 2600;
    const nosGain = ctx.createGain();
    nosGain.gain.value = 0;
    nos.connect(nosFilter); nosFilter.connect(nosGain); nosGain.connect(this.master);

    oscA.start(); oscB.start(); oscSub.start();
    intake.start(); tyre.start(); wind.start(); nos.start();

    this.nodes = {
      oscA, oscB, oscSub, engineFilter, engineGain, gS,
      intakeFilter, intakeGain, tyreFilter, tyreGain, windFilter, windGain, nosGain,
    };
    this.ready = true;
    this.ctx.resume?.();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  update(dt, state) {
    if (!this.ready || !this.nodes) return;
    const t = this.ctx.currentTime;
    const n = this.nodes;
    const {
      rpm = 900, throttle = 0, speed = 0, slip = 0, boosting = false,
      gear = 1, active = true,
    } = state;
    const rev = Math.min(1, rpm / 7600);
    const f = 42 + rev * 158 + (gear - 1) * 2;
    n.oscA.frequency.setTargetAtTime(f, t, 0.03);
    n.oscB.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    n.oscSub.frequency.setTargetAtTime(f * 0.25, t, 0.03);
    n.engineFilter.frequency.setTargetAtTime(280 + rev * 1500 + throttle * 900, t, 0.04);
    const load = active ? 0.30 + throttle * 0.7 : 0.18;
    n.engineGain.gain.setTargetAtTime(0.115 * load * (0.4 + rev * 0.6), t, 0.06);
    n.intakeGain.gain.setTargetAtTime(0.02 + throttle * 0.055 * (0.3 + rev), t, 0.08);
    n.intakeFilter.frequency.setTargetAtTime(700 + rev * 1600, t, 0.08);

    const sq = Math.min(1, slip);
    n.tyreGain.gain.setTargetAtTime(active ? sq * 0.115 : 0, t, 0.05);
    n.tyreFilter.frequency.setTargetAtTime(1500 + sq * 900, t, 0.1);

    const windAmt = Math.min(1, speed / 90);
    n.windGain.gain.setTargetAtTime(active ? Math.pow(windAmt, 2) * 0.13 : 0, t, 0.1);
    n.windFilter.frequency.setTargetAtTime(380 + windAmt * 900, t, 0.1);

    n.nosGain.gain.setTargetAtTime(boosting ? 0.06 : 0, t, 0.08);
  }

  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  _tone(freq, dur, type = 'sine', gain = 0.08, when = 0, slide = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this._now() + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  _noiseBurst(dur, freq, q, gain, type = 'bandpass', when = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this._now() + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  ui() { this._tone(620, 0.05, 'square', 0.025); }
  hover() { this._tone(400, 0.03, 'sine', 0.012); }
  shift() { this._noiseBurst(0.08, 3200, 1.2, 0.035, 'bandpass'); this._tone(120, 0.06, 'square', 0.02); }
  pop() {
    this._noiseBurst(0.06, 900, 0.8, 0.07, 'bandpass');
    this._tone(90, 0.1, 'sawtooth', 0.05, 0, -40);
  }
  crash(intensity = 1) {
    const v = Math.min(1.4, intensity);
    this._noiseBurst(0.28, 480, 0.6, 0.22 * v, 'lowpass');
    this._noiseBurst(0.1, 2600, 0.8, 0.1 * v, 'highpass');
    this._tone(58, 0.3, 'sine', 0.18 * v, 0, -24);
  }
  cash() {
    this._tone(880, 0.09, 'triangle', 0.05, 0.0);
    this._tone(1174, 0.09, 'triangle', 0.05, 0.07);
    this._tone(1568, 0.16, 'triangle', 0.045, 0.14);
  }
  buy() {
    this._tone(523, 0.08, 'triangle', 0.05, 0);
    this._tone(784, 0.14, 'triangle', 0.05, 0.08);
  }
  unlock() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.05, i * 0.11));
  }
  countdown(final = false) {
    this._tone(final ? 1320 : 660, final ? 0.5 : 0.14, 'square', 0.06);
    if (final) this._noiseBurst(0.5, 1600, 0.6, 0.06, 'bandpass');
  }
  boostStart() {
    this._noiseBurst(0.55, 3800, 0.8, 0.1, 'highpass');
    this._tone(180, 0.4, 'sawtooth', 0.03, 0, 120);
  }
  finish() {
    [784, 988, 1175, 1568].forEach((f, i) => this._tone(f, 0.4, 'triangle', 0.055, i * 0.13));
  }
  deny() { this._tone(160, 0.16, 'sawtooth', 0.04); }
  traitUnlock() { this._tone(660, 0.1, 'sine', 0.03); this._tone(990, 0.2, 'sine', 0.03, 0.1); }
}
