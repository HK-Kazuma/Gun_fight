import { useEffect, useRef, useState } from 'react';
import { MISSIONS } from '../game/maps.js';
import { OPERATORS } from '../game/operators.js';
import { drawTrooper } from '../game/silhouette.js';
import TitleBackdrop from './TitleBackdrop.jsx';
import { TUTORIAL } from '../game/tutorial.js';

// 画面の回転やリサイズで表示サイズが変わったら、キャンバスを描き直すためのキー
function useViewportKey() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setKey((k) => k + 1));
    };
    window.addEventListener('resize', bump);
    window.addEventListener('orientationchange', bump);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', bump);
      window.removeEventListener('orientationchange', bump);
    };
  }, []);
  return key;
}

function Portrait({ op, active }) {
  const ref = useRef(null);
  const vk = useViewportKey();
  useEffect(() => {
    const cv = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const g = ctx.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, w);
    g.addColorStop(0, active ? 'rgba(255,120,40,0.45)' : 'rgba(255,120,40,0.18)');
    g.addColorStop(1, 'rgba(10,12,16,0)');
    ctx.fillStyle = '#0c0f14';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const head = op.id === 'reyes' ? 'hair' : op.head;
    drawTrooper(ctx, w / 2, h * 0.42, h / 330, { head, accent: op.color, rifle: op.id === 'holt' ? false : 'right', rim: active ? '255,160,70' : '200,110,50' });
  }, [op, active, vk]);
  return <canvas ref={ref} className="portrait" />;
}

function MapPreview({ mission }) {
  const ref = useRef(null);
  const vk = useViewportKey();
  useEffect(() => {
    const cv = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const rows = mission.layout;
    const W = Math.max(...rows.map((r) => r.length));
    const H = rows.length;
    const s = Math.min(w / W, h / H);
    const ox = (w - W * s) / 2;
    const oy = (h - H * s) / 2;
    ctx.fillStyle = '#0a1622';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(80,160,255,0.08)';
    for (let x = 0; x < w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 12) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    rows.forEach((r, y) =>
      r.split('').forEach((c, x) => {
        let col = null;
        if (c === '#') col = 'rgba(120,190,255,0.85)';
        else if (c === 'D') col = '#ffb347';
        else if (c === 'w') col = 'rgba(160,230,255,0.6)';
        else if (c === 'X') col = 'rgba(110,255,160,0.7)';
        else if (c === 'V') col = 'rgba(200,220,255,0.35)';
        else if (c === 'F') col = 'rgba(255,120,40,0.8)';
        else if (c === 'P') col = '#ffffff';
        else if (c === 'K') col = '#ff4ac8';
        else if (c !== ',') col = 'rgba(80,150,230,0.12)';
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(ox + x * s, oy + y * s, s + 0.5, s + 0.5);
        }
      }),
    );
  }, [mission, vk]);
  return <canvas ref={ref} className="map-preview" />;
}

function Bars({ v }) {
  return (
    <span className="bars">
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= v ? 'on' : ''} />
      ))}
    </span>
  );
}

