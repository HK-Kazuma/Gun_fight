// タイトル画面の BGM（WebAudio でその場で合成。音声ファイル不要）
//
// テーマ：「出撃前の精鋭部隊 ― 静寂の中に、獣のまなざし」
// D マイナー / 72 BPM / 32 小節ループ（約 1 分 47 秒）
//
//   1〜8 小節   「沈黙」  低いドローン、遠い鼓動、暗い弦のようなパッドだけ
//   9〜16 小節  「眼光」  ガラスのように冷たい旋律と、獣のうなり声のような低音（ブラーム）
//   17〜24 小節 「牙」    刻むハイハット、ベースの刻み、太鼓。抑えたまま緊張が張りつめる
//   25〜32 小節 「静寂へ」再び削ぎ落とし、吸い込むようなライザーで頭に戻る
//
// 和音進行（8 小節）：Dm | Dm | B♭ | B♭ | Gm | Gm | E♭ | A
// E♭（フリジアンの♭II）を D のドローンにぶつけて不穏さを出し、A で頭の Dm へ引き戻す。

const BPM = 72;
export const STEP = 60 / BPM / 4; // 16 分音符の長さ（秒）
const BAR = STEP * 16;
const BARS = 32;
export const LOOP_STEPS = BARS * 16;
export const LOOP_SECONDS = LOOP_STEPS * STEP;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS = {
  Dm: { root: 38, pad: [50, 53, 57, 62] },
  Bb: { root: 34, pad: [50, 53, 58, 62] },
  Gm: { root: 31, pad: [50, 55, 58, 62] },
  Eb: { root: 39, pad: [51, 55, 58, 63] },
  A: { root: 33, pad: [49, 52, 57, 61] },
};
// [開始小節, 長さ（小節）, 和音]
const PROG = [
  [0, 2, 'Dm'],
  [2, 2, 'Bb'],
  [4, 2, 'Gm'],
  [6, 1, 'Eb'],
  [7, 1, 'A'],
];
const chordAt = (bar) => {
  const b = bar % 8;
  return CHORDS[PROG.find(([s, l]) => b >= s && b < s + l)[2]];
};

// 旋律（8 小節）: [小節, 16 分の位置, MIDI ノート, 長さ（16 分）]
// 音数を絞り、間（ま）を多く残す。獲物を見据えるような、動かない視線。
const MOTIF = [
  [0, 0, 69, 14],
  [1, 8, 74, 8],
  [2, 0, 72, 4],
  [2, 4, 70, 10],
  [3, 2, 69, 14],
  [4, 0, 67, 6],
  [4, 8, 70, 8],
  [5, 8, 69, 8],
  [6, 0, 75, 10],
  [6, 12, 74, 4],
  [7, 0, 73, 16],
];

