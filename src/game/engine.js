import { MISSIONS } from './maps.js';
import { OPERATORS, getOp } from './operators.js';
import { audio } from './audio.js';
import { TUTORIAL } from './tutorial.js';

export const T = 40;

const isSolid = (c) => c === '#' || c === 'D' || c === 'w' || c === 'c' || c === 'V' || c === 'F';
const blocksSight = (c) => c === '#' || c === 'D' || c === 'V';
const blocksBullet = (c) => c === '#' || c === 'D' || c === 'c' || c === 'V' || c === 'F';
const isPassable = (c) => !(c === '#' || c === 'w' || c === 'c' || c === 'V' || c === 'F');

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const turnTowards = (a, target, max) => {
  const d = angDiff(a, target);
  return a + clamp(d, -max, max);
};
const AIM_TURN_RATE = 15; // 視点操作の速さ 100% あたりの回転速度（rad/秒）
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
// チュートリアル用マーカー（訓練施設マップのみで使う）
const MARKERS = /[0-9abefgijklnopqrstuvxyz]/;
// チュートリアルで新しい項目の説明を大きく表示する秒数（この間は動けない）
const READ_TIME = 5;
const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const SHOUTS = ['POLICE! DROP THE WEAPON!', 'SWAT! HANDS UP!', 'ON THE GROUND! NOW!', 'DROP IT! DROP IT!'];
const COMMAND_SHOUTS = ['THIS IS YOUR LAST CHANCE! GET DOWN!', 'IT\'S OVER! WEAPONS DOWN, NOW!'];

