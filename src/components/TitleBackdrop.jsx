import { useEffect, useRef } from 'react';
import { drawTrooper } from '../game/silhouette.js';

// タイトル画面の背景: 燃える市街地と隊員のシルエット
// 高さが小さい画面（スマホ横画面）では、左に文字・右に隊員を置く横長用の構図にする
export const COMPACT_HEIGHT = 540;
export default function TitleBackdrop({ dim = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let compact = false;
    let city = null;
    const mouse = { x: 0.5, y: 0.5 };
    const rand = (a, b) => a + Math.random() * (b - a);
    let embers = [];
    let smoke = [];
    let rain = [];

    const build = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      compact = h <= COMPACT_HEIGHT;
      cv.width = w * dpr;
      cv.height = h * dpr;
      city = document.createElement('canvas');
      city.width = w * dpr;
      city.height = h * dpr;
      const c = city.getContext('2d');
      c.scale(dpr, dpr);
      // 崩れたビル群
      const layers = [
        { col: '#11151b', base: 0.62, hmin: 0.15, hmax: 0.45, win: 0.04 },
        { col: '#0b0e12', base: 0.72, hmin: 0.1, hmax: 0.35, win: 0.02 },
      ];
      for (const L of layers) {
        let x = -20;
        while (x < w + 40) {
          const bw = rand(50, 140);
          const bh = rand(L.hmin, L.hmax) * h;
          const top = L.base * h - bh;
          c.fillStyle = L.col;
          c.beginPath();
          c.moveTo(x, h);
          c.lineTo(x, top + rand(0, 20));
          // 崩れた屋上
          const steps = 5;
          for (let i = 1; i <= steps; i++) c.lineTo(x + (bw * i) / steps, top + (Math.random() < 0.4 ? rand(0, 40) : rand(-6, 6)));
          c.lineTo(x + bw, h);
          c.closePath();
          c.fill();
          for (let wy = top + 14; wy < h * 0.8; wy += 16)
            for (let wx = x + 8; wx < x + bw - 8; wx += 14)
              if (Math.random() < L.win) {
                c.fillStyle = Math.random() < 0.6 ? 'rgba(255,150,60,0.55)' : 'rgba(180,200,230,0.25)';
                c.fillRect(wx, wy, 5, 7);
              }
          x += bw + rand(-10, 16);
        }
      }
      // 鉄骨の残骸
      c.strokeStyle = 'rgba(20,24,30,0.9)';
      c.lineWidth = 6;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        const sx = rand(0, w);
        c.moveTo(sx, h * rand(0.25, 0.45));
        c.lineTo(sx + rand(-200, 200), h * rand(0.5, 0.7));
        c.stroke();
      }
      embers = Array.from({ length: 140 }, () => ({ x: rand(0, w), y: rand(0, h), vy: rand(-60, -15), vx: rand(-15, 15), s: rand(0.8, 2.8), ph: rand(0, 6) }));
      smoke = Array.from({ length: 26 }, () => ({ x: rand(-100, w), y: rand(h * 0.2, h * 0.8), r: rand(80, 220), vx: rand(6, 20), a: rand(0.05, 0.13) }));
      rain = Array.from({ length: 160 }, () => ({ x: rand(0, w), y: rand(0, h), v: rand(500, 900), l: rand(8, 18) }));
    };
    build();

    let raf;
    let last = performance.now();
    let t = 0;
    let flash = 0;
    const frame = (now) => {
      // 回転などで表示サイズが変わったら作り直す（古い解像度のまま引き延ばされるのを防ぐ）
      if (cv.clientWidth !== w || cv.clientHeight !== h) build();
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      t += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 空
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#07090d');
      sky.addColorStop(0.5, '#1a1512');
      sky.addColorStop(0.75, '#3a1c0c');
      sky.addColorStop(1, '#0a0705');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // 炎の光（地平線）
      const pulse = 0.85 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 5.7) * 0.05;
      const fires = [
        [0.78, 0.55, 0.55],
        [0.2, 0.62, 0.35],
        [0.55, 0.7, 0.4],
      ];
      for (const [fx, fy, fr] of fires) {
        const g = ctx.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, fr * w * pulse);
        g.addColorStop(0, 'rgba(255,140,40,0.55)');
        g.addColorStop(0.35, 'rgba(220,70,10,0.22)');
        g.addColorStop(1, 'rgba(120,20,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      // 爆発フラッシュ
      if (Math.random() < dt * 0.25) flash = 1;
      flash = Math.max(0, flash - dt * 1.5);
      const px = (mouse.x - 0.5) * 18;
      const py = (mouse.y - 0.5) * 10;
      ctx.drawImage(city, -px * 0.4, -py * 0.4, w, h);
      // 煙
      for (const s of smoke) {
        s.x += s.vx * dt;
        if (s.x - s.r > w) s.x = -s.r * 2;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(40,34,32,${s.a})`);
        g.addColorStop(1, 'rgba(40,34,32,0)');
        ctx.fillStyle = g;
        ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
      }
      if (flash > 0) {
        const g = ctx.createRadialGradient(w * 0.82, h * 0.45, 0, w * 0.82, h * 0.45, w * 0.5);
        g.addColorStop(0, `rgba(255,190,90,${0.45 * flash})`);
        g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      // スマホ横画面：左側の文字を読みやすくするため暗くする
      if (compact) {
        const lg = ctx.createLinearGradient(0, 0, w * 0.62, 0);
        lg.addColorStop(0, 'rgba(4,5,7,0.82)');
        lg.addColorStop(0.6, 'rgba(4,5,7,0.45)');
        lg.addColorStop(1, 'rgba(4,5,7,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, w, h);
      }
      // 隊員：PC は画面全体、スマホ横画面は右側の枠に比率を保って並べる
      const fw = compact ? Math.min(w * 0.56, h * 1.5) : w;
      const fx0 = compact ? w * 0.71 - fw / 2 : 0;
      const fy = compact ? -0.03 : 0;
      const s = compact ? Math.min(h / 900, fw / 1250) : Math.min(h / 950, w / 1500);
      const tx = (mouse.x - 0.5) * 26;
      const ty = (mouse.y - 0.5) * 12;
      const breath = Math.sin(t * 1.2) * 2;
      const rimCol = flash > 0.3 ? '255,200,120' : '255,140,50';
      const squad = [
        { x: 0.5, y: 0.22, s: 1.12, head: 'bald', accent: '#ff8a2a', rifle: false, d: 0.6 },
        { x: 0.355, y: 0.33, s: 0.98, head: 'hair', accent: '#ff4040', rifle: 'left', d: 0.8 },
        { x: 0.645, y: 0.33, s: 0.98, head: 'helmet', accent: '#3fd6ff', rifle: 'right', d: 0.8 },
        { x: 0.25, y: 0.47, s: 1.06, head: 'helmet', rifle: 'left', d: 1 },
        { x: 0.75, y: 0.47, s: 1.06, head: 'helmet', rifle: 'right', d: 1 },
        { x: 0.5, y: 0.5, s: 1.22, head: 'cap', accent: '#8dff6a', rifle: 'right', d: 1.25 },
      ];
      for (const q of squad) drawTrooper(ctx, fx0 + q.x * fw + tx * q.d, (q.y + fy) * h + ty * q.d + breath * q.d, s * q.s, { head: q.head, accent: q.accent, rifle: q.rifle, rim: rimCol });
      // 前景の暗転
      const fg = ctx.createLinearGradient(0, h * 0.55, 0, h);
      fg.addColorStop(0, 'rgba(5,6,8,0)');
      fg.addColorStop(0.55, 'rgba(5,6,8,0.85)');
      fg.addColorStop(1, 'rgba(5,6,8,1)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, w, h);
      // 雨
      ctx.strokeStyle = 'rgba(190,200,220,0.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const r of rain) {
        r.y += r.v * dt;
        r.x -= r.v * 0.12 * dt;
        if (r.y > h) {
          r.y = -20;
          r.x = rand(0, w + 100);
        }
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + r.l * 0.12, r.y - r.l);
      }
      ctx.stroke();
      // 火の粉
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        e.y += e.vy * dt;
        e.x += (e.vx + Math.sin(t * 2 + e.ph) * 20) * dt;
        if (e.y < -10) {
          e.y = h + 10;
          e.x = rand(0, w);
        }
        const fl = 0.5 + Math.sin(t * 8 + e.ph) * 0.5;
        ctx.fillStyle = `rgba(255,${120 + fl * 80},40,${0.4 + fl * 0.5})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.s, 0, 7);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // ビネット
      const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
      if (dim > 0) {
        ctx.fillStyle = `rgba(4,5,8,${dim})`;
        ctx.fillRect(0, 0, w, h);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onMove = (e) => {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('resize', build);
    window.addEventListener('orientationchange', build);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', build);
      window.removeEventListener('orientationchange', build);
    };
  }, [dim]);
  return <canvas ref={ref} className="backdrop" />;
}
