// WebAudio による効果音合成（外部音源ファイル不要）
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ambient = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    // 屋内の反響（短いディレイ）
    this.fx = ctx.createGain();
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.085;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    this.fx.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(this.master);
    this.fx.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  _out(pan = 0) {
    if (!this.ctx) return null;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.fx);
      return p;
    }
    return this.fx;
  }

  _noise(t, dur, { vol = 1, f0 = 4000, f1 = 300, type = 'lowpass', q = 0.7, pan = 0, attack = 0.002 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this._out(pan));
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  _tone(t, dur, { vol = 0.5, f0 = 200, f1 = 50, type = 'sine', pan = 0, attack = 0.003 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this._out(pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shot(kind, vol = 1, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.max(0.02, vol);
    if (kind === 'shotgun') {
      this._noise(t, 0.45, { vol: 1.0 * v, f0: 3500, f1: 200, pan });
      this._tone(t, 0.25, { vol: 0.9 * v, f0: 120, f1: 35, pan });
    } else if (kind === 'dmr') {
      this._noise(t, 0.35, { vol: 0.95 * v, f0: 7000, f1: 400, pan });
      this._tone(t, 0.2, { vol: 0.7 * v, f0: 160, f1: 40, pan });
    } else if (kind === 'smg') {
      this._noise(t, 0.14, { vol: 0.55 * v, f0: 5000, f1: 600, pan });
      this._tone(t, 0.08, { vol: 0.35 * v, f0: 180, f1: 60, pan });
    } else if (kind === 'enemy') {
      this._noise(t, 0.2, { vol: 0.6 * v, f0: 3000, f1: 300, pan });
      this._tone(t, 0.1, { vol: 0.35 * v, f0: 130, f1: 50, pan });
    } else {
      this._noise(t, 0.2, { vol: 0.75 * v, f0: 5200, f1: 400, pan });
      this._tone(t, 0.12, { vol: 0.5 * v, f0: 150, f1: 45, pan });
    }
  }

  explosion(vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 1.6, { vol: 1.0 * vol, f0: 2200, f1: 60, attack: 0.01 });
    this._tone(t, 1.0, { vol: 1.0 * vol, f0: 90, f1: 22 });
  }

  flashbang(ring) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.7, { vol: 1.0, f0: 8000, f1: 200 });
    this._tone(t, 0.3, { vol: 0.8, f0: 200, f1: 40 });
    if (ring) this._tone(t + 0.05, 3.2, { vol: 0.18, f0: 3400, f1: 3200, attack: 0.05 });
  }

  kick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.25, { vol: 0.9, f0: 110, f1: 40 });
    this._noise(t, 0.3, { vol: 0.6, f0: 1500, f1: 200 });
    this._noise(t + 0.04, 0.35, { vol: 0.3, f0: 3000, f1: 800, type: 'bandpass', q: 2 });
  }

  reload() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, { vol: 0.35, f0: 6000, f1: 3000, type: 'bandpass', q: 4 });
    this._noise(t + 0.35, 0.06, { vol: 0.4, f0: 4000, f1: 2000, type: 'bandpass', q: 4 });
  }

  reloadDone() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, { vol: 0.45, f0: 5000, f1: 2500, type: 'bandpass', q: 5 });
    this._noise(t + 0.08, 0.05, { vol: 0.45, f0: 3500, f1: 2000, type: 'bandpass', q: 5 });
  }

  empty() {
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, 0.04, { vol: 0.3, f0: 7000, f1: 5000, type: 'bandpass', q: 6 });
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.18, { vol: 0.5, f0: 90, f1: 40, type: 'triangle' });
    this._noise(t, 0.1, { vol: 0.3, f0: 1200, f1: 300 });
  }

  hit() {
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, 0.06, { vol: 0.25, f0: 2500, f1: 900, type: 'bandpass', q: 3 });
  }

  radio() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.08, { vol: 0.12, f0: 1400, f1: 1400, type: 'square' });
    this._noise(t + 0.08, 0.35, { vol: 0.08, f0: 2500, f1: 1800, type: 'bandpass', q: 3 });
  }

  cuff() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this._noise(t + i * 0.06, 0.04, { vol: 0.35, f0: 6000, f1: 4500, type: 'bandpass', q: 8 });
  }

  success() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784].forEach((f, i) => this._tone(t + i * 0.08, 0.35, { vol: 0.15, f0: f, f1: f, type: 'triangle' }));
  }

  ping() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.6, { vol: 0.2, f0: 1800, f1: 1700, type: 'sine' });
    this._tone(t + 0.25, 0.6, { vol: 0.12, f0: 1800, f1: 1700, type: 'sine' });
  }

  beep(urgent) {
    if (!this.ctx) return;
    this._tone(this.ctx.currentTime, 0.08, { vol: urgent ? 0.14 : 0.07, f0: 2200, f1: 2200, type: 'square' });
  }

  heartbeat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.15, { vol: 0.5, f0: 60, f1: 40 });
    this._tone(t + 0.22, 0.15, { vol: 0.35, f0: 55, f1: 38 });
  }

  shout() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.4, { vol: 0.25, f0: 900, f1: 700, type: 'bandpass', q: 1.5, attack: 0.03 });
  }

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2);
    out.connect(this.master);
    // 雨音
    const rain = ctx.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 900;
    const rg = ctx.createGain();
    rg.gain.value = 0.05;
    rain.connect(rf).connect(rg).connect(out);
    rain.start();
    // 低いドローン
    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 43;
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 140;
    const dg = ctx.createGain();
    dg.gain.value = 0.05;
    drone.connect(df).connect(dg).connect(out);
    drone.start();
    // 遠くのサイレン
    const siren = ctx.createOscillator();
    siren.type = 'sine';
    siren.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18;
    const lg = ctx.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(siren.frequency);
    const sg = ctx.createGain();
    sg.gain.value = 0.012;
    siren.connect(sg).connect(out);
    siren.start();
    lfo.start();
    this.ambient = { out, nodes: [rain, drone, siren, lfo] };
  }

  stopAmbient() {
    if (!this.ambient) return;
    const { out, nodes } = this.ambient;
    const t = this.ctx.currentTime;
    out.gain.setTargetAtTime(0.0001, t, 0.3);
    nodes.forEach((n) => n.stop(t + 1.5));
    this.ambient = null;
  }
}

export const audio = new AudioEngine();