export class Game {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.mission = MISSIONS[opts.missionIndex];
    this.tutorial = !!this.mission.tutorial;
    this.op = getOp(opts.opId);
    this.locked = new Set(); // 施錠中のドア（"x,y"）
    this.tut = null;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.time = 0;
    this.realTime = 0;
    this.paused = false;
    this.ended = false;
    this.endTimer = -1;
    this.keys = {};
    this.mouse = { x: 0, y: 0, down: false };
    // タッチ操作用の仮想入力
    this.touchMode = !!opts.touch;
    this.zoomMul = opts.zoomMul || 1;
    this.autoFace = opts.autoFace !== false;
    this.vMove = null;
    this.vAim = null;
    this.aimTarget = 0; // 照準スティックが指している向き
    this.aimSpeed = opts.aimSpeed || 1; // 視点操作の速さ（1 で即座に向く）
    this.vFire = false;
    this.vSprint = false;
    this.aimAng = 0;
    this.aimDist = 5 * T;
    this.aimHold = 0;
    this.aimLocked = false; // 一度手動で照準したら、その向きを維持する
    this.particles = [];
    this.tracers = [];
    this.lights = [];
    this.floaters = [];
    this.bubbles = [];
    this.grenades = [];
    this.tempFires = [];
    this.shake = 0;
    this.hurtFlash = 0;
    this.whiteout = 0;
    this.focusT = 0;
    this.droneT = 0;
    this.bloom = 0;
    this.shoutCd = 0;
    this.interact = null;
    this.interactProg = 0;
    this.heartbeatT = 0;
    this.flowCache = new Map();
    this.radioFlags = {};
    this.hudTimer = 0;
    this.miniTimer = 0;
    this.exploreTimer = 0;
    this.score = { neutralize: 0, arrest: 0, hostage: 0, bomb: 0, penalty: 0 };
    this.stats = {
      shots: 0,
      hits: 0,
      neutralized: 0,
      arrested: 0,
      rescued: 0,
      damageTaken: 0,
      unauthorized: 0,
      explosionMulti: 0,
      totalSuspects: 0,
    };
    this.parse();
    this.prerender();
    this.initScreenFx();
    this.resize();
    this.mouse.x = this.vw * 0.62;
    this.mouse.y = this.vh * 0.5;
    this.bind();
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    if (this.tutorial) {
      this.initTutorial(opts.tutorialChapter || 0);
      setTimeout(() => this.radio('INSTRUCTOR', '訓練を開始する。指示をよく読んで動け。'), 600);
    } else {
      setTimeout(() => this.radio('COMMAND', `${this.mission.code}、作戦開始。${this.mission.bombTime ? '爆弾の解除を最優先せよ。' : '人質の安全を最優先せよ。'}`), 600);
      setTimeout(() => this.squad[0] && this.radio(this.squad[0].op.name, 'スタック完了。リードについていく。'), 2600);
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------- マップ解析 ----------------
  parse() {
    const rows = this.mission.layout;
    this.H = rows.length;
    this.W = Math.max(...rows.map((r) => r.length));
    this.grid = rows.map((r) => r.padEnd(this.W, ',').split(''));
    this.outside = new Uint8Array(this.W * this.H);
    this.explored = new Uint8Array(this.W * this.H);
    this.enemies = [];
    this.hostages = [];
    this.barrels = [];
    this.medkits = [];
    this.fires = [];
    this.extraction = [];
    this.targets = [];
    this.marks = {};
    this.bomb = null;
    let spawn = { x: 5, y: 5 };
    const c2 = (x) => x * T + T / 2;
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const ch = this.grid[y][x];
        if (MARKERS.test(ch)) {
          // マーカーは床に置き換え、位置だけ覚えておく
          (this.marks[ch] = this.marks[ch] || []).push({ x: c2(x), y: c2(y), tx: x, ty: y });
          const outdoorN = DIRS4.filter(([dx, dy]) => (rows[y + dy] || '')[x + dx] === ',').length;
          this.grid[y][x] = outdoorN >= 2 ? ',' : '.';
          if (this.grid[y][x] === ',') this.outside[y * this.W + x] = 1;
          continue;
        }
        switch (ch) {
          case 'P':
            spawn = { x: c2(x), y: c2(y) };
            this.grid[y][x] = ',';
            break;
          case 'X':
            this.extraction.push({ x, y });
            this.grid[y][x] = ',';
            break;
          case 'E':
          case 'G':
            this.enemies.push(this.makeEnemy(c2(x), c2(y), ch === 'G'));
            this.grid[y][x] = '.';
            break;
          case 'h':
            this.hostages.push({ x: c2(x), y: c2(y), r: 12, state: 'bound', angle: rand(0, 6.28), anim: rand(0, 10), sobT: 0 });
            this.grid[y][x] = '.';
            break;
          case 'B':
            this.barrels.push({ x: c2(x), y: c2(y), r: 14, hp: 30, exploded: false });
            this.grid[y][x] = '.';
            break;
          case 'm':
            this.medkits.push({ x: c2(x), y: c2(y), taken: false });
            this.grid[y][x] = '.';
            break;
          case 'K':
            this.bomb = { x: c2(x), y: c2(y), defused: false, timer: this.mission.bombTime, beepT: 0 };
            this.grid[y][x] = '.';
            break;
          case 'F':
            this.fires.push({ x: c2(x), y: c2(y), seed: Math.random() * 10 });
            break;
          default:
        }
        if (this.grid[y][x] === ',' || this.grid[y][x] === 'V') this.outside[y * this.W + x] = 1;
      }
    }
    this.stats.totalSuspects = this.enemies.length;
    this.marks.P = [{ x: spawn.x, y: spawn.y, tx: Math.floor(spawn.x / T), ty: Math.floor(spawn.y / T) }];
    // 撤収ポイント
    const ex = this.extraction;
    this.exRect = {
      x: Math.min(...ex.map((e) => e.x)) * T,
      y: Math.min(...ex.map((e) => e.y)) * T,
      w: (Math.max(...ex.map((e) => e.x)) - Math.min(...ex.map((e) => e.x)) + 1) * T,
      h: (Math.max(...ex.map((e) => e.y)) - Math.min(...ex.map((e) => e.y)) + 1) * T,
    };
    // 車両
    const vs = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) if (this.grid[y][x] === 'V') vs.push({ x, y });
    if (vs.length) {
      const minX = Math.min(...vs.map((v) => v.x));
      const minY = Math.min(...vs.map((v) => v.y));
      const maxX = Math.max(...vs.map((v) => v.x));
      const maxY = Math.max(...vs.map((v) => v.y));
      this.van = { x: minX * T, y: minY * T, w: (maxX - minX + 1) * T, h: (maxY - minY + 1) * T };
    }
    // プレイヤー
    const op = this.op;
    this.player = {
      x: spawn.x,
      y: spawn.y,
      r: 13,
      angle: 0,
      hp: op.hp,
      maxHp: op.hp,
      mag: op.weapon.mag,
      reloadT: 0,
      fireCd: 0,
      abilityCd: 0,
      moving: false,
      walkT: 0,
      op,
    };
    // 分隊（訓練は単独で行う）
    const mates = this.tutorial ? [] : OPERATORS.filter((o) => o.id !== op.id).slice(0, 2);
    this.squad = mates.map((m, i) => ({
      x: spawn.x - 30,
      y: spawn.y + (i ? 30 : -30),
      r: 13,
      angle: 0,
      op: m,
      fireCd: rand(0, 0.5),
      side: i ? 1 : -1,
      walkT: 0,
      moving: false,
      calloutCd: 0,
    }));
    // 静的な炎の光源ポリゴン
    for (const f of this.fires) f.poly = this.visPoly(f.x, f.y, 6 * T, 120);
  }

  makeEnemy(x, y, heavy) {
    const diff = this.mission.diff;
    const base = rand(0, Math.PI * 2);
    const e = {
      x,
      y,
      r: heavy ? 15 : 13,
      heavy,
      hp: heavy ? 230 : 70,
      maxHp: heavy ? 230 : 70,
      speed: heavy ? 78 : 105,
      angle: base,
      baseAngle: base,
      phase: rand(0, 6),
      fov: heavy ? 1.7 : 1.55,
      vision: 9.5,
      reactBase: (heavy ? 0.42 : 0.55) / diff,
      reaction: 0,
      spread: heavy ? 0.13 : 0.1,
      dmg: (heavy ? 7 : 8) * diff,
      rpm: heavy ? 620 : 320,
      burst: heavy ? 6 : 3,
      burstLeft: 0,
      burstPause: heavy ? 1.0 : 0.9,
      fireCd: 0,
      turn: heavy ? 3.6 : 5,
      state: 'idle',
      stun: 0,
      lastKnown: null,
      lookT: 0,
      anim: rand(0, 10),
      hitFlash: 0,
      strafe: Math.random() < 0.5 ? 1 : -1,
      strafeT: rand(1, 2.5),
      home: { x, y },
      patrol: null,
      patrolDir: 1,
      walkT: 0,
      moving: false,
      alertMark: 0,
      downAngle: 0,
    };
    return e;
  }

  setupPatrols() {
    for (const e of this.enemies) {
      if (Math.random() < 0.5) continue;
      const tx = Math.floor(e.x / T);
      const ty = Math.floor(e.y / T);
      const cands = [];
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -5; dx <= 5; dx++) {
          const c = this.tile(tx + dx, ty + dy);
          if (c !== '.') continue;
          const px = (tx + dx) * T + T / 2;
          const py = (ty + dy) * T + T / 2;
          const dd = Math.hypot(px - e.x, py - e.y);
          if (dd > 2.5 * T && this.los(e.x, e.y, px, py, blocksBullet)) cands.push({ x: px, y: py });
        }
      if (cands.length) e.patrol = pick(cands);
    }
  }

  tile(x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return '#';
    return this.grid[y][x];
  }

  // ---------------- プリレンダリング ----------------
  prerender() {
    const W = this.W * T;
    const H = this.H * T;
    const mk = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };
    this.mapCanvas = mk(W, H);
    this.decalCanvas = mk(W, H);
    this.outsideMask = mk(W, H);
    const g = this.mapCanvas.getContext('2d');
    // 屋外: 濡れたアスファルト
    g.fillStyle = '#14181e';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rand(0.02, 0.06)})`;
      g.fillRect(rand(0, W), rand(0, H), rand(1, 3), rand(1, 3));
    }
    for (let i = 0; i < 26; i++) {
      const px = rand(0, W);
      const py = rand(0, H);
      const gr = g.createRadialGradient(px, py, 0, px, py, rand(20, 60));
      gr.addColorStop(0, 'rgba(120,160,200,0.08)');
      gr.addColorStop(1, 'rgba(120,160,200,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(px, py, rand(30, 70), rand(12, 26), rand(0, 3), 0, 7);
      g.fill();
    }
    // 道路ライン
    g.strokeStyle = 'rgba(230,180,60,0.22)';
    g.lineWidth = 4;
    g.setLineDash([30, 26]);
    g.beginPath();
    g.moveTo(8.5 * T, 0);
    g.lineTo(8.5 * T, H);
    g.stroke();
    g.setLineDash([]);

    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const c = this.grid[y][x];
        const px = x * T;
        const py = y * T;
        if (c === '.' || c === 'D' || c === 'c' || c === 'F' || c === 'w') {
          if (c !== 'F' || !this.outside[y * this.W + x]) {
            // 屋内のコンクリ床
            const shade = 26 + ((x * 7 + y * 13) % 5);
            g.fillStyle = `rgb(${shade},${shade + 3},${shade + 8})`;
            g.fillRect(px, py, T, T);
            g.strokeStyle = 'rgba(0,0,0,0.35)';
            g.lineWidth = 1;
            g.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
            if (Math.random() < 0.15) {
              g.fillStyle = 'rgba(0,0,0,0.18)';
              g.beginPath();
              g.ellipse(px + rand(8, 32), py + rand(8, 32), rand(5, 14), rand(4, 10), rand(0, 3), 0, 7);
              g.fill();
            }
          }
        }
      }
    }
    // 壁の影
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        if (this.grid[y][x] !== '#') continue;
        const px = x * T;
        const py = y * T;
        const s = 10;
        const sh = (dx, dy, rx, ry, rw, rh, x0, y0, x1, y1) => {
          const n = this.tile(x + dx, y + dy);
          if (n === '#' || n === ',' || n === 'V') return;
          const gr = g.createLinearGradient(x0, y0, x1, y1);
          gr.addColorStop(0, 'rgba(0,0,0,0.55)');
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(rx, ry, rw, rh);
        };
        sh(0, 1, px, py + T, T, s, 0, py + T, 0, py + T + s);
        sh(1, 0, px + T, py, s, T, px + T, 0, px + T + s, 0);
        sh(0, -1, px, py - s, T, s, 0, py, 0, py - s);
        sh(-1, 0, px - s, py, s, T, px, 0, px - s, 0);
      }
    }
    // 壁
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const c = this.grid[y][x];
        const px = x * T;
        const py = y * T;
        if (c === '#') {
          const gr = g.createLinearGradient(px, py, px + T, py + T);
          gr.addColorStop(0, '#3a414c');
          gr.addColorStop(1, '#262b33');
          g.fillStyle = gr;
          g.fillRect(px, py, T, T);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          for (let i = 0; i < 4; i++) g.fillRect(px + rand(2, 34), py + rand(2, 34), rand(2, 6), 1);
          g.strokeStyle = '#5a6371';
          g.lineWidth = 2;
          const edge = (dx, dy, x0, y0, x1, y1) => {
            if (this.tile(x + dx, y + dy) !== '#') {
              g.beginPath();
              g.moveTo(x0, y0);
              g.lineTo(x1, y1);
              g.stroke();
            }
          };
          edge(0, -1, px, py + 1, px + T, py + 1);
          edge(0, 1, px, py + T - 1, px + T, py + T - 1);
          edge(-1, 0, px + 1, py, px + 1, py + T);
          edge(1, 0, px + T - 1, py, px + T - 1, py + T);
        } else if (c === 'w') {
          g.fillStyle = '#20262e';
          g.fillRect(px, py, T, T);
          const vert = this.tile(x, y - 1) === '#' || this.tile(x, y + 1) === '#' || this.tile(x, y - 1) === 'w' || this.tile(x, y + 1) === 'w';
          g.fillStyle = 'rgba(140,210,255,0.35)';
          if (vert) g.fillRect(px + T / 2 - 3, py, 6, T);
          else g.fillRect(px, py + T / 2 - 3, T, 6);
          g.strokeStyle = 'rgba(200,240,255,0.6)';
          g.lineWidth = 1;
          g.beginPath();
          if (vert) {
            g.moveTo(px + T / 2, py);
            g.lineTo(px + T / 2, py + T);
          } else {
            g.moveTo(px, py + T / 2);
            g.lineTo(px + T, py + T / 2);
          }
          g.stroke();
        } else if (c === 'c') {
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(px + 4, py + 6, T - 4, T - 4);
          g.fillStyle = '#5a4128';
          g.fillRect(px + 2, py + 2, T - 4, T - 4);
          g.strokeStyle = '#3a2816';
          g.lineWidth = 3;
          g.strokeRect(px + 3.5, py + 3.5, T - 7, T - 7);
          g.beginPath();
          g.moveTo(px + 4, py + 4);
          g.lineTo(px + T - 4, py + T - 4);
          g.moveTo(px + T - 4, py + 4);
          g.lineTo(px + 4, py + T - 4);
          g.stroke();
          g.fillStyle = 'rgba(255,200,140,0.08)';
          g.fillRect(px + 2, py + 2, T - 4, 3);
        }
      }
    }
    // 屋外マスク（環境光）
    const m = this.outsideMask.getContext('2d');
    m.filter = 'blur(14px)';
    m.fillStyle = '#fff';
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) if (this.outside[y * this.W + x]) m.fillRect(x * T, y * T, T, T);
    m.filter = 'none';
    this.dctx2 = this.decalCanvas.getContext('2d');
  }

  initScreenFx() {
    this.screenP = [];
    for (let i = 0; i < 90; i++) this.screenP.push(this.newScreenParticle(true));
  }

  newScreenParticle(init) {
    const ember = Math.random() < 0.45;
    return {
      ember,
      x: Math.random(),
      y: init ? Math.random() : ember ? 1.05 : -0.05,
      vx: rand(-0.02, 0.02),
      vy: ember ? rand(-0.08, -0.03) : rand(0.04, 0.12),
      s: ember ? rand(1, 2.6) : rand(0.8, 1.8),
      a: rand(0.2, 0.8),
      ph: rand(0, 6),
    };
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.vw = r.width;
    this.vh = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    if (!this.darkCanvas) this.darkCanvas = document.createElement('canvas');
    this.darkCanvas.width = this.canvas.width;
    this.darkCanvas.height = this.canvas.height;
    this.dctx = this.darkCanvas.getContext('2d');
    // スマホは画面が小さく、キャラクターや的が見づらいので、フィールドごと拡大して映す
    const fit = Math.min(this.vw / 1280, this.vh / 720);
    const base = this.touchMode ? clamp(fit * 1.2, 0.82, 1.6) : clamp(fit, 0.9, 1.6);
    this.zoom = base * this.zoomMul;
    if (!this.cam) {
      this.cam = { x: this.player.x, y: this.player.y };
      this.camX = this.cam.x - this.vw / this.zoom / 2;
      this.camY = this.cam.y - this.vh / this.zoom / 2;
    }
  }

  // ---------------- 入力 ----------------
  bind() {
    this.onKeyDown = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!this.ended) this.setPaused(!this.paused);
        return;
      }
      if (this.paused || this.ended) return;
      this.keys[e.code] = true;
      if (this.frozen) return; // 押した状態は覚えておき、行動はさせない
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyF') this.shout(false);
      if (e.code === 'KeyQ' || e.code === 'Space') this.useAbility();
      if (e.code === 'KeyE' && this.interact && this.interact.type === 'door') this.openDoor(this.interact.tx, this.interact.ty, true);
    };
    this.onKeyUp = (e) => {
      this.keys[e.code] = false;
    };
    this.onMouseMove = (e) => {
      if (this.touchMode) return;
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    };
    this.onMouseDown = (e) => {
      if (this.touchMode) return;
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.useAbility();
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouse.down = false;
    };
    this.onContext = (e) => e.preventDefault();
    this.onResize = () => this.resize();
    this.onBlur = () => {
      this.keys = {};
      this.mouse.down = false;
      if (!this.ended) this.setPaused(true);
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('contextmenu', this.onContext);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    this.setupPatrols();
  }

  setPaused(p) {
    this.paused = p;
    this.keys = {};
    this.mouse.down = false;
    this.vMove = null;
    this.vAim = null;
    this.vFire = false;
    this.opts.onPause && this.opts.onPause(p);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
  }

  // ---------------- 仮想入力（タッチ操作） ----------------
  setOptions(o) {
    if (o.touch !== undefined) this.touchMode = !!o.touch;
    if (o.zoomMul !== undefined) this.zoomMul = o.zoomMul;
    if (o.autoFace !== undefined) this.autoFace = o.autoFace;
    if (o.aimSpeed !== undefined) this.aimSpeed = o.aimSpeed;
    this.resize();
  }
  // キー入力をそのまま再現する（R / F / Q / E など）
  press(code) {
    this.onKeyDown({ code, repeat: false, preventDefault() {} });
  }
  release(code) {
    this.onKeyUp({ code });
  }
  // 移動スティック：x, y は -1〜1（null で解除）
  setMove(v) {
    this.vMove = v;
  }
  // 照準スティック：x, y は -1〜1。長さで照準距離が変わる（null で解除、向きは維持）
  setAim(v) {
    if (v && Math.hypot(v.x, v.y) > 0.15) {
      const m = Math.min(1, Math.hypot(v.x, v.y));
      this.aimTarget = Math.atan2(v.y, v.x);
      // 最速以外は、毎フレーム少しずつ向きを変える
      if (this.aimSpeed >= 1) this.aimAng = this.aimTarget;
      this.aimDist = (1.8 + m * 5.7) * T;
      this.vAim = v;
      this.aimLocked = true;
    } else {
      if (this.vAim) this.aimHold = 0.9;
      this.vAim = null;
    }
  }
  // 画面上の点（キャンバス座標）に照準を合わせる
  aimAtScreen(sx, sy) {
    const p = this.player;
    const wx = sx / this.zoom + this.camX;
    const wy = sy / this.zoom + this.camY;
    this.aimAng = Math.atan2(wy - p.y, wx - p.x);
    this.aimDist = clamp(Math.hypot(wx - p.x, wy - p.y), 1.2 * T, 9 * T);
    this.aimLocked = true;
  }
  // 現在の照準をスティックの傾き（-1〜1）に変換する
  getAimVec() {
    const m = clamp((this.aimDist / T - 1.8) / 5.7, 0, 1);
    return { x: Math.cos(this.aimAng) * m, y: Math.sin(this.aimAng) * m, m };
  }
  setFire(on) {
    if (on && (this.paused || this.ended)) return;
    this.vFire = on;
    if (!on) this.aimHold = Math.max(this.aimHold, 0.9);
  }
  setSprint(on) {
    this.vSprint = on;
  }

  get mouseWorld() {
    return { x: this.mouse.x / this.zoom + this.camX, y: this.mouse.y / this.zoom + this.camY };
  }

  // ---------------- レイキャスト ----------------
  castRay(x, y, ang, maxD, block) {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let tx = Math.floor(x / T);
    let ty = Math.floor(y / T);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(T / dx) : Infinity;
    const tDY = dy !== 0 ? Math.abs(T / dy) : Infinity;
    let tMX = dx > 0 ? ((tx + 1) * T - x) / dx : dx < 0 ? (tx * T - x) / dx : Infinity;
    let tMY = dy > 0 ? ((ty + 1) * T - y) / dy : dy < 0 ? (ty * T - y) / dy : Infinity;
    let d = 0;
    for (let i = 0; i < 200; i++) {
      if (tMX < tMY) {
        d = tMX;
        tMX += tDX;
        tx += stepX;
      } else {
        d = tMY;
        tMY += tDY;
        ty += stepY;
      }
      if (d >= maxD) return maxD;
      if (block(this.tile(tx, ty))) return d;
    }
    return maxD;
  }

  los(ax, ay, bx, by, block = blocksSight) {
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 1) return true;
    return this.castRay(ax, ay, Math.atan2(by - ay, bx - ax), d, block) >= d - 1;
  }

  visPoly(x, y, maxD, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = this.castRay(x, y, a, maxD, blocksSight) + 6;
      pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    return pts;
  }

  // ---------------- 経路探索（BFSフローフィールド） ----------------
  flow(tx, ty) {
    const key = tx + ty * 1000;
    let f = this.flowCache.get(key);
    if (f) return f;
    const W = this.W;
    const H = this.H;
    f = new Int16Array(W * H).fill(-1);
    const q = new Int32Array(W * H);
    let qh = 0;
    let qt = 0;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return f;
    f[ty * W + tx] = 0;
    q[qt++] = ty * W + tx;
    while (qh < qt) {
      const i = q[qh++];
      const x = i % W;
      const y = (i / W) | 0;
      const nd = f[i] + 1;
      const tryN = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
        const j = ny * W + nx;
        if (f[j] !== -1 || !isPassable(this.grid[ny][nx])) return;
        f[j] = nd;
        q[qt++] = j;
      };
      tryN(x + 1, y);
      tryN(x - 1, y);
      tryN(x, y + 1);
      tryN(x, y - 1);
    }
    if (this.flowCache.size > 60) this.flowCache.clear();
    this.flowCache.set(key, f);
    return f;
  }

  // 目標に向かう次の移動方向を返す
  pathDir(ent, target) {
    if (this.los(ent.x, ent.y, target.x, target.y, isSolid) && this.clearPath(ent, target)) {
      const a = Math.atan2(target.y - ent.y, target.x - ent.x);
      return { a, door: null };
    }
    const f = this.flow(Math.floor(target.x / T), Math.floor(target.y / T));
    const tx = Math.floor(ent.x / T);
    const ty = Math.floor(ent.y / T);
    const W = this.W;
    let best = null;
    let bd = f[ty * W + tx] === -1 ? 30000 : f[ty * W + tx];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue;
      const v = f[ny * W + nx];
      if (v !== -1 && v < bd) {
        bd = v;
        best = { x: nx, y: ny };
      }
    }
    if (!best) {
      const a = Math.atan2(target.y - ent.y, target.x - ent.x);
      return { a, door: null };
    }
    const cx = best.x * T + T / 2;
    const cy = best.y * T + T / 2;
    // 通路の中心線に寄せる
    const a = Math.atan2(cy - ent.y, cx - ent.x);
    return { a, door: this.grid[best.y][best.x] === 'D' ? best : null };
  }

  clearPath(ent, target) {
    // 体の幅を考慮して両側の線もチェック
    const a = Math.atan2(target.y - ent.y, target.x - ent.x);
    const ox = Math.cos(a + Math.PI / 2) * (ent.r - 2);
    const oy = Math.sin(a + Math.PI / 2) * (ent.r - 2);
    return this.los(ent.x + ox, ent.y + oy, target.x + ox, target.y + oy, isSolid) && this.los(ent.x - ox, ent.y - oy, target.x - ox, target.y - oy, isSolid);
  }

  boxFree(x, y, r) {
    const rr = r * 0.92;
    const x0 = Math.floor((x - rr) / T);
    const x1 = Math.floor((x + rr) / T);
    const y0 = Math.floor((y - rr) / T);
    const y1 = Math.floor((y + rr) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolid(this.tile(tx, ty))) return false;
    return true;
  }

  moveEnt(ent, dx, dy) {
    if (!this.boxFree(ent.x, ent.y, ent.r)) {
      // 壁にめり込んだ場合はタイル中心へ引き戻す
      const cx = Math.floor(ent.x / T) * T + T / 2;
      const cy = Math.floor(ent.y / T) * T + T / 2;
      ent.x += (cx - ent.x) * 0.25 + dx * 0.5;
      ent.y += (cy - ent.y) * 0.25 + dy * 0.5;
      return;
    }
    const nx = ent.x + dx;
    if (this.boxFree(nx, ent.y, ent.r)) ent.x = nx;
    else if (dx !== 0 && Math.abs(dx) >= Math.abs(dy) * 0.5) {
      // 角・ドア枠を滑って通り抜ける
      const ty = Math.floor(ent.y / T);
      const ahead = Math.floor((ent.x + Math.sign(dx) * (ent.r + 2)) / T);
      if (!isSolid(this.tile(ahead, ty))) {
        const n = clamp(ty * T + T / 2 - ent.y, -Math.abs(dx), Math.abs(dx));
        if (this.boxFree(ent.x, ent.y + n, ent.r)) ent.y += n;
      }
    }
    const ny = ent.y + dy;
    if (this.boxFree(ent.x, ny, ent.r)) ent.y = ny;
    else if (dy !== 0 && Math.abs(dy) >= Math.abs(dx) * 0.5) {
      const tx = Math.floor(ent.x / T);
      const ahead = Math.floor((ent.y + Math.sign(dy) * (ent.r + 2)) / T);
      if (!isSolid(this.tile(tx, ahead))) {
        const n = clamp(tx * T + T / 2 - ent.x, -Math.abs(dy), Math.abs(dy));
        if (this.boxFree(ent.x + n, ent.y, ent.r)) ent.x += n;
      }
    }
    for (const b of this.barrels) {
      if (b.exploded) continue;
      const d = Math.hypot(ent.x - b.x, ent.y - b.y);
      const min = ent.r + b.r;
      if (d < min && d > 0.01) {
        const px = ent.x + ((ent.x - b.x) / d) * (min - d);
        const py = ent.y + ((ent.y - b.y) / d) * (min - d);
        if (this.boxFree(px, py, ent.r)) {
          ent.x = px;
          ent.y = py;
        }
      }
    }
  }

  // a を動かさず b だけを押し出す
  yieldTo(a, b) {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const min = a.r + b.r;
    if (d < min && d > 0.01) {
      const push = min - d;
      this.moveEnt(b, ((b.x - a.x) / d) * push, ((b.y - a.y) / d) * push);
    }
  }

  separate(a, b, strength = 1) {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const min = a.r + b.r;
    if (d < min && d > 0.01) {
      const push = ((min - d) / 2) * strength;
      const ux = (a.x - b.x) / d;
      const uy = (a.y - b.y) / d;
      this.moveEnt(a, ux * push, uy * push);
      this.moveEnt(b, -ux * push, -uy * push);
    }
  }

  // ---------------- メインループ ----------------
  loop(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = clamp(dt, 0, 0.05);
    if (!this.paused) {
      this.update(dt);
    }
    this.render(dt);
    this.raf = requestAnimationFrame(this.loop);
  }

  update(rdt) {
    this.realTime += rdt;
    this.rdt = rdt;
    const ws = this.focusT > 0 ? 0.3 : 1;
    const dt = rdt * ws;
    const pdt = rdt * (this.focusT > 0 ? 0.85 : 1);
    if (!this.ended) this.time += rdt;

    this.focusT = Math.max(0, this.focusT - rdt);
    this.droneT = Math.max(0, this.droneT - rdt);
    this.whiteout = Math.max(0, this.whiteout - rdt * 0.6);
    this.hurtFlash = Math.max(0, this.hurtFlash - rdt * 2);
    this.shake = Math.max(0, this.shake - rdt * 30);
    this.shoutCd -= rdt;

    const p = this.player;
    // 指示を読んでいる間は、自分も容疑者もタイマーも止める
    if (this.frozen) {
      this.updateReading(rdt);
      this.updateEffects(dt, rdt);
    } else this.updateWorld(dt, pdt, rdt);

    if (this.ended) {
      this.endTimer -= rdt;
      if (this.endTimer <= 0 && !this.endSent) {
        this.endSent = true;
        this.opts.onEnd && this.opts.onEnd(this.result);
      }
    }

    // カメラ（スマホは映る範囲が狭いぶん、照準の方向をより先まで映す）
    const look = this.touchMode ? 0.45 : 0.22;
    const z = this.zoom;
    const vwW = this.vw / z;
    const vhW = this.vh / z;
    const tx = p.x + ((this.mouse.x - this.vw / 2) / z) * look;
    const ty = p.y + ((this.mouse.y - this.vh / 2) / z) * look;
    this.cam.x += (tx - this.cam.x) * Math.min(1, rdt * 6);
    this.cam.y += (ty - this.cam.y) * Math.min(1, rdt * 6);
    const mapW = this.W * T;
    const mapH = this.H * T;
    this.cam.x = mapW < vwW ? mapW / 2 : clamp(this.cam.x, vwW / 2 - 60, mapW - vwW / 2 + 60);
    this.cam.y = mapH < vhW ? mapH / 2 : clamp(this.cam.y, vhW / 2 - 60, mapH - vhW / 2 + 60);

    // 探索済みマップ
    this.exploreTimer -= rdt;
    if (this.exploreTimer <= 0) {
      this.exploreTimer = 0.15;
      this.updateExplored();
    }
    this.hudTimer -= rdt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.08;
      this.emitHud();
    }
    this.miniTimer -= rdt;
    if (this.miniTimer <= 0 && this.opts.minimap) {
      this.miniTimer = 0.12;
      this.drawMinimap(this.opts.minimap());
    }
  }

  // ゲーム内の出来事を1フレーム進める
  updateWorld(dt, pdt, rdt) {
    const p = this.player;
    if (!this.ended) {
      this.updatePlayer(pdt, rdt);
      this.updateInteract(rdt);
    }
    this.updateSquad(dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    // 重なり解消
    for (const e of this.enemies) {
      if (e.state === 'down') continue;
      this.yieldTo(p, e);
      for (const s of this.squad) this.separate(s, e, 0.5);
    }
    for (let i = 0; i < this.squad.length; i++) {
      this.yieldTo(p, this.squad[i]);
      for (let j = i + 1; j < this.squad.length; j++) this.separate(this.squad[i], this.squad[j], 0.25);
    }
    for (let i = 0; i < this.enemies.length; i++)
      for (let j = i + 1; j < this.enemies.length; j++) {
        if (this.enemies[i].state === 'down' || this.enemies[j].state === 'down') continue;
        this.separate(this.enemies[i], this.enemies[j], 0.5);
      }
    this.updateHostages(dt);
    this.updateGrenades(dt);
    this.updateEffects(dt, rdt);
    this.updateBomb(dt);
    if (!this.ended) this.checkObjectives();
  }

  updatePlayer(dt, rdt) {
    const p = this.player;
    const k = this.keys;
    let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let my = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    let analog = 1;
    if (this.vMove && !mx && !my) {
      mx = this.vMove.x;
      my = this.vMove.y;
      analog = clamp(Math.hypot(mx, my) * 1.4, 0.35, 1);
    }
    const len = Math.hypot(mx, my);
    const sprint = !!(k.ShiftLeft || k.ShiftRight || this.vSprint);
    p.sprint = sprint && len > 0;
    if (len > 0) {
      mx /= len;
      my /= len;
      const sp = p.op.speed * analog * (sprint ? 1.45 : 1) * (this.interactProg > 0 ? 0.4 : 1);
      this.moveEnt(p, mx * sp * dt, my * sp * dt);
      p.moving = true;
      p.walkT += dt * (sprint ? 14 : 10);
    } else p.moving = false;
    if (this.touchMode) {
      // タッチ操作：照準スティックが無ければ移動方向に向く
      this.aimHold = Math.max(0, this.aimHold - rdt);
      if (!this.aimLocked && !this.vAim && !this.vFire && this.aimHold <= 0 && this.autoFace && p.moving) {
        this.aimAng = turnTowards(this.aimAng, Math.atan2(my, mx), rdt * 9);
        this.aimDist += (4.5 * T - this.aimDist) * Math.min(1, rdt * 3);
      }
      if (this.vAim) this.aimAng = turnTowards(this.aimAng, this.aimTarget, rdt * this.aimSpeed * AIM_TURN_RATE);
      this.mouse.x = (p.x + Math.cos(this.aimAng) * this.aimDist - this.camX) * this.zoom;
      this.mouse.y = (p.y + Math.sin(this.aimAng) * this.aimDist - this.camY) * this.zoom;
    }
    const mw = this.mouseWorld;
    p.angle = Math.atan2(mw.y - p.y, mw.x - p.x);

    p.fireCd -= dt;
    p.abilityCd = Math.max(0, p.abilityCd - rdt);
    this.bloom = Math.max(0, this.bloom - dt * 0.18);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        p.mag = p.op.weapon.mag;
        audio.reloadDone();
        if (this.tut) this.tut.reloads++;
      }
    }
    if ((this.mouse.down || this.vFire) && p.fireCd <= 0 && p.reloadT <= 0) {
      if (p.mag > 0) this.playerShoot();
      else {
        audio.empty();
        this.startReload();
        p.fireCd = 0.3;
      }
    }
    // メディキット
    for (const m of this.medkits) {
      if (m.taken) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) < 24 && p.hp < p.maxHp) {
        m.taken = true;
        p.hp = Math.min(p.maxHp, p.hp + 45);
        this.floater(m.x, m.y - 20, '+45 HP', '#7dff9a');
        audio.success();
      }
    }
    // 低HP心音
    if (p.hp < p.maxHp * 0.3) {
      this.heartbeatT -= rdt;
      if (this.heartbeatT <= 0) {
        this.heartbeatT = 0.9;
        audio.heartbeat();
      }
    }
  }

  startReload() {
    const p = this.player;
    if (p.reloadT > 0 || p.mag === p.op.weapon.mag) return;
    p.reloadT = p.op.weapon.reload;
    audio.reload();
  }

  playerShoot() {
    const p = this.player;
    const w = p.op.weapon;
    p.fireCd = 60 / w.rpm;
    p.mag--;
    this.stats.shots++;
    const moveMul = p.moving ? (p.sprint ? 2.6 : 1.5) : 1;
    const spread = w.spread * moveMul + this.bloom;
    this.bloom = Math.min(0.09, this.bloom + (w.kind === 'dmr' ? 0.03 : w.kind === 'shotgun' ? 0.02 : 0.009));
    const mx = p.x + Math.cos(p.angle) * (w.len + 8);
    const my = p.y + Math.sin(p.angle) * (w.len + 8);
    let hitAny = false;
    for (let i = 0; i < w.pellets; i++) {
      const a = p.angle + (Math.random() - 0.5) * 2 * spread;
      const res = this.hitscan(p.x, p.y, a, 26 * T, 'player', w.dmg);
      if (res.target && res.kind === 'enemy') hitAny = true;
      this.tracers.push({ x1: mx, y1: my, x2: res.x, y2: res.y, life: 0.07, max: 0.07, color: '255,220,150', w: w.kind === 'dmr' ? 2.4 : 1.6 });
    }
    if (hitAny) this.stats.hits++;
    this.muzzle(mx, my, p.angle, w.kind === 'shotgun' ? 1.5 : 1);
    this.casing(p.x, p.y, p.angle);
    this.shake = Math.max(this.shake, w.kind === 'shotgun' ? 7 : w.kind === 'dmr' ? 5 : 2.2);
    audio.shot(w.kind, 1, 0);
    this.noise(p.x, p.y, 11 * T, p);
    if (!this.radioFlags.firstShot) {
      this.radioFlags.firstShot = true;
      this.radio('COMMAND', 'ショッツファイアード！ 交戦を確認。');
    }
  }

  muzzle(x, y, a, s = 1) {
    this.lights.push({ x, y, r: 150 * s, life: 0.06, max: 0.06, color: '255,190,90' });
    for (let i = 0; i < 5 * s; i++) {
      const aa = a + rand(-0.4, 0.4);
      const sp = rand(200, 520);
      this.particles.push({ kind: 'spark', x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: rand(0.04, 0.1), max: 0.1, size: rand(1, 2.5), color: '255,210,120' });
    }
    this.particles.push({ kind: 'smoke', x, y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, life: 0.8, max: 0.8, size: 6, grow: 20, color: '180,180,190' });
  }

  casing(x, y, a) {
    const g = this.dctx2;
    const ca = a + Math.PI / 2 + rand(-0.4, 0.4);
    const d = rand(14, 30);
    g.save();
    g.translate(x + Math.cos(ca) * d, y + Math.sin(ca) * d);
    g.rotate(rand(0, 6.28));
    g.fillStyle = 'rgba(200,160,70,0.8)';
    g.fillRect(-2.5, -1, 5, 2);
    g.restore();
  }

  hitscan(x, y, a, range, src, dmg) {
    const wallD = this.castRay(x, y, a, range, blocksBullet);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = wallD;
    let target = null;
    let kind = 'wall';
    const test = (o, r, k) => {
      const fx = x - o.x;
      const fy = y - o.y;
      const b = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - r * r;
      const disc = b * b - c;
      if (disc < 0) return;
      let t = -b - Math.sqrt(disc);
      if (t < 0) t = c < 0 ? 0 : -1;
      if (t >= 0 && t < best) {
        best = t;
        target = o;
        kind = k;
      }
    };
    if (src !== 'enemy') {
      for (const e of this.enemies) if (e.state !== 'down' && e.state !== 'cuffed') test(e, e.r, 'enemy');
      if (src === 'player') for (const h of this.hostages) if (h.state === 'bound') test(h, h.r, 'hostage');
      if (src === 'player') for (const tg of this.targets) if (!tg.down) test(tg, tg.r, 'target');
    } else {
      test(this.player, this.player.r, 'player');
    }
    for (const b of this.barrels) if (!b.exploded) test(b, b.r, 'barrel');
    const hx = x + dx * best;
    const hy = y + dy * best;
    if (kind === 'enemy') this.damageEnemy(target, dmg, src, a);
    else if (kind === 'hostage') this.killHostage(target);
    else if (kind === 'player') this.damagePlayer(dmg);
    else if (kind === 'target') {
      target.down = true;
      target.fallA = a;
      audio.hit();
      this.sparks(hx, hy, a + Math.PI, 6, '255,230,200');
      this.floater(target.x, target.y - 24, 'HIT', '#ffe37a');
    } else if (kind === 'barrel') {
      target.hp -= dmg;
      this.sparks(hx, hy, a + Math.PI, 6, '255,200,120');
      if (target.hp <= 0) this.explode(target);
    } else if (best < range - 1) {
      this.sparks(hx, hy, a + Math.PI, 5, '255,220,170');
      this.particles.push({ kind: 'smoke', x: hx, y: hy, vx: -dx * 20, vy: -dy * 20, life: 0.6, max: 0.6, size: 3, grow: 14, color: '150,150,150' });
      const g = this.dctx2;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.beginPath();
      g.arc(hx - dx * 2, hy - dy * 2, 1.6, 0, 7);
      g.fill();
    }
    return { x: hx, y: hy, target, kind };
  }

  sparks(x, y, a, n, color) {
    for (let i = 0; i < n; i++) {
      const aa = a + rand(-0.9, 0.9);
      const sp = rand(80, 320);
      this.particles.push({ kind: 'spark', x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: rand(0.1, 0.3), max: 0.3, size: rand(1, 2), color });
    }
  }

  damageEnemy(e, dmg, src, a) {
    const p = this.player;
    if (e.state === 'surrender' && src === 'player') {
      this.score.penalty -= 500;
      this.stats.unauthorized++;
      this.floater(e.x, e.y - 30, 'UNAUTHORIZED FORCE -500', '#ff4a4a');
      if (!this.radioFlags.unauth) {
        this.radioFlags.unauth = true;
        this.radio('COMMAND', '投降した容疑者への発砲は許可されていない！ 規律を守れ！');
      }
    }
    e.hp -= dmg;
    e.hitFlash = 0.12;
    audio.hit();
    for (let i = 0; i < 4; i++) {
      const aa = a + rand(-0.5, 0.5);
      const sp = rand(60, 200);
      this.particles.push({ kind: 'dust', x: e.x, y: e.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: 0.35, max: 0.35, size: rand(2, 3.5), color: '120,40,40' });
    }
    if (e.hp <= 0) {
      const wasSurrender = e.state === 'surrender';
      e.state = 'down';
      e.downAngle = a;
      e.x += Math.cos(a) * 6;
      e.y += Math.sin(a) * 6;
      this.stats.neutralized++;
      if (!wasSurrender) {
        this.score.neutralize += 100;
        this.floater(e.x, e.y - 24, 'NEUTRALIZED +100', '#ffb347');
      }
      if (src === 'explosion') this.explosionKills = (this.explosionKills || 0) + 1;
      // 落とした武器
      const g = this.dctx2;
      g.save();
      g.translate(e.x + rand(-14, 14), e.y + rand(-14, 14));
      g.rotate(rand(0, 6.28));
      g.fillStyle = '#0c0c0e';
      g.fillRect(-10, -2, 20, 4);
      g.restore();
      if (src === 'squad' && Math.random() < 0.6) {
        const s = pick(this.squad);
        this.bubble(s, pick(['SUSPECT DOWN!', 'TANGO DOWN!', 'CLEAR!']), s.op.color);
      }
      return;
    }
    if (e.state !== 'surrender') {
      if (e.state !== 'engage') e.reaction = Math.min(e.reactBase, 0.25);
      e.state = 'engage';
      e.lastKnown = { x: p.x, y: p.y };
      e.angle = turnTowards(e.angle, Math.atan2(p.y - e.y, p.x - e.x), 1.2);
    }
  }

  killHostage(h) {
    h.state = 'dead';
    this.floater(h.x, h.y - 24, 'CIVILIAN DOWN', '#ff3030');
    if (this.tutorial) this.tutFail('人質に命中した。実戦なら作戦失敗だ。射線をよく確かめろ。');
    else this.fail('HOSTAGE KILLED', '人質が死亡した。作戦は失敗だ。');
  }

  damagePlayer(dmg) {
    if (this.ended) return;
    if (this.tut && this.tut.state !== 'run') return;
    const p = this.player;
    const d = dmg * p.op.armor;
    p.hp -= d;
    this.stats.damageTaken += d;
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.5);
    this.shake = Math.max(this.shake, 6);
    audio.hurt();
    if (p.hp <= 0) {
      p.hp = 0;
      if (this.tutorial) this.tutFail('被弾しすぎだ。実戦なら戦闘不能になっていた。遮蔽物を使ってもう一度。');
      else this.fail('OFFICER DOWN', `${p.op.name}が負傷し戦闘不能になった。`);
    } else if (p.hp < p.maxHp * 0.35 && !this.radioFlags.lowhp) {
      this.radioFlags.lowhp = true;
      this.radio(this.squad[0] ? this.squad[0].op.name : 'INSTRUCTOR', '被弾してるぞ！ 遮蔽を取れ！');
    }
  }

  noise(x, y, radius, source) {
    for (const e of this.enemies) {
      if (e.state === 'down' || e.state === 'cuffed' || e.state === 'surrender' || e.state === 'engage') continue;
      if (Math.hypot(e.x - x, e.y - y) < radius) {
        e.state = 'search';
        e.lastKnown = { x: source.x, y: source.y };
        e.lookT = 0;
        e.alertMark = 1.2;
      }
    }
  }

  // ---------------- 投降勧告 / アビリティ ----------------
  shout(command) {
    if (this.shoutCd > 0 && !command) return;
    this.shoutCd = 1.1;
    const p = this.player;
    this.bubble(p, command ? pick(COMMAND_SHOUTS) : pick(SHOUTS), p.op.color);
    audio.shout();
    let any = false;
    for (const e of this.enemies) {
      if (e.state === 'down' || e.state === 'cuffed' || e.state === 'surrender') continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > (command ? 11 : 8) * T || !this.los(p.x, p.y, e.x, e.y)) continue;
      any = true;
      let chance = e.heavy ? 0.12 : 0.3;
      if (e.state !== 'engage') chance += 0.35;
      if (e.hp < e.maxHp * 0.5) chance += 0.3;
      if (command) chance += 0.5;
      if (e.stun > 0) chance = 0.95;
      if (e.surrender === 'always') chance = 1;
      if (e.surrender === 'never') chance = 0;
      if (Math.random() < chance) {
        e.state = 'surrender';
        e.stun = 0;
        e.anim = 0;
        this.floater(e.x, e.y - 26, 'SURRENDERED', '#7dd8ff');
      } else {
        if (e.state !== 'engage') e.reaction = Math.min(e.reactBase, 0.3);
        e.state = 'engage';
        e.lastKnown = { x: p.x, y: p.y };
        this.floater(e.x, e.y - 26, 'REFUSED!', '#ff5a3a');
      }
    }
    if (!any && !command) this.noise(p.x, p.y, 6 * T, p);
  }

  useAbility() {
    const p = this.player;
    if (this.ended || this.frozen || p.abilityCd > 0) return;
    const ab = p.op.ability;
    p.abilityCd = ab.cd;
    if (ab.id === 'command') {
      this.shout(true);
      p.hp = Math.min(p.maxHp, p.hp + 25);
      this.floater(p.x, p.y - 30, '+25 HP', '#7dff9a');
      this.squad.forEach((s, i) => setTimeout(() => this.bubble(s, 'COPY!', s.op.color), 300 + i * 250));
    } else if (ab.id === 'flash') {
      const mw = this.mouseWorld;
      const a = Math.atan2(mw.y - p.y, mw.x - p.x);
      const d = Math.min(Math.hypot(mw.x - p.x, mw.y - p.y), 7.5 * T);
      const sp = Math.max(260, d * 2.4);
      this.grenades.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, fuse: 1.0, spin: 0 });
      this.bubble(p, 'FLASHBANG OUT!', p.op.color);
    } else if (ab.id === 'focus') {
      this.focusT = 5;
      audio.heartbeat();
    } else if (ab.id === 'drone') {
      this.droneT = 7;
      audio.ping();
      this.bubble(p, 'DRONE UP.', p.op.color);
    }
  }

  updateGrenades(dt) {
    for (const g of this.grenades) {
      const nx = g.x + g.vx * dt;
      const ny = g.y + g.vy * dt;
      if (isSolid(this.tile(Math.floor(nx / T), Math.floor(g.y / T)))) g.vx *= -0.45;
      else g.x = nx;
      if (isSolid(this.tile(Math.floor(g.x / T), Math.floor(ny / T)))) g.vy *= -0.45;
      else g.y = ny;
      const drag = Math.pow(0.12, dt);
      g.vx *= drag;
      g.vy *= drag;
      g.spin += dt * Math.hypot(g.vx, g.vy) * 0.05;
      g.fuse -= dt;
      if (g.fuse <= 0) this.detonateFlash(g);
    }
    this.grenades = this.grenades.filter((g) => g.fuse > 0);
  }

  detonateFlash(g) {
    const R = 5 * T;
    let n = 0;
    for (const e of this.enemies) {
      if (e.state === 'down' || e.state === 'cuffed' || e.state === 'surrender') continue;
      const d = Math.hypot(e.x - g.x, e.y - g.y);
      if (d < R && this.los(g.x, g.y, e.x, e.y)) {
        e.stun = 4.5 * (1 - (d / R) * 0.4);
        e.state = 'search';
        e.lastKnown = { x: g.x, y: g.y };
        n++;
        this.floater(e.x, e.y - 26, 'STUNNED', '#fff27a');
      }
    }
    const p = this.player;
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    let ring = false;
    if (d < R && this.los(g.x, g.y, p.x, p.y)) {
      const facing = Math.abs(angDiff(p.angle, Math.atan2(g.y - p.y, g.x - p.x))) < 1.2;
      this.whiteout = Math.max(this.whiteout, facing ? 1.6 : 0.5);
      ring = facing;
    }
    this.lights.push({ x: g.x, y: g.y, r: 420, life: 0.35, max: 0.35, color: '255,255,255' });
    this.sparks(g.x, g.y, 0, 20, '255,255,230');
    for (let i = 0; i < 10; i++)
      this.particles.push({ kind: 'smoke', x: g.x, y: g.y, vx: rand(-60, 60), vy: rand(-60, 60), life: 2.5, max: 2.5, size: 10, grow: 30, color: '200,200,205' });
    this.shake = Math.max(this.shake, 8);
    audio.flashbang(ring);
    if (n > 0 && this.squad[0]) this.bubble(this.squad[0], `${n} STUNNED! MOVE IN!`, this.squad[0].op.color);
    if (this.tut) this.tut.flashStuns += n;
  }

  explode(b) {
    if (b.exploded) return;
    b.exploded = true;
    const R = 3.3 * T;
    this.explosionKills = 0;
    const p = this.player;
    for (const e of this.enemies) {
      if (e.state === 'down' || e.state === 'cuffed') continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d < R && this.los(b.x, b.y, e.x, e.y, blocksBullet)) this.damageEnemy(e, 140 * (1 - d / R) + 30, 'explosion', Math.atan2(e.y - b.y, e.x - b.x));
    }
    for (const h of this.hostages) {
      if (h.state !== 'bound') continue;
      const d = Math.hypot(h.x - b.x, h.y - b.y);
      if (d < R * 0.8 && this.los(b.x, b.y, h.x, h.y, blocksBullet)) this.killHostage(h);
    }
    const dp = Math.hypot(p.x - b.x, p.y - b.y);
    if (dp < R && this.los(b.x, b.y, p.x, p.y, blocksBullet)) this.damagePlayer(70 * (1 - dp / R) + 10);
    if (this.explosionKills >= 2) this.stats.explosionMulti = Math.max(this.stats.explosionMulti, this.explosionKills);
    for (const o of this.barrels) if (!o.exploded && Math.hypot(o.x - b.x, o.y - b.y) < R) setTimeout(() => this.explode(o), 150);
    this.boom(b.x, b.y, 1);
    this.tempFires.push({ x: b.x, y: b.y, life: 12, seed: Math.random() * 10, poly: this.visPoly(b.x, b.y, 5 * T, 90) });
    this.noise(b.x, b.y, 14 * T, p);
  }

  boom(x, y, s) {
    for (let i = 0; i < 46 * s; i++) {
      const a = rand(0, 6.28);
      const sp = rand(60, 380) * s;
      this.particles.push({ kind: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.9), max: 0.9, size: rand(6, 16) * s, color: '255,140,40' });
    }
    for (let i = 0; i < 24 * s; i++) {
      const a = rand(0, 6.28);
      const sp = rand(20, 120);
      this.particles.push({ kind: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(1.5, 3.5), max: 3.5, size: rand(10, 20), grow: 30, color: '60,58,60' });
    }
    this.sparks(x, y, 0, 30, '255,190,90');
    this.lights.push({ x, y, r: 380 * s, life: 0.6, max: 0.6, color: '255,150,60' });
    this.shake = Math.max(this.shake, 16 * s);
    const g = this.dctx2;
    const gr = g.createRadialGradient(x, y, 0, x, y, 70 * s);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, 70 * s, 0, 7);
    g.fill();
    const d = Math.hypot(this.player.x - x, this.player.y - y);
    audio.explosion(clamp(1.4 - d / (20 * T), 0.3, 1.2));
  }

  // ---------------- インタラクト ----------------
  findInteract() {
    const p = this.player;
    let best = null;
    let bd = 1e9;
    const consider = (o, d, data) => {
      if (d < bd) {
        bd = d;
        best = data;
      }
    };
    for (const e of this.enemies) {
      if (e.state !== 'surrender') continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 46) consider(e, d, { type: 'cuff', obj: e, dur: 0.85, label: '容疑者を拘束', x: e.x, y: e.y });
    }
    for (const h of this.hostages) {
      if (h.state !== 'bound') continue;
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < 46) consider(h, d, { type: 'rescue', obj: h, dur: 0.8, label: '人質を救出', x: h.x, y: h.y });
    }
    if (this.bomb && !this.bomb.defused) {
      const d = Math.hypot(this.bomb.x - p.x, this.bomb.y - p.y);
      if (d < 50) consider(this.bomb, d, { type: 'defuse', obj: this.bomb, dur: 3.2, label: '爆弾を解除（長押し）', x: this.bomb.x, y: this.bomb.y });
    }
    const tx = Math.floor(p.x / T);
    const ty = Math.floor(p.y / T);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (this.tile(tx + dx, ty + dy) !== 'D') continue;
        const cx = (tx + dx) * T + T / 2;
        const cy = (ty + dy) * T + T / 2;
        const d = Math.hypot(cx - p.x, cy - p.y);
        const locked = this.locked.has(`${tx + dx},${ty + dy}`);
        if (d < 52) consider(null, d + 8, { type: locked ? 'locked' : 'door', tx: tx + dx, ty: ty + dy, dur: 0, label: locked ? '施錠中（指示を待て）' : 'ドアを突破', x: cx, y: cy });
      }
    return best;
  }

  updateInteract(dt) {
    const it = this.findInteract();
    const same = it && this.interact && it.type === this.interact.type && it.obj === this.interact.obj && it.tx === this.interact.tx && it.ty === this.interact.ty;
    if (!same) this.interactProg = 0;
    this.interact = it;
    if (!it || it.type === 'door' || it.type === 'locked') {
      this.interactProg = 0;
      return;
    }
    if (this.keys.KeyE) {
      this.interactProg += dt / it.dur;
      if (it.type === 'defuse' && Math.random() < dt * 8) audio.beep(false);
      if (this.interactProg >= 1) {
        this.interactProg = 0;
        this.completeInteract(it);
      }
    } else this.interactProg = Math.max(0, this.interactProg - dt * 2);
  }

  completeInteract(it) {
    if (it.type === 'cuff') {
      it.obj.state = 'cuffed';
      it.obj.anim = 0;
      this.score.arrest += 300;
      this.stats.arrested++;
      this.floater(it.obj.x, it.obj.y - 26, 'ARRESTED +300', '#5ad1ff');
      audio.cuff();
      if (Math.random() < 0.5) this.radio(this.player.op.name, pick(['容疑者1名を確保。', '1名拘束、次へ進む。', '確保完了。']));
    } else if (it.type === 'rescue') {
      it.obj.state = 'escort';
      this.score.hostage += 500;
      this.stats.rescued++;
      this.floater(it.obj.x, it.obj.y - 26, 'HOSTAGE SECURED +500', '#7dff9a');
      audio.success();
      this.bubble(it.obj, 'THANK YOU...!', '#ffffff');
    } else if (it.type === 'defuse') {
      it.obj.defused = true;
      this.score.bomb += 1000;
      this.floater(it.obj.x, it.obj.y - 30, 'BOMB DEFUSED +1000', '#7dff9a');
      audio.success();
      this.radio('COMMAND', '爆弾解除を確認！ よくやった。残る脅威を排除せよ。');
    }
  }

  openDoor(tx, ty, kicked) {
    if (this.grid[ty][tx] !== 'D' || this.locked.has(`${tx},${ty}`)) return;
    this.grid[ty][tx] = 'd';
    this.flowCache.clear();
    const cx = tx * T + T / 2;
    const cy = ty * T + T / 2;
    if (kicked) {
      audio.kick();
      this.shake = Math.max(this.shake, 5);
      for (let i = 0; i < 14; i++) {
        const a = rand(0, 6.28);
        const sp = rand(60, 260);
        this.particles.push({ kind: 'debris', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 0.8), max: 0.8, size: rand(2, 4), color: '110,80,50', rot: rand(0, 6) });
      }
      for (let i = 0; i < 6; i++)
        this.particles.push({ kind: 'smoke', x: cx, y: cy, vx: rand(-30, 30), vy: rand(-30, 30), life: 1.2, max: 1.2, size: 8, grow: 22, color: '140,130,120' });
      const breacher = this.player.op.id === 'reyes';
      let stunned = 0;
      for (const e of this.enemies) {
        if (e.state === 'down' || e.state === 'cuffed' || e.state === 'surrender') continue;
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (breacher && d < 4 * T && this.los(cx, cy, e.x, e.y)) {
          e.stun = Math.max(e.stun, 2);
          stunned++;
          this.floater(e.x, e.y - 26, 'STUNNED', '#fff27a');
        }
      }
      this.noise(cx, cy, 7 * T, this.player);
      this.floater(cx, cy - 18, stunned ? `BREACH! ×${stunned}` : 'BREACH!', '#ffb347');
    }
  }

  // ---------------- 分隊AI ----------------
  updateSquad(dt) {
    const p = this.player;
    for (const s of this.squad) {
      s.fireCd -= dt;
      s.calloutCd -= dt;
      let tgt = null;
      let bd = 11 * T;
      for (const e of this.enemies) {
        if (e.state !== 'engage' || e.stun > 0) continue;
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        if (d < bd && this.los(s.x, s.y, e.x, e.y, blocksBullet)) {
          bd = d;
          tgt = e;
        }
      }
      // 陣形位置
      const back = p.angle + Math.PI + s.side * 0.75;
      const fx = p.x + Math.cos(back) * 46;
      const fy = p.y + Math.sin(back) * 46;
      let goal = { x: fx, y: fy };
      if (!this.boxFree(fx, fy, s.r) || !this.los(p.x, p.y, fx, fy, isSolid)) goal = { x: p.x, y: p.y };
      const dg = Math.hypot(goal.x - s.x, goal.y - s.y);
      s.moving = false;
      if (dg > 22) {
        const dp = Math.hypot(p.x - s.x, p.y - s.y);
        const sp = s.op.speed * (dp > 4 * T ? 1.45 : 1.05) * (tgt ? 0.6 : 1);
        const pd = this.pathDir(s, goal);
        if (pd.door) {
          const dd = Math.hypot(pd.door.x * T + T / 2 - s.x, pd.door.y * T + T / 2 - s.y);
          if (dd < 1.3 * T) this.openDoor(pd.door.x, pd.door.y, false);
        }
        const step = Math.min(sp * dt, dg);
        this.moveEnt(s, Math.cos(pd.a) * step, Math.sin(pd.a) * step);
        s.moving = true;
        s.walkT += dt * 10;
        if (!tgt) s.angle = turnTowards(s.angle, pd.a, 8 * dt);
      } else if (!tgt) {
        s.angle = turnTowards(s.angle, p.angle + s.side * 0.6, 4 * dt);
      }
      if (tgt) {
        const ta = Math.atan2(tgt.y - s.y, tgt.x - s.x);
        s.angle = turnTowards(s.angle, ta, 7 * dt);
        if (s.calloutCd <= 0) {
          s.calloutCd = 6;
          this.bubble(s, pick(['CONTACT!', 'HOSTILE!', 'ENGAGING!']), s.op.color);
        }
        if (s.fireCd <= 0 && Math.abs(angDiff(s.angle, ta)) < 0.15) {
          // 誤射チェック
          const blocked = [p, ...this.hostages.filter((h) => h.state === 'bound'), ...this.enemies.filter((e) => e.state === 'surrender' || e.state === 'cuffed')].some((o) => {
            if (o === tgt) return false;
            const dO = Math.hypot(o.x - s.x, o.y - s.y);
            if (dO > bd) return false;
            const off = Math.abs(angDiff(ta, Math.atan2(o.y - s.y, o.x - s.x)));
            return Math.sin(off) * dO < o.r + 8 && off < Math.PI / 2;
          });
          if (!blocked) {
            const w = s.op.weapon;
            s.fireCd = (60 / w.rpm) * (w.kind === 'smg' || w.kind === 'rifle' ? 2.4 : 1.6) * rand(0.8, 1.3);
            const pellets = Math.min(w.pellets, 5);
            const mx = s.x + Math.cos(s.angle) * (w.len + 8);
            const my = s.y + Math.sin(s.angle) * (w.len + 8);
            for (let i = 0; i < pellets; i++) {
              const a = s.angle + (Math.random() - 0.5) * 2 * (w.spread + 0.06);
              const res = this.hitscan(s.x, s.y, a, 20 * T, 'squad', w.dmg * 0.55);
              this.tracers.push({ x1: mx, y1: my, x2: res.x, y2: res.y, life: 0.06, max: 0.06, color: '200,230,255', w: 1.3 });
            }
            this.muzzle(mx, my, s.angle, 0.8);
            audio.shot(w.kind, 0.55, clamp((s.x - p.x) / 400, -1, 1));
          }
        }
      }
    }
  }

  // ---------------- 容疑者AI ----------------
  updateEnemy(e, dt) {
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.alertMark = Math.max(0, e.alertMark - dt);
    if (e.state === 'down' || e.state === 'cuffed') return;
    e.anim += dt;
    if (e.state === 'surrender') return;
    if (e.stun > 0) {
      e.stun -= dt;
      e.angle += Math.sin(e.anim * 7) * dt * 3;
      e.moving = false;
      return;
    }
    const p = this.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    const toP = Math.atan2(dy, dx);
    const alerted = e.state === 'engage' || e.state === 'search' || e.state === 'alert';
    const fov = alerted ? 2.6 : e.fov;
    const range = (alerted ? 13 : e.vision) * T;
    let sees = false;
    if (!this.ended && d < range && (d < 1.6 * T || Math.abs(angDiff(e.angle, toP)) < fov / 2) && this.los(e.x, e.y, p.x, p.y)) sees = true;
    e.moving = false;
    if (sees) {
      if (e.state !== 'engage') {
        e.reaction = e.reactBase * (e.state === 'search' || e.state === 'alert' ? 0.6 : 1) * (p.sprint ? 0.8 : 1);
        e.state = 'engage';
        e.alertMark = 1.2;
        if (!this.radioFlags.contact) {
          this.radioFlags.contact = true;
          this.radio(this.squad[1] ? this.squad[1].op.name : 'TEAM', 'コンタクト！ 武装した容疑者だ！');
        }
      }
      e.lastKnown = { x: p.x, y: p.y };
      e.lookT = 0;
      e.angle = turnTowards(e.angle, toP, e.turn * dt);
      e.reaction -= dt;
      if (e.reaction <= 0 && Math.abs(angDiff(e.angle, toP)) < 0.3) {
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          if (e.burstLeft <= 0) e.burstLeft = e.burst;
          this.enemyShoot(e);
          e.burstLeft--;
          e.fireCd = e.burstLeft > 0 ? 60 / e.rpm : e.burstPause * rand(0.7, 1.4);
        }
      }
      // 戦術移動
      e.strafeT -= dt;
      if (e.strafeT <= 0) {
        e.strafeT = rand(1, 2.5);
        e.strafe *= -1;
      }
      if (!e.anchored) {
        let ma;
        let sp = e.speed * 0.55;
        if (d > 6 * T) ma = this.pathDir(e, p).a;
        else if (d < 2.4 * T) ma = toP + Math.PI;
        else {
          ma = toP + (Math.PI / 2) * e.strafe;
          sp *= 0.6;
        }
        this.moveEnt(e, Math.cos(ma) * sp * dt, Math.sin(ma) * sp * dt);
        e.moving = true;
        e.walkT += dt * 8;
      }
    } else if (e.anchored && (e.state === 'engage' || e.state === 'search')) {
      // その場から動かない容疑者（人質のそばに立つ訓練用）は、最後に見た方向を向いて待つ
      e.state = 'search';
      if (e.lastKnown) e.angle = turnTowards(e.angle, Math.atan2(e.lastKnown.y - e.y, e.lastKnown.x - e.x), e.turn * dt);
    } else if (e.state === 'engage' || e.state === 'search') {
      e.state = 'search';
      const lk = e.lastKnown || e.home;
      const dd = Math.hypot(lk.x - e.x, lk.y - e.y);
      if (dd > T * 0.6 && e.lookT === 0) {
        const pd = this.pathDir(e, lk);
        if (pd.door) {
          const ddoor = Math.hypot(pd.door.x * T + T / 2 - e.x, pd.door.y * T + T / 2 - e.y);
          if (ddoor < 1.3 * T) this.openDoor(pd.door.x, pd.door.y, false);
        }
        const sp = e.speed * 0.8;
        const before = { x: e.x, y: e.y };
        this.moveEnt(e, Math.cos(pd.a) * sp * dt, Math.sin(pd.a) * sp * dt);
        e.angle = turnTowards(e.angle, pd.a, e.turn * dt);
        e.moving = true;
        e.walkT += dt * 9;
        if (Math.hypot(e.x - before.x, e.y - before.y) < 0.2 * sp * dt) e.stuck = (e.stuck || 0) + dt;
        else e.stuck = 0;
        if (e.stuck > 1.2) e.lookT = 0.01;
      } else {
        e.lookT += dt;
        e.angle += dt * 1.6 * Math.sin(e.lookT * 1.3);
        if (e.lookT > 5) {
          e.state = 'alert';
          e.home = { x: e.x, y: e.y };
          e.baseAngle = e.angle;
          e.patrol = null;
          e.lookT = 0;
        }
      }
    } else if (e.patrol && e.state === 'idle') {
      const tgt = e.patrolDir > 0 ? e.patrol : e.home;
      const dd = Math.hypot(tgt.x - e.x, tgt.y - e.y);
      if (dd < 6) {
        e.patrolDir *= -1;
        e.pauseT = rand(1.2, 2.5);
      }
      if (e.pauseT > 0) {
        e.pauseT -= dt;
        e.angle += dt * 0.8 * Math.sin(e.anim);
      } else {
        const a = Math.atan2(tgt.y - e.y, tgt.x - e.x);
        this.moveEnt(e, Math.cos(a) * 42 * dt, Math.sin(a) * 42 * dt);
        e.angle = turnTowards(e.angle, a, 3 * dt);
        e.moving = true;
        e.walkT += dt * 5;
      }
    } else {
      e.angle = e.baseAngle + Math.sin(e.anim * 0.55 + e.phase) * 0.9;
    }
  }

  enemyShoot(e) {
    const p = this.player;
    const a = e.angle + (Math.random() - 0.5) * 2 * e.spread * (this.player.moving ? 1.25 : 1);
    const res = this.hitscan(e.x, e.y, a, 22 * T, 'enemy', e.dmg);
    const mx = e.x + Math.cos(e.angle) * 24;
    const my = e.y + Math.sin(e.angle) * 24;
    this.tracers.push({ x1: mx, y1: my, x2: res.x, y2: res.y, life: 0.07, max: 0.07, color: '255,140,80', w: 1.6 });
    this.muzzle(mx, my, e.angle, e.heavy ? 1.1 : 0.9);
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    audio.shot('enemy', clamp(1.2 - d / (18 * T), 0.15, 1), clamp((e.x - p.x) / 500, -1, 1));
    // 銃声で周囲の仲間が反応
    for (const o of this.enemies) {
      if (o === e || o.state !== 'idle') continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) < 9 * T) {
        o.state = 'search';
        o.lastKnown = { x: p.x, y: p.y };
        o.lookT = 0;
        o.alertMark = 1.2;
      }
    }
  }

  // ---------------- 人質 ----------------
  updateHostages(dt) {
    const exit = { x: this.exRect.x + this.exRect.w / 2, y: this.exRect.y + this.exRect.h / 2 };
    for (const h of this.hostages) {
      h.anim += dt;
      if (h.state === 'escort') {
        const target = h.exit || exit;
        const d = Math.hypot(target.x - h.x, target.y - h.y);
        if (d < 30) {
          h.state = 'safe';
          continue;
        }
        const pd = this.pathDir(h, target);
        if (pd.door) this.openDoor(pd.door.x, pd.door.y, false);
        this.moveEnt(h, Math.cos(pd.a) * 140 * dt, Math.sin(pd.a) * 140 * dt);
        h.angle = turnTowards(h.angle, pd.a, 8 * dt);
        h.walkT = (h.walkT || 0) + dt * 12;
      }
    }
  }

  // ---------------- 爆弾 ----------------
  updateBomb(dt) {
    const b = this.bomb;
    if (!b || b.defused || b.exploded || this.ended) return;
    b.timer -= dt;
    b.beepT -= dt;
    const urgent = b.timer < 30;
    if (b.beepT <= 0) {
      b.beepT = urgent ? 0.5 : 1.0;
      const d = Math.hypot(b.x - this.player.x, b.y - this.player.y);
      if (d < 12 * T || urgent) audio.beep(urgent);
    }
    if (b.timer <= 60 && !this.radioFlags.b60) {
      this.radioFlags.b60 = true;
      this.radio('COMMAND', '起爆まで残り60秒！ 急げ！');
    }
    if (b.timer <= 20 && !this.radioFlags.b20) {
      this.radioFlags.b20 = true;
      this.radio('COMMAND', '残り20秒！ 解除できなければ退避しろ！');
    }
    if (b.timer <= 0) {
      b.timer = 0;
      b.exploded = true;
      this.boom(b.x, b.y, 2.2);
      this.whiteout = 2;
      if (this.tutorial) this.tutFail('爆弾が起爆した。ドローンで場所を確かめ、最短ルートで向かえ。');
      else this.fail('DETONATION', '爆弾が起爆した。');
    }
  }

  // ---------------- 目標判定 ----------------
  objectives() {
    const sus = this.enemies.filter((e) => e.state === 'down' || e.state === 'cuffed').length;
    const host = this.hostages.filter((h) => h.state === 'escort' || h.state === 'safe').length;
    const bombOk = !this.bomb || this.bomb.defused;
    return {
      suspects: sus,
      suspectsTotal: this.enemies.length,
      hostages: host,
      hostagesTotal: this.hostages.length,
      bomb: this.bomb ? { defused: this.bomb.defused, timer: this.bomb.timer } : null,
      allDone: sus === this.enemies.length && host === this.hostages.length && bombOk,
    };
  }

  inExtraction(o) {
    const r = this.exRect;
    return o.x > r.x && o.x < r.x + r.w && o.y > r.y && o.y < r.y + r.h;
  }

  checkObjectives() {
    if (this.tutorial) {
      this.updateTutorial();
      return;
    }
    const ob = this.objectives();
    if (ob.allDone && !this.radioFlags.clear) {
      this.radioFlags.clear = true;
      this.radio('COMMAND', 'エリアクリアを確認。撤収ポイントへ戻れ。');
      audio.success();
    }
    if (ob.allDone && this.inExtraction(this.player)) this.win();
  }

  calcResult(success, reason, detail) {
    const m = this.mission;
    const t = this.time;
    const timeBonus = success ? Math.round(clamp(1.5 - t / m.par, 0, 1) * 600) : 0;
    const healthBonus = success ? Math.round((this.player.hp / this.player.maxHp) * 300) : 0;
    const acc = this.stats.shots ? this.stats.hits / this.stats.shots : 1;
    const accBonus = success ? Math.round(acc * 300) : 0;
    const s = this.score;
    const total = Math.max(0, s.neutralize + s.arrest + s.hostage + s.bomb + s.penalty + timeBonus + healthBonus + accBonus);
    const maxScore = this.enemies.length * 300 + this.hostages.length * 500 + (this.bomb ? 1000 : 0) + 600 + 300 + 300;
    const ratio = total / maxScore;
    const rank = !success ? '-' : ratio >= 0.8 ? 'S' : ratio >= 0.64 ? 'A' : ratio >= 0.48 ? 'B' : 'C';
    return {
      success,
      reason,
      detail,
      missionId: m.id,
      missionIndex: this.opts.missionIndex,
      missionCode: m.code,
      opId: this.op.id,
      time: Math.round(t * 10) / 10,
      score: total,
      rank,
      breakdown: [
        ['容疑者 無力化', s.neutralize],
        ['容疑者 逮捕', s.arrest],
        ['人質 救出', s.hostage],
        ...(this.bomb ? [['爆弾 解除', s.bomb]] : []),
        ['タイムボーナス', timeBonus],
        ['体力ボーナス', healthBonus],
        ['命中率ボーナス', accBonus],
        ['規律違反', s.penalty],
      ],
      stats: { ...this.stats, accuracy: acc },
    };
  }

  win() {
    if (this.ended) return;
    this.ended = true;
    this.endTimer = 1.6;
    this.result = this.calcResult(true, 'MISSION COMPLETE', '全目標を達成し、全隊員が無事帰還した。');
    this.radio('COMMAND', '全隊員の撤収を確認。見事な仕事だ、チーム。');
    this.squad.forEach((s, i) => setTimeout(() => this.bubble(s, pick(['GOOD WORK.', 'WE\'RE CLEAR.', 'ALL GOOD.']), s.op.color), 200 + i * 300));
    audio.success();
  }

  fail(reason, detail) {
    if (this.ended) return;
    this.ended = true;
    this.endTimer = 2.4;
    this.result = this.calcResult(false, reason, detail);
    this.radio('COMMAND', `作戦中止。${detail}`);
  }

  // ---------------- チュートリアル ----------------
  initTutorial(ci) {
    // 数字マーカー（各区画の入口）の隣にあるドアは、指示があるまで施錠しておく
    for (const [ch, list] of Object.entries(this.marks)) {
      if (!/[0-9]/.test(ch)) continue;
      for (const m of list)
        for (const [dx, dy] of DIRS4) if (this.tile(m.tx + dx, m.ty + dy) === 'D') this.locked.add(`${m.tx + dx},${m.ty + dy}`);
    }
    this.tut = {
      ci: clamp(ci | 0, 0, TUTORIAL.length - 1),
      si: 0,
      state: 'run', // run / done / reset / finished
      timer: 0,
      stepT: 0,
      sprintT: 0,
      reloads: 0,
      flashStuns: 0,
      ents: [],
      stepPos: null,
      cleared: 0,
      readT: 0, // 指示を大きく表示している残り秒数
      briefed: new Set(), // 読み終えた項目（やり直しでは大きく表示しない）
    };
    this.tutEnterChapter();
  }

  tutStep() {
    const t = this.tut;
    const ch = TUTORIAL[t.ci];
    return ch ? ch.steps[t.si] : null;
  }

  // 章の開始：隊員の切り替えと、章の最初の位置への移動
  tutEnterChapter() {
    const ch = TUTORIAL[this.tut.ci];
    const opId = ch.op || this.opts.opId;
    if (opId !== this.op.id) this.setOperator(opId);
    this.tutRestore();
    const first = ch.steps[0];
    if (first.start) this.tutTeleport(first.start);
    this.tutBeginStep();
  }

  tutBeginStep() {
    const t = this.tut;
    const step = this.tutStep();
    Object.assign(t, { state: 'run', timer: 0, stepT: 0, sprintT: 0, reloads: 0, flashStuns: 0, ents: [] });
    if (step.setup) step.setup(this);
    t.stepPos = { x: this.player.x, y: this.player.y };
    t.readT = step.info || t.briefed.has(step.id) ? 0 : READ_TIME;
    if (t.readT > 0) {
      this.player.moving = false;
      this.player.sprint = false;
      this.interact = null;
      this.interactProg = 0;
    }
  }

  // 指示を読むための待ち時間中か
  get frozen() {
    return !!this.tut && this.tut.state === 'run' && this.tut.readT > 0;
  }

  updateReading(dt) {
    const t = this.tut;
    t.readT = Math.max(0, t.readT - dt);
    if (t.readT === 0) t.briefed.add(this.tutStep().id);
  }

  tutAdvance() {
    const t = this.tut;
    t.si++;
    if (t.si >= TUTORIAL[t.ci].steps.length) {
      t.ci++;
      t.si = 0;
      if (t.ci >= TUTORIAL.length) {
        this.tutFinish();
        return;
      }
      this.tutEnterChapter();
      return;
    }
    this.tutBeginStep();
  }

  // 説明だけの項目を読み終えた（ENTER / NEXT ボタン）
  tutNext() {
    const t = this.tut;
    const step = t && this.tutStep();
    if (!step || !step.info || t.state !== 'run' || this.paused) return;
    audio.radio();
    if (step.final) this.tutFinish();
    else this.tutAdvance();
  }

  // 今の項目を飛ばして次へ
  tutSkip() {
    const t = this.tut;
    if (!t || t.state === 'finished' || this.paused) return;
    const step = this.tutStep();
    if (step.info) {
      this.tutNext();
      return;
    }
    this.tutDespawn();
    const ci = t.ci;
    this.tutAdvance();
    const next = this.tutStep();
    if (t.state !== 'finished' && t.ci === ci && next && next.start) {
      // 次の項目の開始位置に移り、配置をやり直す
      this.tutDespawn();
      this.tutTeleport(next.start);
      this.tutBeginStep();
    }
  }

  // 今の項目を最初からやり直す
  tutRetry() {
    const t = this.tut;
    if (!t || t.state === 'finished') return;
    this.tutResetStep();
  }

  tutFail(msg) {
    const t = this.tut;
    if (!t || t.state !== 'run') return;
    t.state = 'reset';
    t.timer = 2;
    this.floater(this.player.x, this.player.y - 34, 'RETRY', '#ff7a5a');
    this.radio('INSTRUCTOR', msg);
    audio.empty();
  }

  tutResetStep() {
    const step = this.tutStep();
    this.tutDespawn();
    this.tutRestore();
    if (step.start) this.tutTeleport(step.start);
    else if (this.tut.stepPos) this.tutTeleport(this.tut.stepPos);
    this.tutBeginStep();
  }

  // 体力・弾薬・アビリティを元に戻す
  tutRestore() {
    const p = this.player;
    p.hp = p.maxHp;
    p.mag = p.op.weapon.mag;
    p.reloadT = 0;
    p.abilityCd = 0;
    this.focusT = 0;
    this.droneT = 0;
    this.whiteout = 0;
    this.hurtFlash = 0;
    this.grenades = [];
    this.interactProg = 0;
    this.radioFlags.lowhp = false;
  }

  tutDespawn() {
    const ents = new Set(this.tut.ents);
    this.enemies = this.enemies.filter((o) => !ents.has(o));
    this.hostages = this.hostages.filter((o) => !ents.has(o));
    this.barrels = this.barrels.filter((o) => !ents.has(o));
    this.targets = this.targets.filter((o) => !ents.has(o));
    if (this.bomb && ents.has(this.bomb)) this.bomb = null;
    this.bubbles = this.bubbles.filter((b) => !ents.has(b.ent));
    this.tut.ents = [];
  }

  tutFinish() {
    const t = this.tut;
    if (t.state === 'finished') return;
    t.state = 'finished';
    this.ended = true;
    this.endTimer = 0.4;
    this.result = {
      success: true,
      tutorial: true,
      reason: 'TRAINING COMPLETE',
      detail: '全訓練課程を修了した。',
      missionId: this.mission.id,
      missionIndex: this.opts.missionIndex,
      missionCode: this.mission.code,
      opId: this.op.id,
      time: Math.round(this.time * 10) / 10,
      score: 0,
      rank: '-',
      breakdown: [],
      stats: { ...this.stats, accuracy: this.stats.shots ? this.stats.hits / this.stats.shots : 1 },
    };
  }

  updateTutorial() {
    const t = this.tut;
    if (!t || t.state === 'finished') return;
    const dt = this.rdt || 0;
    const step = this.tutStep();
    t.stepT += dt;
    if (this.player.sprint) t.sprintT += dt;
    if (t.state === 'done') {
      t.timer -= dt;
      if (t.timer <= 0) this.tutAdvance();
      return;
    }
    if (t.state === 'reset') {
      t.timer -= dt;
      if (t.timer <= 0) this.tutResetStep();
      return;
    }
    if (step.info) return;
    const f = step.fail && step.fail(this);
    if (f) {
      this.tutFail(f);
      return;
    }
    if (step.check && step.check(this)) {
      t.state = 'done';
      t.timer = 1.4;
      t.cleared++;
      audio.success();
      this.floater(this.player.x, this.player.y - 34, 'CLEAR', '#7dff9a');
      this.radio('INSTRUCTOR', pick(['よし、合格だ。', 'いいぞ。その調子だ。', '上出来だ。次へ進め。', '問題ない。次だ。']));
    }
  }

  setOperator(id) {
    const op = getOp(id);
    const p = this.player;
    this.op = op;
    p.op = op;
    p.maxHp = op.hp;
    p.hp = op.hp;
    p.mag = op.weapon.mag;
    p.reloadT = 0;
    p.fireCd = 0;
    p.abilityCd = 0;
    this.bloom = 0;
  }

  tutTeleport(m) {
    const pos = typeof m === 'string' ? this.tutMark(m) : m;
    if (!pos) return;
    const p = this.player;
    p.x = pos.x;
    p.y = pos.y;
    if (this.cam) {
      this.cam.x = p.x;
      this.cam.y = p.y;
    }
    this.interactProg = 0;
    this.updateExplored();
  }

  // ---- 台本（tutorial.js）から使う道具 ----
  tutMarks(ch) {
    return this.marks[ch] || [];
  }
  tutMark(ch) {
    return this.tutMarks(ch)[0];
  }
  near(ch, r) {
    const m = this.tutMark(ch);
    return !!m && Math.hypot(m.x - this.player.x, m.y - this.player.y) < r * T;
  }
  unlock(ch) {
    for (const m of this.tutMarks(ch)) for (const [dx, dy] of DIRS4) this.locked.delete(`${m.tx + dx},${m.ty + dy}`);
  }
  doorOpen(ch) {
    return this.tutMarks(ch).some((m) => DIRS4.some(([dx, dy]) => this.tile(m.tx + dx, m.ty + dy) === 'd'));
  }
  spawnEnemies(ch, o = {}) {
    return this.tutMarks(ch).map((m) => {
      const e = this.makeEnemy(m.x, m.y, !!o.heavy);
      if (o.angle !== undefined) {
        e.angle = o.angle;
        e.baseAngle = o.angle;
      }
      e.surrender = o.surrender || null;
      e.anchored = !!o.anchored;
      e._tk = 'enemy';
      this.enemies.push(e);
      this.tut.ents.push(e);
      return e;
    });
  }
  spawnHostages(ch, exitCh) {
    const exit = exitCh ? this.tutMark(exitCh) : null;
    for (const m of this.tutMarks(ch)) {
      const h = { x: m.x, y: m.y, r: 12, state: 'bound', angle: rand(0, 6.28), anim: rand(0, 10), sobT: 0, exit, _tk: 'hostage' };
      this.hostages.push(h);
      this.tut.ents.push(h);
    }
  }
  spawnBarrels(ch) {
    for (const m of this.tutMarks(ch)) {
      const b = { x: m.x, y: m.y, r: 14, hp: 30, exploded: false, _tk: 'barrel' };
      this.barrels.push(b);
      this.tut.ents.push(b);
    }
  }
  spawnTargets(ch) {
    for (const m of this.tutMarks(ch)) {
      const tg = { x: m.x, y: m.y, r: 13, down: false, fallA: 0, _tk: 'target' };
      this.targets.push(tg);
      this.tut.ents.push(tg);
    }
  }
  spawnBomb(ch, time) {
    const m = this.tutMark(ch);
    if (!m) return;
    this.bomb = { x: m.x, y: m.y, defused: false, timer: time, beepT: 0, _tk: 'bomb' };
    this.radioFlags.b60 = time <= 60;
    this.radioFlags.b20 = false;
    this.tut.ents.push(this.bomb);
  }
  // 今の目的地（ワールド座標）
  tutGoal() {
    const t = this.tut;
    if (!t || t.state !== 'run') return null;
    const step = this.tutStep();
    if (!step || !step.goal) return null;
    if (step.goal === 'extract') return { x: this.exRect.x + this.exRect.w / 2, y: this.exRect.y + this.exRect.h / 2, extract: true };
    return this.tutMark(step.goal);
  }
  tutHud() {
    const t = this.tut;
    const step = this.tutStep();
    return {
      ci: t.ci,
      si: t.si,
      state: t.state,
      readT: t.readT,
      readMax: READ_TIME,
      progress: step && step.progress && t.state !== 'finished' ? step.progress(this) : null,
    };
  }

  // ---------------- エフェクト ----------------
  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 1.4, max: 1.4 });
  }

  bubble(ent, text, color) {
    this.bubbles = this.bubbles.filter((b) => b.ent !== ent);
    this.bubbles.push({ ent, text, color, life: 1.8, max: 1.8 });
  }

  radio(from, text) {
    audio.radio();
    this.opts.onRadio && this.opts.onRadio({ from, text, id: Math.random() });
  }

  updateEffects(dt, rdt) {
    for (const pa of this.particles) {
      pa.x += pa.vx * dt;
      pa.y += pa.vy * dt;
      const drag = pa.kind === 'smoke' ? 0.4 : pa.kind === 'fire' ? 0.05 : 0.02;
      const f = Math.pow(drag, dt);
      pa.vx *= f;
      pa.vy *= f;
      if (pa.grow) pa.size += pa.grow * dt;
      if (pa.kind === 'fire') pa.size *= Math.pow(0.4, dt);
      pa.life -= dt;
    }
    this.particles = this.particles.filter((pa) => pa.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    for (const t of this.tracers) t.life -= rdt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const l of this.lights) l.life -= rdt;
    this.lights = this.lights.filter((l) => l.life > 0);
    for (const f of this.floaters) {
      f.life -= rdt;
      f.y -= 24 * rdt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const b of this.bubbles) b.life -= rdt;
    this.bubbles = this.bubbles.filter((b) => b.life > 0);
    // 炎
    const allFires = [...this.fires, ...this.tempFires];
    for (const f of allFires) {
      if (Math.random() < dt * 22) {
        this.particles.push({ kind: 'fire', x: f.x + rand(-7, 7), y: f.y + rand(-7, 7), vx: rand(-14, 14), vy: rand(-50, -20), life: rand(0.3, 0.7), max: 0.7, size: rand(5, 10), color: '255,130,40' });
      }
      if (Math.random() < dt * 4)
        this.particles.push({ kind: 'smoke', x: f.x, y: f.y - 6, vx: rand(-10, 10), vy: rand(-40, -20), life: 2.2, max: 2.2, size: 6, grow: 16, color: '50,48,50' });
      if (Math.random() < dt * 3) this.particles.push({ kind: 'spark', x: f.x, y: f.y, vx: rand(-30, 30), vy: rand(-110, -50), life: 1.0, max: 1.0, size: 1.4, color: '255,170,70' });
    }
    for (const f of this.tempFires) f.life -= dt;
    this.tempFires = this.tempFires.filter((f) => f.life > 0);
    for (const sp of this.screenP) {
      sp.x += (sp.vx + Math.sin(this.realTime * 0.8 + sp.ph) * 0.01) * rdt;
      sp.y += sp.vy * rdt;
      if (sp.y < -0.06 || sp.y > 1.06 || sp.x < -0.05 || sp.x > 1.05) Object.assign(sp, this.newScreenParticle(false));
    }
  }

  updateExplored() {
    const p = this.player;
    const n = 120;
    const maxD = (p.op.light + 1) * T;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = this.castRay(p.x, p.y, a, maxD, blocksSight);
      for (let s = 0; s <= d + T * 0.5; s += T / 2) {
        const tx = Math.floor((p.x + Math.cos(a) * s) / T);
        const ty = Math.floor((p.y + Math.sin(a) * s) / T);
        if (tx >= 0 && ty >= 0 && tx < this.W && ty < this.H) this.explored[ty * this.W + tx] = 1;
      }
    }
  }

  emitHud() {
    if (!this.opts.onHud) return;
    const p = this.player;
    const ob = this.objectives();
    this.opts.onHud({
      hp: p.hp,
      maxHp: p.maxHp,
      mag: p.mag,
      magMax: p.op.weapon.mag,
      reload: p.reloadT > 0 ? 1 - p.reloadT / p.op.weapon.reload : 0,
      abilityCd: p.abilityCd,
      abilityMax: p.op.ability.cd,
      abilityActive: this.focusT > 0 ? this.focusT / 5 : this.droneT > 0 ? this.droneT / 7 : 0,
      interact: this.interact ? { label: this.interact.label, prog: this.interactProg, hold: this.interact.type !== 'door' && this.interact.type !== 'locked' } : null,
      objectives: ob,
      time: this.time,
      score: Math.max(0, this.score.neutralize + this.score.arrest + this.score.hostage + this.score.bomb + this.score.penalty),
      ended: this.ended,
      opId: this.op.id,
      tutorial: this.tut ? this.tutHud() : null,
    });
  }

  // ---------------- 描画 ----------------
  render() {
    const ctx = this.ctx;
    const vw = this.vw;
    const vh = this.vh;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    const z = this.zoom;
    const camX = this.cam.x - vw / z / 2 + sx / z;
    const camY = this.cam.y - vh / z / 2 + sy / z;
    this.camX = camX;
    this.camY = camY;
    ctx.fillStyle = '#06080b';
    ctx.fillRect(0, 0, vw, vh);

    ctx.save();
    ctx.scale(z, z);
    ctx.translate(-camX, -camY);
    ctx.drawImage(this.mapCanvas, 0, 0);
    ctx.drawImage(this.decalCanvas, 0, 0);
    this.drawExtraction(ctx, false);
    this.drawDoors(ctx);
    this.drawVan(ctx);
    for (const f of this.fires) this.drawFireBarrel(ctx, f);
    for (const m of this.medkits) if (!m.taken) this.drawMedkit(ctx, m);
    if (this.bomb) this.drawBomb(ctx, this.bomb);
    for (const b of this.barrels) if (!b.exploded) this.drawBarrel(ctx, b);
    for (const tg of this.targets) this.drawTarget(ctx, tg);
    for (const pa of this.particles) if (pa.kind === 'debris' || pa.kind === 'dust') this.drawParticle(ctx, pa);
    for (const e of this.enemies) if (e.state === 'down') this.drawEnemy(ctx, e);
    for (const h of this.hostages) if (h.state !== 'safe') this.drawHostage(ctx, h);
    for (const e of this.enemies) if (e.state !== 'down') this.drawEnemy(ctx, e);
    for (const s of this.squad) this.drawOperator(ctx, s, false);
    this.drawOperator(ctx, this.player, true);
    for (const g of this.grenades) this.drawGrenade(ctx, g);
    for (const pa of this.particles) if (pa.kind === 'smoke') this.drawParticle(ctx, pa);
    ctx.restore();

    this.renderDarkness(camX, camY);
    ctx.drawImage(this.darkCanvas, 0, 0, vw, vh);

    // 加算光
    ctx.save();
    ctx.scale(z, z);
    ctx.translate(-camX, -camY);
    ctx.globalCompositeOperation = 'lighter';
    const t = this.realTime;
    for (const f of [...this.fires, ...this.tempFires]) {
      const fl = 0.75 + Math.sin(t * 13 + f.seed) * 0.1 + Math.sin(t * 7.3 + f.seed * 2) * 0.1;
      const r = 150 * fl * (f.life !== undefined ? Math.min(1, f.life / 3) : 1);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, 'rgba(255,120,30,0.38)');
      g.addColorStop(1, 'rgba(255,80,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
    }
    if (this.van) this.drawVanLights(ctx);
    for (const l of this.lights) {
      const a = l.life / l.max;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.6);
      g.addColorStop(0, `rgba(${l.color},${0.55 * a})`);
      g.addColorStop(1, `rgba(${l.color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    for (const tr of this.tracers) {
      const a = tr.life / tr.max;
      ctx.strokeStyle = `rgba(${tr.color},${0.9 * a})`;
      ctx.lineWidth = tr.w;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
    }
    for (const pa of this.particles) if (pa.kind === 'spark' || pa.kind === 'fire') this.drawParticle(ctx, pa);
    ctx.globalCompositeOperation = 'source-over';
    this.drawExtraction(ctx, true);
    if (this.tut) this.drawTutorialMarks(ctx);
    if (this.droneT > 0) this.drawDroneReveal(ctx);
    this.drawIndicators(ctx);
    for (const f of this.floaters) {
      const a = Math.min(1, f.life / 0.4);
      ctx.globalAlpha = a;
      ctx.font = '700 13px Bahnschrift, "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
    for (const b of this.bubbles) this.drawBubble(ctx, b);
    ctx.restore();

    this.drawOffscreenArrows(ctx, camX, camY);
    this.drawScreenFx(ctx);
    if (!this.paused && !this.ended) this.drawCrosshair(ctx);
  }

  renderDarkness(camX, camY) {
    const d = this.dctx;
    const vw = this.vw;
    const vh = this.vh;
    const z = this.zoom;
    d.setTransform(this.dpr * z, 0, 0, this.dpr * z, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.fillStyle = 'rgba(3,5,9,0.9)';
    d.fillRect(0, 0, vw / z, vh / z);
    d.globalCompositeOperation = 'destination-out';
    d.save();
    d.translate(-camX, -camY);
    d.globalAlpha = 0.55;
    d.drawImage(this.outsideMask, 0, 0);
    d.globalAlpha = 1;
    const p = this.player;
    const range = p.op.light * T;
    this.playerPoly = this.visPoly(p.x, p.y, range, 280);
    this.cutLight(d, p.x, p.y, p.angle, this.playerPoly, range, 1);
    for (const s of this.squad) {
      const poly = this.visPoly(s.x, s.y, 8 * T, 110);
      this.cutLight(d, s.x, s.y, s.angle, poly, 8 * T, 0.6);
    }
    const t = this.realTime;
    for (const f of [...this.fires, ...this.tempFires]) {
      const fl = 0.82 + Math.sin(t * 11 + f.seed) * 0.08 + Math.sin(t * 5.1 + f.seed) * 0.08;
      const r = 5 * T * fl * (f.life !== undefined ? Math.min(1, f.life / 3) : 1);
      d.save();
      this.polyPath(d, f.poly);
      d.clip();
      const g = d.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.9)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(f.x - r, f.y - r, r * 2, r * 2);
      d.restore();
    }
    for (const l of this.lights) {
      const a = l.life / l.max;
      const g = d.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, `rgba(0,0,0,${0.85 * a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    if (this.van) {
      const on = Math.floor(t * 6) % 2;
      const vx = this.van.x + this.van.w / 2;
      const vy = this.van.y + this.van.h / 2;
      const g = d.createRadialGradient(vx, vy, 0, vx, vy, 4 * T);
      g.addColorStop(0, `rgba(0,0,0,${on ? 0.6 : 0.45})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(vx - 4 * T, vy - 4 * T, 8 * T, 8 * T);
    }
    d.restore();
  }

  polyPath(c, poly) {
    c.beginPath();
    c.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) c.lineTo(poly[i], poly[i + 1]);
    c.closePath();
  }

  cutLight(d, x, y, ang, poly, range, strength) {
    d.save();
    this.polyPath(d, poly);
    d.clip();
    let g = d.createRadialGradient(x, y, 0, x, y, 3 * T);
    g.addColorStop(0, `rgba(0,0,0,${0.95 * strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.fillRect(x - 3 * T, y - 3 * T, 6 * T, 6 * T);
    const cone = (half, alpha) => {
      g = d.createRadialGradient(x, y, T * 0.4, x, y, range);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.85})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.beginPath();
      d.moveTo(x, y);
      d.arc(x, y, range, ang - half, ang + half);
      d.closePath();
      d.fill();
    };
    cone(0.78, 0.45 * strength);
    cone(0.5, 0.9 * strength);
    d.restore();
  }

  drawParticle(ctx, pa) {
    const a = Math.max(0, pa.life / pa.max);
    if (pa.kind === 'spark') {
      ctx.strokeStyle = `rgba(${pa.color},${a})`;
      ctx.lineWidth = pa.size;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pa.x - pa.vx * 0.025, pa.y - pa.vy * 0.025);
      ctx.stroke();
    } else if (pa.kind === 'fire') {
      ctx.fillStyle = `rgba(${pa.color},${0.28 * a})`;
      ctx.beginPath();
      ctx.arc(pa.x, pa.y, pa.size, 0, 7);
      ctx.fill();
      ctx.fillStyle = `rgba(255,225,150,${0.5 * a})`;
      ctx.beginPath();
      ctx.arc(pa.x, pa.y, pa.size * 0.45, 0, 7);
      ctx.fill();
    } else if (pa.kind === 'smoke') {
      ctx.fillStyle = `rgba(${pa.color},${0.22 * a})`;
      ctx.beginPath();
      ctx.arc(pa.x, pa.y, pa.size, 0, 7);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(${pa.color},${a})`;
      ctx.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
    }
  }

  drawDoors(ctx) {
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        const c = this.grid[y][x];
        if (c !== 'D' && c !== 'd') continue;
        const px = x * T;
        const py = y * T;
        const horiz = this.tile(x - 1, y) === '#' || this.tile(x + 1, y) === '#';
        ctx.fillStyle = '#1e232a';
        if (c === 'D') {
          ctx.fillStyle = '#4b3a2a';
          if (horiz) ctx.fillRect(px, py + T / 2 - 6, T, 12);
          else ctx.fillRect(px + T / 2 - 6, py, 12, T);
          ctx.fillStyle = '#6c5640';
          if (horiz) ctx.fillRect(px, py + T / 2 - 6, T, 3);
          else ctx.fillRect(px + T / 2 - 6, py, 3, T);
          ctx.fillStyle = '#c8a060';
          if (horiz) ctx.fillRect(px + T - 10, py + T / 2 - 2, 4, 4);
          else ctx.fillRect(px + T / 2 - 2, py + T - 10, 4, 4);
        } else {
          ctx.fillStyle = '#3a2d20';
          if (horiz) ctx.fillRect(px + 1, py + T / 2, 6, T * 0.9);
          else ctx.fillRect(px + T / 2, py + 1, T * 0.9, 6);
        }
      }
  }

  drawExtraction(ctx, top) {
    const r = this.exRect;
    const goal = this.tut ? this.tutGoal() : null;
    const ready = this.tut ? !!(goal && goal.extract) : this.objectives().allDone;
    const t = this.realTime;
    if (!top) {
      ctx.fillStyle = ready ? `rgba(80,255,140,${0.08 + Math.sin(t * 4) * 0.04})` : 'rgba(80,255,140,0.04)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      return;
    }
    ctx.strokeStyle = ready ? `rgba(110,255,160,${0.7 + Math.sin(t * 5) * 0.3})` : 'rgba(110,255,160,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -t * 20;
    ctx.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
    ctx.setLineDash([]);
    ctx.fillStyle = ready ? '#8dffb4' : 'rgba(140,255,180,0.5)';
    ctx.font = '700 12px Bahnschrift, "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EXTRACTION', r.x + r.w / 2, r.y + r.h / 2 + 4);
  }

  drawVan(ctx) {
    if (!this.van) return;
    const v = this.van;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(v.x + 6, v.y + 10, v.w - 4, v.h - 6);
    const g = ctx.createLinearGradient(v.x, v.y, v.x, v.y + v.h);
    g.addColorStop(0, '#2a3443');
    g.addColorStop(1, '#141a22');
    ctx.fillStyle = g;
    this.roundRect(ctx, v.x + 4, v.y + 6, v.w - 8, v.h - 12, 10);
    ctx.fill();
    ctx.fillStyle = '#0d1117';
    this.roundRect(ctx, v.x + v.w - 40, v.y + 12, 26, v.h - 24, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(v.x + 22 + i * 22, v.y + 14);
      ctx.lineTo(v.x + 22 + i * 22, v.y + v.h - 14);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '800 20px Bahnschrift, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SWAT', v.x + v.w / 2 - 14, v.y + v.h / 2 + 7);
    const on = Math.floor(this.realTime * 6) % 2;
    ctx.fillStyle = on ? '#ff3030' : '#501010';
    ctx.fillRect(v.x + v.w - 46, v.y + 14, 6, v.h / 2 - 14);
    ctx.fillStyle = on ? '#202060' : '#3050ff';
    ctx.fillRect(v.x + v.w - 46, v.y + v.h / 2, 6, v.h / 2 - 14);
    ctx.restore();
  }

  drawVanLights(ctx) {
    const v = this.van;
    const t = this.realTime;
    const on = Math.floor(t * 6) % 2;
    const lx = v.x + v.w - 43;
    const ly1 = v.y + v.h * 0.3;
    const ly2 = v.y + v.h * 0.7;
    const glow = (x, y, col, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 160);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - 160, y - 160, 320, 320);
    };
    glow(lx, ly1, '255,40,40', on ? 0.35 : 0.05);
    glow(lx, ly2, '40,90,255', on ? 0.05 : 0.38);
  }

  drawFireBarrel(ctx, f) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(f.x + 3, f.y + 4, 15, 13, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#3a3330';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 14, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#5a4a40';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ff7a20';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 9, 0, 7);
    ctx.fill();
  }

  drawBarrel(ctx, b) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(b.x + 3, b.y + 4, 15, 13, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#8a1d14';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#c23b24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r - 4, 0, 7);
    ctx.stroke();
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - 6);
    ctx.lineTo(b.x + 6, b.y + 5);
    ctx.lineTo(b.x - 6, b.y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(b.x - 0.8, b.y - 2, 1.6, 4);
  }

  drawMedkit(ctx, m) {
    const bob = Math.sin(this.realTime * 3) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(m.x - 10, m.y - 6, 22, 16);
    ctx.fillStyle = '#e8ece8';
    ctx.fillRect(m.x - 11, m.y - 9 + bob, 22, 16);
    ctx.fillStyle = '#21b35a';
    ctx.fillRect(m.x - 2.5, m.y - 7 + bob, 5, 12);
    ctx.fillRect(m.x - 7, m.y - 3.5 + bob, 14, 5);
  }

  drawBomb(ctx, b) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(b.x - 14, b.y - 8, 32, 22);
    ctx.fillStyle = '#2b2f26';
    ctx.fillRect(b.x - 16, b.y - 11, 32, 22);
    ctx.fillStyle = '#7a5a2a';
    for (let i = 0; i < 3; i++) ctx.fillRect(b.x - 14 + i * 10, b.y - 9, 8, 18);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(b.x - 9, b.y - 5, 18, 9);
    const blink = b.defused ? false : Math.floor(this.realTime * (b.timer < 30 ? 6 : 2)) % 2 === 0;
    ctx.fillStyle = b.defused ? '#3dff7a' : blink ? '#ff2020' : '#501010';
    ctx.font = '700 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(b.defused ? 'SAFE' : this.fmtTime(b.timer), b.x, b.y + 2.5);
    ctx.strokeStyle = '#d02020';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.x + 16, b.y - 6);
    ctx.quadraticCurveTo(b.x + 24, b.y, b.x + 16, b.y + 6);
    ctx.stroke();
  }

  drawTarget(ctx, tg) {
    ctx.save();
    ctx.translate(tg.x, tg.y);
    if (tg.down) {
      // 倒れた標的
      ctx.rotate(tg.fallA);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-4, -12, 10, 26);
      ctx.fillStyle = '#6b6258';
      ctx.fillRect(-2, -12, 6, 24);
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(3, 4, 15, 13, 0, 0, 7);
    ctx.fill();
    const rings = ['#e9e3d4', '#c0392b', '#e9e3d4', '#c0392b'];
    rings.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(0, 0, tg.r - i * 3.2, 0, 7);
      ctx.fill();
    });
    ctx.strokeStyle = '#3a2d20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, tg.r, 0, 7);
    ctx.stroke();
    ctx.restore();
  }

  // 施錠ドアのランプと、目的地のマーカー
  drawTutorialMarks(ctx) {
    const t = this.realTime;
    for (const k of this.locked) {
      const [x, y] = k.split(',').map(Number);
      if (this.grid[y][x] !== 'D') continue;
      const cx = x * T + T / 2;
      const cy = y * T + T / 2;
      const a = 0.55 + Math.sin(t * 4) * 0.3;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
      g.addColorStop(0, `rgba(255,50,40,${0.5 * a})`);
      g.addColorStop(1, 'rgba(255,50,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 16, cy - 16, 32, 32);
      ctx.fillStyle = `rgba(255,70,50,${0.6 + a * 0.4})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, 7);
      ctx.fill();
    }
    const goal = this.tutGoal();
    if (goal && !goal.extract) {
      const pulse = (t * 1.4) % 1;
      ctx.strokeStyle = `rgba(255,211,74,${0.9 - pulse * 0.8})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, 10 + pulse * 18, 0, 7);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,211,74,0.9)';
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -t * 16;
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, 16, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd34a';
      ctx.font = '700 11px Bahnschrift, "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GO', goal.x, goal.y - 24 + Math.sin(t * 4) * 2);
    }
  }

  drawGrenade(ctx, g) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.spin);
    ctx.fillStyle = '#3a4a3a';
    ctx.fillRect(-5, -3.5, 10, 7);
    ctx.fillStyle = '#bbb';
    ctx.fillRect(3, -2, 3, 4);
    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  drawOperator(ctx, o, isPlayer) {
    const op = o.op;
    const w = op.weapon;
    const bob = o.moving ? Math.sin(o.walkT) * 2.2 : 0;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(3, 4, 15, 13, 0, 0, 7);
    ctx.fill();
    ctx.rotate(o.angle);
    // 足
    if (o.moving) {
      ctx.fillStyle = '#121519';
      ctx.beginPath();
      ctx.ellipse(bob * 2, -6, 6, 4, 0, 0, 7);
      ctx.ellipse(-bob * 2, 6, 6, 4, 0, 0, 7);
      ctx.fill();
    }
    // 銃
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(6, 1, w.len, 4.5);
    ctx.fillStyle = '#2a2d33';
    ctx.fillRect(8, 1.5, w.len * 0.5, 1.5);
    if (w.kind === 'dmr') {
      ctx.fillStyle = '#16181c';
      ctx.fillRect(12, -1.2, 10, 2.4);
    }
    // 腕
    ctx.fillStyle = '#1a1f26';
    ctx.beginPath();
    ctx.arc(12, 6, 4.2, 0, 7);
    ctx.arc(20, 3, 3.8, 0, 7);
    ctx.fill();
    // 胴体（ベスト）
    ctx.fillStyle = '#1b2533';
    ctx.beginPath();
    ctx.ellipse(-1, 0, 10, 15, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#26354a';
    ctx.beginPath();
    ctx.ellipse(1, 0, 7, 11, 0, 0, 7);
    ctx.fill();
    // ポーチ
    ctx.fillStyle = '#121820';
    ctx.fillRect(3, -9, 4, 5);
    ctx.fillRect(3, 4, 4, 5);
    // チームカラーのストライプ
    ctx.fillStyle = op.color;
    ctx.fillRect(-9, -12, 3, 6);
    ctx.fillRect(-9, 6, 3, 6);
    // 頭
    if (op.head === 'bald') {
      ctx.fillStyle = '#7b5a48';
      ctx.beginPath();
      ctx.arc(1, 0, 7.5, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,230,210,0.35)';
      ctx.beginPath();
      ctx.arc(-1, -2, 3.5, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#2a1e18';
      ctx.beginPath();
      ctx.arc(5, 0, 4, -1.2, 1.2);
      ctx.fill();
    } else if (op.head === 'cap') {
      ctx.fillStyle = '#151a20';
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, 7);
      ctx.fill();
      ctx.fillRect(4, -5, 6, 10);
    } else {
      ctx.fillStyle = '#232a33';
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 6, -2.2, -0.6);
      ctx.stroke();
      ctx.fillStyle = '#0d0f12';
      ctx.fillRect(5, -3, 3, 6);
    }
    ctx.restore();
    if (!isPlayer) {
      ctx.fillStyle = op.color;
      ctx.globalAlpha = 0.85;
      ctx.font = '700 10px Bahnschrift, "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(op.name, o.x, o.y - 22);
      ctx.globalAlpha = 1;
    }
  }

  drawEnemy(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.state === 'down') {
      ctx.rotate(e.downAngle);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = e.heavy ? '#2d3238' : '#3d1c1e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 10, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#16181b';
      ctx.beginPath();
      ctx.arc(16, 0, 6.5, 0, 7);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(3, 4, e.r + 2, e.r, 0, 0, 7);
    ctx.fill();
    const s = e.heavy ? 1.18 : 1;
    if (e.state === 'surrender' || e.state === 'cuffed') {
      const kneel = e.state === 'cuffed' ? 0.85 : 1;
      ctx.rotate(e.angle);
      ctx.scale(kneel * s, kneel * s);
      ctx.fillStyle = e.heavy ? '#3a4048' : '#4a2023';
      ctx.beginPath();
      ctx.ellipse(-1, 0, 9, 14, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#c59a7c';
      if (e.state === 'surrender') {
        const wave = Math.sin(e.anim * 6) * 1.5;
        ctx.beginPath();
        ctx.arc(-2, -17 - wave, 4, 0, 7);
        ctx.arc(-2, 17 + wave, 4, 0, 7);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(-11, -3, 3.5, 0, 7);
        ctx.arc(-11, 3, 3.5, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#9fb4c8';
        ctx.fillRect(-13, -1, 4, 2);
      }
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(1, 0, 7, 0, 7);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = e.moving ? Math.sin(e.walkT) * 2 : 0;
    const wob = e.stun > 0 ? Math.sin(e.anim * 20) * 0.15 : 0;
    ctx.rotate(e.angle + wob);
    ctx.scale(s, s);
    if (e.moving) {
      ctx.fillStyle = '#141416';
      ctx.beginPath();
      ctx.ellipse(bob * 2, -6, 6, 4, 0, 0, 7);
      ctx.ellipse(-bob * 2, 6, 6, 4, 0, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(6, 1, e.heavy ? 26 : 20, 4);
    ctx.fillStyle = '#b08870';
    ctx.beginPath();
    ctx.arc(12, 6, 3.5, 0, 7);
    ctx.arc(18, 3, 3.3, 0, 7);
    ctx.fill();
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.heavy ? '#3a4048' : '#4a2023';
    ctx.beginPath();
    ctx.ellipse(-1, 0, 9.5, 14, 0, 0, 7);
    ctx.fill();
    if (e.heavy) {
      ctx.fillStyle = '#545c66';
      ctx.fillRect(-5, -9, 10, 18);
      ctx.fillStyle = '#2a2e33';
      ctx.beginPath();
      ctx.arc(1, 0, 8, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#0d0f12';
      ctx.fillRect(4, -4, 4, 8);
    } else {
      ctx.fillStyle = '#2b1416';
      ctx.beginPath();
      ctx.arc(-2, 0, 8, 1.2, 5.1);
      ctx.fill();
      ctx.fillStyle = '#121212';
      ctx.beginPath();
      ctx.arc(1, 0, 6.5, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  drawHostage(ctx, h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(3, 4, 13, 11, 0, 0, 7);
    ctx.fill();
    if (h.state === 'dead') {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#9a8a70';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 9, 0.4, 0, 7);
      ctx.fill();
      ctx.restore();
      return;
    }
    const shake = h.state === 'bound' ? Math.sin(h.anim * 25) * 0.6 : 0;
    ctx.rotate(h.angle);
    ctx.translate(shake, 0);
    if (h.state === 'escort') {
      const bob = Math.sin(h.walkT || 0) * 2;
      ctx.fillStyle = '#20232a';
      ctx.beginPath();
      ctx.ellipse(bob * 2, -5, 5, 3.5, 0, 0, 7);
      ctx.ellipse(-bob * 2, 5, 5, 3.5, 0, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = '#cfc2a5';
    ctx.beginPath();
    ctx.ellipse(-1, 0, 8.5, 12.5, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#d7a888';
    if (h.state === 'bound') {
      ctx.beginPath();
      ctx.arc(-10, -3, 3, 0, 7);
      ctx.arc(-10, 3, 3, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#a08050';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -5);
      ctx.lineTo(-10, 5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(8, -9, 3, 0, 7);
      ctx.arc(8, 9, 3, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = '#4a3220';
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  drawIndicators(ctx) {
    const t = this.realTime;
    const p = this.player;
    const poly = this.playerPoly;
    for (const e of this.enemies) {
      if (e.state === 'down' || e.state === 'cuffed') continue;
      const vis = Math.hypot(e.x - p.x, e.y - p.y) < p.op.light * T && this.los(p.x, p.y, e.x, e.y);
      if (!vis && this.droneT <= 0) continue;
      if (e.state === 'surrender') {
        ctx.fillStyle = '#7dd8ff';
        ctx.font = '700 11px Bahnschrift, "Arial Narrow", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('HANDS UP', e.x, e.y - 24 + Math.sin(t * 4) * 2);
      } else if (e.stun > 0) {
        for (let i = 0; i < 3; i++) {
          const a = t * 4 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = '#fff27a';
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * 12, e.y - 22 + Math.sin(a) * 4, 2.2, 0, 7);
          ctx.fill();
        }
      } else if (e.alertMark > 0 || e.state === 'engage') {
        ctx.fillStyle = e.state === 'engage' ? '#ff3b2a' : '#ffb020';
        ctx.font = '900 16px Bahnschrift, "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(e.state === 'engage' ? '!' : '?', e.x, e.y - 22);
      }
      if (e.hp < e.maxHp && e.state !== 'surrender') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - 14, e.y + 20, 28, 3);
        ctx.fillStyle = '#ff5a3a';
        ctx.fillRect(e.x - 14, e.y + 20, 28 * (e.hp / e.maxHp), 3);
      }
    }
    // 人質の位置表示（視界内）
    for (const h of this.hostages) {
      if (h.state !== 'bound') continue;
      const vis = Math.hypot(h.x - p.x, h.y - p.y) < p.op.light * T && this.los(p.x, p.y, h.x, h.y);
      if (!vis) continue;
      ctx.strokeStyle = `rgba(255,230,120,${0.6 + Math.sin(t * 5) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 19, 0, 7);
      ctx.stroke();
      ctx.fillStyle = '#ffe37a';
      ctx.font = '700 10px Bahnschrift, "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HOSTAGE', h.x, h.y - 24);
    }
    // インタラクト範囲
    if (this.interact && !this.ended) {
      const it = this.interact;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(it.x, it.y, 22, 0, 7);
      ctx.stroke();
      if (this.interactProg > 0) {
        ctx.strokeStyle = '#ffb347';
        ctx.beginPath();
        ctx.arc(it.x, it.y, 22, -Math.PI / 2, -Math.PI / 2 + this.interactProg * Math.PI * 2);
        ctx.stroke();
      }
    }
    void poly;
  }

  drawDroneReveal(ctx) {
    const t = this.realTime;
    const p = this.player;
    const a = Math.min(1, this.droneT);
    // ドローン本体
    const dx = p.x + Math.cos(t * 1.5) * 40;
    const dy = p.y + Math.sin(t * 1.5) * 40;
    ctx.fillStyle = '#9feaff';
    ctx.beginPath();
    ctx.arc(dx, dy, 4, 0, 7);
    ctx.fill();
    ctx.strokeStyle = `rgba(63,214,255,${0.4 * a})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const ra = t * 30 + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(dx + Math.cos(i * 1.57 + 0.78) * 8, dy + Math.sin(i * 1.57 + 0.78) * 8, 4, ra, ra + 2);
      ctx.stroke();
    }
    // スキャン波
    const wave = ((t * 1.2) % 1) * 18 * T;
    ctx.strokeStyle = `rgba(63,214,255,${0.25 * (1 - wave / (18 * T)) * a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, wave, 0, 7);
    ctx.stroke();
    const mark = (x, y, col, label) => {
      ctx.strokeStyle = `rgba(${col},${0.9 * a})`;
      ctx.lineWidth = 2;
      const s = 14;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s + 5);
      ctx.lineTo(x - s, y - s);
      ctx.lineTo(x - s + 5, y - s);
      ctx.moveTo(x + s - 5, y - s);
      ctx.lineTo(x + s, y - s);
      ctx.lineTo(x + s, y - s + 5);
      ctx.moveTo(x + s, y + s - 5);
      ctx.lineTo(x + s, y + s);
      ctx.lineTo(x + s - 5, y + s);
      ctx.moveTo(x - s + 5, y + s);
      ctx.lineTo(x - s, y + s);
      ctx.lineTo(x - s, y + s - 5);
      ctx.stroke();
      ctx.fillStyle = `rgba(${col},${0.25 * a})`;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, 7);
      ctx.fill();
      ctx.fillStyle = `rgba(${col},${a})`;
      ctx.font = '700 9px Bahnschrift, "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y + s + 11);
    };
    for (const e of this.enemies) {
      if (e.state === 'down' || e.state === 'cuffed') continue;
      mark(e.x, e.y, e.state === 'surrender' ? '125,216,255' : '255,70,60', `${e.heavy ? 'HEAVY' : 'SUSPECT'} ${Math.round(Math.hypot(e.x - p.x, e.y - p.y) / T)}m`);
    }
    for (const h of this.hostages) if (h.state === 'bound') mark(h.x, h.y, '255,227,122', 'HOSTAGE');
    if (this.bomb && !this.bomb.defused) mark(this.bomb.x, this.bomb.y, '255,60,200', 'BOMB');
  }

  drawBubble(ctx, b) {
    const o = b.ent;
    const a = Math.min(1, b.life / 0.3, (b.max - b.life) / 0.1 + 0.2);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = '700 11px Bahnschrift, "Arial Narrow", sans-serif';
    const w = ctx.measureText(b.text).width + 14;
    const x = o.x - w / 2;
    const y = o.y - 50;
    ctx.fillStyle = 'rgba(8,10,14,0.85)';
    this.roundRect(ctx, x, y, w, 18, 4);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(o.x - 4, y + 18);
    ctx.lineTo(o.x, y + 24);
    ctx.lineTo(o.x + 4, y + 18);
    ctx.fillStyle = 'rgba(8,10,14,0.85)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(b.text, o.x, y + 13);
    ctx.restore();
  }

  drawOffscreenArrows(ctx, camX, camY) {
    const targets = [];
    if (this.tut) {
      const goal = this.tutGoal();
      if (goal) targets.push({ x: goal.x, y: goal.y, color: goal.extract ? '#6dff9e' : '#ffd34a', label: goal.extract ? 'EXTRACT' : 'GO' });
    } else if (this.objectives().allDone) targets.push({ x: this.exRect.x + this.exRect.w / 2, y: this.exRect.y + this.exRect.h / 2, color: '#6dff9e', label: 'EXTRACT' });
    if (this.bomb && !this.bomb.defused && this.explored[Math.floor(this.bomb.y / T) * this.W + Math.floor(this.bomb.x / T)])
      targets.push({ x: this.bomb.x, y: this.bomb.y, color: '#ff4ac8', label: 'BOMB' });
    // スマホでは画面外からこちらを狙っている容疑者の方向も示す
    if (this.touchMode && !this.ended) {
      const p = this.player;
      for (const e of this.enemies)
        if (e.state === 'engage' && e.stun <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 14 * T) targets.push({ x: e.x, y: e.y, color: '#ff4a3a', label: '!' });
    }
    for (const tg of targets) {
      const sx = (tg.x - camX) * this.zoom;
      const sy = (tg.y - camY) * this.zoom;
      const m = 50;
      if (sx > m && sx < this.vw - m && sy > m && sy < this.vh - m) continue;
      const cx = this.vw / 2;
      const cy = this.vh / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const ex = clamp(sx, m, this.vw - m);
      const ey = clamp(sy, m + 30, this.vh - m - 60);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = tg.color;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-6, -9);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-6, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = tg.color;
      ctx.font = '700 11px Bahnschrift, "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tg.label, ex, ey + 22);
    }
  }

  drawScreenFx(ctx) {
    const vw = this.vw;
    const vh = this.vh;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const sp of this.screenP) {
      const x = sp.x * vw;
      const y = sp.y * vh;
      if (sp.ember) {
        const fl = 0.6 + Math.sin(this.realTime * 6 + sp.ph) * 0.4;
        ctx.fillStyle = `rgba(255,${130 + fl * 60},50,${sp.a * fl * 0.8})`;
        ctx.beginPath();
        ctx.arc(x, y, sp.s, 0, 7);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(170,180,195,${sp.a * 0.25})`;
        ctx.fillRect(x, y, sp.s * 0.6, sp.s * 4);
      }
    }
    ctx.restore();
    // ビネット
    if (!this.vig || this.vigW !== vw || this.vigH !== vh) {
      this.vigW = vw;
      this.vigH = vh;
      this.vig = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      this.vig.addColorStop(0, 'rgba(0,0,0,0)');
      this.vig.addColorStop(1, 'rgba(0,0,0,0.7)');
    }
    ctx.fillStyle = this.vig;
    ctx.fillRect(0, 0, vw, vh);
    if (this.focusT > 0) {
      const a = Math.min(1, this.focusT, (5 - this.focusT) * 4);
      ctx.fillStyle = `rgba(20,60,110,${0.18 * a})`;
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = `rgba(140,255,120,${0.35 * a})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, vw - 32, vh - 32);
    }
    const p = this.player;
    const low = p.hp < p.maxHp * 0.3 ? 0.25 + Math.sin(this.realTime * 6) * 0.1 : 0;
    const hurt = Math.max(this.hurtFlash * 0.6, low);
    if (hurt > 0) {
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.25, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
      g.addColorStop(0, 'rgba(160,0,0,0)');
      g.addColorStop(1, `rgba(170,10,10,${hurt})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (this.whiteout > 0) {
      ctx.fillStyle = `rgba(255,255,250,${Math.min(1, this.whiteout)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  drawCrosshair(ctx) {
    const p = this.player;
    const w = p.op.weapon;
    const x = this.mouse.x;
    const y = this.mouse.y;
    const dPx = Math.hypot(this.mouseWorld.x - p.x, this.mouseWorld.y - p.y);
    const moveMul = p.moving ? (p.sprint ? 2.6 : 1.5) : 1;
    const gap = 5 + Math.tan(w.spread * moveMul + this.bloom) * dPx * this.zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4;
    const lines = () => {
      ctx.beginPath();
      ctx.moveTo(x - gap - 8, y);
      ctx.lineTo(x - gap, y);
      ctx.moveTo(x + gap, y);
      ctx.lineTo(x + gap + 8, y);
      ctx.moveTo(x, y - gap - 8);
      ctx.lineTo(x, y - gap);
      ctx.moveTo(x, y + gap);
      ctx.lineTo(x, y + gap + 8);
      ctx.stroke();
    };
    lines();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    lines();
    ctx.fillStyle = p.op.color;
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, 7);
    ctx.fill();
    if (p.reloadT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, 7);
      ctx.stroke();
      ctx.strokeStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(x, y, 20, -Math.PI / 2, -Math.PI / 2 + (1 - p.reloadT / w.reload) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawMinimap(cv) {
    if (!cv) return;
    const c = cv.getContext('2d');
    const W = this.W;
    const H = this.H;
    const s = Math.min(cv.width / W, cv.height / H);
    const ox = (cv.width - W * s) / 2;
    const oy = (cv.height - H * s) / 2;
    c.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = this.grid[y][x];
        const ex = this.explored[y * W + x] || this.outside[y * W + x];
        if (!ex) continue;
        if (ch === '#') c.fillStyle = '#5b6573';
        else if (ch === 'D') c.fillStyle = '#9a7a50';
        else if (ch === ',' || ch === 'V') c.fillStyle = '#1b2029';
        else c.fillStyle = '#2c333e';
        c.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
      }
    const r = this.exRect;
    c.strokeStyle = '#6dff9e';
    c.lineWidth = 1;
    c.strokeRect(ox + (r.x / T) * s, oy + (r.y / T) * s, (r.w / T) * s, (r.h / T) * s);
    const dot = (o, col, rad) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(ox + (o.x / T) * s, oy + (o.y / T) * s, rad, 0, 7);
      c.fill();
    };
    const p = this.player;
    for (const h of this.hostages) {
      if (h.state !== 'bound') continue;
      const seen = this.droneT > 0 || this.explored[Math.floor(h.y / T) * W + Math.floor(h.x / T)];
      if (seen) dot(h, '#ffe37a', 2.5);
    }
    for (const e of this.enemies) {
      if (e.state === 'down' || e.state === 'cuffed') continue;
      const vis = this.droneT > 0 || (Math.hypot(e.x - p.x, e.y - p.y) < p.op.light * T && this.los(p.x, p.y, e.x, e.y));
      if (vis) dot(e, e.state === 'surrender' ? '#7dd8ff' : '#ff4a3a', 2.5);
    }
    if (this.bomb && !this.bomb.defused && (this.droneT > 0 || this.explored[Math.floor(this.bomb.y / T) * W + Math.floor(this.bomb.x / T)]))
      dot(this.bomb, Math.floor(this.realTime * 4) % 2 ? '#ff4ac8' : '#701050', 3);
    for (const s2 of this.squad) dot(s2, s2.op.color, 2.2);
    dot(p, '#ffffff', 3);
    c.strokeStyle = '#ffffff';
    c.beginPath();
    c.moveTo(ox + (p.x / T) * s, oy + (p.y / T) * s);
    c.lineTo(ox + (p.x / T) * s + Math.cos(p.angle) * 8, oy + (p.y / T) * s + Math.sin(p.angle) * 8);
    c.stroke();
  }

  fmtTime(t) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