export default function Briefing({ missionIndex, setMissionIndex, opId, setOpId, tutChapter, setTutChapter, onDeploy, onBack, save }) {
  const m = MISSIONS[missionIndex];
  const op = OPERATORS.find((o) => o.id === opId);
  const hostages = m.layout.join('').split('h').length - 1;
  const suspects = m.layout.join('').replace(/[^EG]/g, '').length;
  const heavies = m.layout.join('').split('G').length - 1;
  return (
    <div className="screen briefing-screen">
      <TitleBackdrop dim={0.78} />
      <header className="brief-header">
        <button className="btn btn-ghost small" onClick={onBack}>
          ← TITLE
        </button>
        <div className="brief-title">
          <span>MISSION BRIEFING</span>
          <small>作戦と出動する隊員を選択</small>
        </div>
        <div className="brief-legend hide-touch">ENTER で出動</div>
      </header>
      <div className="brief-grid">
        <section className="panel missions">
          <h3>OPERATIONS</h3>
          {MISSIONS.map((mm, i) => {
            const best = save.best[mm.id];
            if (mm.tutorial)
              return (
                <button key={mm.id} className={`mission-card tutorial ${i === missionIndex ? 'active' : ''}`} onClick={() => setMissionIndex(i)}>
                  <div className="mc-top">
                    <span className="mc-num">TRAINING</span>
                    <span className="mc-tag">TUTORIAL</span>
                  </div>
                  <div className="mc-code">{mm.code}</div>
                  <div className="mc-title">{mm.title}</div>
                  <div className="mc-best">{save.tutorialDone ? 'COMPLETED' : 'RECOMMENDED — まずはここから'}</div>
                </button>
              );
            return (
              <button key={mm.id} className={`mission-card ${i === missionIndex ? 'active' : ''}`} onClick={() => setMissionIndex(i)}>
                <div className="mc-top">
                  <span className="mc-num">0{MISSIONS.filter((x) => !x.tutorial).indexOf(mm) + 1}</span>
                  <span className="mc-diff">
                    {'■'.repeat(mm.difficulty)}
                    <em>{'■'.repeat(3 - mm.difficulty)}</em>
                  </span>
                </div>
                <div className="mc-code">{mm.code}</div>
                <div className="mc-title">{mm.title}</div>
                <div className="mc-best">{best ? `BEST ${best.rank} / ${best.score.toLocaleString()} pts` : 'NOT CLEARED'}</div>
              </button>
            );
          })}
        </section>
        <section className="panel intel">
          <h3>
            INTEL <small>{m.location}</small>
          </h3>
          <MapPreview mission={m} />
          {m.tutorial ? (
            <>
              <p className="brief-text">{m.briefing}</p>
              <div className="tut-chapters">
                <div className="tut-chapters-head">CURRICULUM — 始める章を選択</div>
                {TUTORIAL.map((c, i) => {
                  const cop = c.op && OPERATORS.find((o) => o.id === c.op);
                  return (
                    <button
                      key={c.id}
                      className={`tut-chapter ${i === tutChapter ? 'active' : ''}`}
                      style={cop ? { '--op': cop.color } : undefined}
                      onClick={() => setTutChapter(i)}
                    >
                      <span className="tc-no">{String(i + 1).padStart(2, '0')}</span>
                      <span className="tc-body">
                        <b>
                          {c.name} <em>{c.ja}</em>
                        </b>
                        <small>{c.desc}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
          <div className="intel-stats">
            <div>
              <b>{suspects}</b>
              <span>SUSPECTS{heavies ? ` (重武装 ${heavies})` : ''}</span>
            </div>
            <div>
              <b>{hostages}</b>
              <span>HOSTAGES</span>
            </div>
            <div>
              <b>{m.bombTime ? `${Math.floor(m.bombTime / 60)}:${String(m.bombTime % 60).padStart(2, '0')}` : '—'}</b>
              <span>BOMB TIMER</span>
            </div>
            <div>
              <b>{Math.floor(m.par / 60)}:{String(m.par % 60).padStart(2, '0')}</b>
              <span>PAR TIME</span>
            </div>
          </div>
          <p className="brief-text">{m.briefing}</p>
          <ul className="obj-list">
            {m.bombTime && <li>時限爆弾を解除する</li>}
            <li>人質を全員救出する</li>
            <li>容疑者を全員 逮捕 または 無力化 する</li>
            <li>撤収ポイント（指揮車両）へ帰還する</li>
          </ul>
            </>
          )}
        </section>
        <section className="panel squad">
          <h3>SELECT OPERATOR</h3>
          <div className="op-grid">
            {OPERATORS.map((o) => (
              <button key={o.id} className={`op-card ${o.id === opId ? 'active' : ''}`} style={{ '--op': o.color }} onClick={() => setOpId(o.id)}>
                <Portrait op={o} active={o.id === opId} />
                <div className="op-name">{o.name}</div>
                <div className="op-role">{o.role}</div>
                {save.ops.includes(o.id) && <div className="op-cleared">✓</div>}
              </button>
            ))}
          </div>
          <div className="op-detail" style={{ '--op': op.color }}>
            <div className="od-head">
              <div>
                <div className="od-full">{op.full}</div>
                <div className="od-role">
                  {op.role} / {op.roleJa}
                </div>
              </div>
              <div className="od-weapon">{op.weapon.name}</div>
            </div>
            <p className="od-bio">{op.bio}</p>
            <div className="od-stats">
              <div>
                火力 <Bars v={op.stats.power} />
              </div>
              <div>
                精度 <Bars v={op.stats.accuracy} />
              </div>
              <div>
                機動 <Bars v={op.stats.mobility} />
              </div>
              <div>
                防御 <Bars v={op.stats.armor} />
              </div>
            </div>
            <div className="od-ability">
              <span className="kbd">Q</span>
              <div>
                <b>
                  {op.ability.name} <em>{op.ability.ja}</em>
                </b>
                <p>{op.ability.desc}</p>
                {op.passive && <p className="passive">PASSIVE: {op.passive}</p>}
              </div>
            </div>
            <div className="od-squad">
              {m.tutorial
                ? '基本操作の章は選んだ隊員で行う。隊員ごとの章では、その隊員に自動で切り替わる（訓練は単独）。'
                : `同行: ${OPERATORS.filter((o) => o.id !== op.id)
                    .slice(0, 2)
                    .map((o) => o.name)
                    .join(' / ')}`}
            </div>
          </div>
        </section>
      </div>
      <footer className="brief-footer">
        <button className="btn btn-primary deploy" onClick={onDeploy}>
          DEPLOY <small>出動</small>
        </button>
      </footer>
    </div>
  );
}