export class TitleMusic {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.dest = destination;
    this.timer = null;
    this.continuous = [];
  }

  // ---------- 準備 ----------
  _gain(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  _impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  // 楽器ごとの出口（ドライ／リバーブ／エコーの量を決める）
  _chan(dry, wet, echo = 0) {
    const g = this._gain(1);
    g.connect(this._gain(dry)).connect(this.out);
    g.connect(this._gain(wet)).connect(this.verb);
    if (echo) g.connect(this._gain(echo)).connect(this.echo);
    return g;
  }

  _build(fadeIn = 3) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, t0);
    this.out.gain.exponentialRampToValueAtTime(1, t0 + fadeIn);
    this.out.connect(this.dest);

    // 広い空間の残響
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(4);
    this.verb.connect(this._gain(0.8)).connect(this.out);

    // 旋律用のエコー（付点 8 分）
    this.echo = ctx.createDelay(2);
    this.echo.delayTime.value = STEP * 3;
    const elp = ctx.createBiquadFilter();
    elp.type = 'lowpass';
    elp.frequency.value = 2400;
    const efb = this._gain(0.4);
    this.echo.connect(elp).connect(efb).connect(this.echo);
    elp.connect(this._gain(0.45)).connect(this.out);
    elp.connect(this._gain(0.5)).connect(this.verb);

    this.ch = {
      pad: this._chan(0.85, 0.55),
      bell: this._chan(0.7, 0.8, 0.55),
      beat: this._chan(1, 0.3),
      bass: this._chan(0.9, 0.12),
      growl: this._chan(0.9, 0.45),
      tick: this._chan(0.7, 0.2),
      fx: this._chan(0.7, 0.9),
    };

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // うなり声用の歪み
    this.shaper = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      this.shaper[i] = Math.tanh(x * 3.2);
    }

    this._startContinuous();
  }

  // ---------- 鳴り続ける層：ドローンと風 ----------
  _startContinuous() {
    const ctx = this.ctx;
    const nodes = [];
    // D の低いドローン。フィルターがゆっくり呼吸する
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    lp.Q.value = 1.2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoAmt = this._gain(80);
    lfo.connect(lfoAmt).connect(lp.frequency);
    const dg = this._gain(0.07);
    lp.connect(dg).connect(this.out);
    dg.connect(this._gain(0.4)).connect(this.verb);
    [-6, 6].forEach((cents) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(38);
      o.detune.value = cents;
      o.connect(lp);
      nodes.push(o);
    });
    const sub = ctx.createOscillator();
    sub.frequency.value = mtof(26);
    sub.connect(this._gain(0.1)).connect(this.out);
    nodes.push(sub, lfo);

    // 夜風
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 520;
    wf.Q.value = 0.7;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.045;
    wl.connect(this._gain(260)).connect(wf.frequency);
    const wg = this._gain(0.022);
    wind.connect(wf).connect(wg).connect(this.out);
    wg.connect(this._gain(0.6)).connect(this.verb);
    nodes.push(wind, wl);

    nodes.forEach((n) => n.start());
    this.continuous = nodes;
  }

  // ---------- 楽器 ----------
  // 暗い弦のようなパッド
  _pad(t, notes, dur, vol, bright) {
    const ctx = this.ctx;
    const end = t + dur;
    notes.forEach((m, i) => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 0.8;
      f.frequency.setValueAtTime(280, t);
      f.frequency.linearRampToValueAtTime(bright ? 1500 : 850, t + Math.min(2, dur * 0.6));
      f.frequency.linearRampToValueAtTime(380, end + 1.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.026 * vol, t + 1.4);
      g.gain.setValueAtTime(0.026 * vol, end);
      g.gain.linearRampToValueAtTime(0.0001, end + 2);
      let node = g;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = (i / (notes.length - 1)) * 0.8 - 0.4;
        g.connect(p);
        node = p;
      }
      node.connect(this.ch.pad);
      f.connect(g);
      [-8, 7].forEach((c) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = c;
        o.connect(f);
        o.start(t);
        o.stop(end + 2.1);
      });
    });
  }

  // 遠くの鼓動
  _heart(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g).connect(this.ch.beat);
    o.start(t);
    o.stop(t + 0.4);
  }

  // 太鼓
  _drum(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(115, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.ch.beat);
    o.start(t);
    o.stop(t + 0.6);
    this._noiseHit(t, 0.28, { vol: 0.32 * v, f0: 900, f1: 120, type: 'lowpass', ch: this.ch.beat });
  }

  // 時を刻むハイハット
  _tick(t, v, pan) {
    this._noiseHit(t, 0.03, { vol: 0.06 * v, f0: 8000, f1: 7000, type: 'highpass', ch: this.ch.tick, pan });
  }

  _noiseHit(t, dur, { vol, f0, f1, type, q = 0.7, ch, pan = 0, attack = 0.002 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = src.connect(f).connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(ch);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  // ベースの刻み
  _pluck(t, m, v) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(900 * v + 250, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13 * v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    f.connect(g).connect(this.ch.bass);
    [
      ['sawtooth', 0],
      ['square', -1200],
    ].forEach(([type, det]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.32);
    });
  }

  // ガラスのように冷たいベル（FM 合成）
  _bell(t, m, dur, v, bright) {
    const ctx = this.ctx;
    const fr = mtof(m);
    const len = Math.min(dur + 1.6, 4.5);
    const car = ctx.createOscillator();
    car.frequency.value = fr;
    const mod = ctx.createOscillator();
    mod.frequency.value = fr * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(fr * (bright ? 2.4 : 1.5), t);
    mg.gain.exponentialRampToValueAtTime(fr * 0.15, t + 1.4);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    car.connect(g).connect(this.ch.bell);
    // 1 オクターブ下で胴鳴りを足す
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = fr / 2;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.03 * v, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.8);
    body.connect(bg).connect(this.ch.bell);
    [car, mod, body].forEach((o) => {
      o.start(t);
      o.stop(t + len + 0.05);
    });
  }

  // 獣のうなり（低く歪んだブラーム）
  _growl(t, m, v) {
    const ctx = this.ctx;
    const len = 3.4;
    const ws = ctx.createWaveShaper();
    ws.curve = this.shaper;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(90, t);
    f.frequency.exponentialRampToValueAtTime(1100, t + 0.7);
    f.frequency.exponentialRampToValueAtTime(160, t + len);
    f.Q.setValueAtTime(2, t);
    f.Q.linearRampToValueAtTime(7, t + 0.7);
    f.Q.linearRampToValueAtTime(1, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * v, t + 0.3);
    g.gain.setValueAtTime(0.11 * v, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    ws.connect(f).connect(g).connect(this.ch.growl);
    [
      ['sawtooth', m, 0],
      ['sawtooth', m, 14],
      ['square', m + 12, -9],
    ].forEach(([type, note, det]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(mtof(note), t);
      o.frequency.setValueAtTime(mtof(note), t + 2.2);
      o.frequency.exponentialRampToValueAtTime(mtof(note) * 0.96, t + len); // 最後にわずかに沈む
      o.detune.value = det;
      o.connect(ws);
      o.start(t);
      o.stop(t + len + 0.05);
    });
    // 喉の奥の息
    this._noiseHit(t, len * 0.8, { vol: 0.05 * v, f0: 260, f1: 700, type: 'bandpass', q: 2.5, ch: this.ch.growl, attack: 0.4 });
  }

  // 地鳴りのような一撃
  _boom(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(27, t + 2.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(g).connect(this.ch.beat);
    o.start(t);
    o.stop(t + 2.9);
    this._noiseHit(t, 2, { vol: 0.2, f0: 420, f1: 50, type: 'lowpass', ch: this.ch.beat });
  }

  // 吸い込むようなライザー
  _riser(t, dur) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(260, t);
    f.frequency.exponentialRampToValueAtTime(5200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    src.connect(f).connect(g).connect(this.ch.fx);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  // 闇の中で目が光る瞬間
  _glint(t) {
    const ctx = this.ctx;
    [
      [2349, 0.035],
      [3520, 0.022],
    ].forEach(([fr, v], i) => {
      const o = ctx.createOscillator();
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      let node = o.connect(g);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = i ? 0.35 : -0.35;
        node = node.connect(p);
      }
      node.connect(this.ch.fx);
      o.start(t);
      o.stop(t + 1.7);
    });
    this._noiseHit(t, 0.5, { vol: 0.045, f0: 9000, f1: 6000, type: 'highpass', ch: this.ch.fx });
  }

  // ---------- 譜面：16 分音符 1 つぶんの出来事を予約する ----------
  _step(s, t) {
    const bar = Math.floor(s / 16);
    const pos = s % 16;
    const sec = Math.floor(bar / 8); // 0 沈黙 / 1 眼光 / 2 牙 / 3 静寂へ
    const b8 = bar % 8;
    const chord = chordAt(bar);

    // パッド
    if (pos === 0) {
      const seg = PROG.find(([st]) => st === b8);
      if (seg) {
        const vol = [0.65, 0.85, 1, 0.55][sec];
        this._pad(t, CHORDS[seg[2]].pad, seg[1] * BAR, vol, sec === 2);
      }
    }

    // 鼓動（「牙」では太鼓に替わる。「静寂へ」では間引く）
    if (sec !== 2 && (sec !== 3 || bar % 2 === 0)) {
      if (pos === 0) this._heart(t, sec === 1 ? 0.9 : 0.75);
      if (pos === 3) this._heart(t, sec === 1 ? 0.55 : 0.45);
    }

    // 太鼓
    if (sec === 2) {
      if (pos === 0) this._drum(t, 1);
      if (pos === 10) this._drum(t, 0.5);
      if (pos === 12 && bar % 2 === 1) this._drum(t, 0.7);
      if (bar === 23 && pos >= 8 && pos % 2 === 0) this._drum(t, 0.45 + (pos - 8) * 0.08);
    }

    // ハイハット：「眼光」の後半から裏拍だけ忍び込み、「牙」で 16 分を刻む
    if (sec === 2) this._tick(t, pos % 4 === 0 ? 1 : pos % 2 === 0 ? 0.55 : 0.32, pos % 2 ? 0.3 : -0.3);
    else if (sec === 1 && b8 >= 4 && pos % 4 === 2) this._tick(t, 0.4, 0.25);

    // ベースの刻み
    if (sec === 2 && pos % 2 === 0 && pos !== 14) {
      const acc = [1, 0.45, 0.6, 0.45, 0.85, 0.45, 0.6][pos / 2];
      this._pluck(t, chord.root + 12, acc);
    }

    // 旋律
    if (sec === 1 || sec === 2 || (sec === 3 && b8 < 4)) {
      for (const [mb, mp, note, len] of MOTIF) {
        if (mb !== b8 || mp !== pos) continue;
        if (sec === 3) this._bell(t, note - 12, len * STEP, 0.7, false);
        else this._bell(t, note, len * STEP, sec === 2 ? 0.85 : 1, sec === 2);
      }
    }

    // 獣のうなり
    if (pos === 0 && (bar === 8 || bar === 12 || bar === 16 || bar === 20)) this._growl(t, chord.root - 12, bar >= 16 ? 1 : 0.8);
    if (pos === 0 && bar === 16) this._boom(t);

    // 区切り：ライザーで吸い込み、次の頭で目が光る
    if (pos === 0 && (bar === 7 || bar === 31)) this._riser(t, BAR);
    if (pos === 0 && (bar === 8 || bar === 16)) this._glint(t);
  }

  // ---------- 再生 ----------
  start() {
    if (this.timer) return;
    this._build();
    this.step = 0;
    this.next = this.ctx.currentTime + 0.2;
    this.timer = setInterval(() => this._tick16(), 25);
    this._tick16();
  }

  _tick16() {
    const now = this.ctx.currentTime;
    // タブが裏に回って時間が飛んだ時は、過去の分を鳴らさずに追いつく
    if (this.next < now - 0.1) this.next = now + 0.05;
    while (this.next < now + 0.3) {
      this._step(this.step, this.next);
      this.next += STEP;
      this.step = (this.step + 1) % LOOP_STEPS;
    }
  }

  stop(fade = 1.2) {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    this.continuous.forEach((n) => n.stop(t + fade + 0.1));
    const out = this.out;
    setTimeout(() => out.disconnect(), (fade + 4) * 1000);
  }

  // 確認用：OfflineAudioContext に 1 ループぶんを書き出す
  renderAll(loops = 1) {
    this._build(0.01);
    for (let s = 0; s < LOOP_STEPS * loops; s++) this._step(s % LOOP_STEPS, 0.05 + s * STEP);
  }
}
