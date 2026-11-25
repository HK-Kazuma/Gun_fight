import { useEffect, useRef, useState } from 'react';
import { Game } from '../game/engine.js';
import { MISSIONS } from '../game/maps.js';
import { getOp } from '../game/operators.js';
import { audio } from '../game/audio.js';

const fmt = (t) => {
  t = Math.max(0, t);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};

export default function GameView({ missionIndex, opId, onEnd, onQuit, runKey, onRestart }) {
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const gameRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [radio, setRadio] = useState([]);
  const [paused, setPaused] = useState(false);
  const [intro, setIntro] = useState(true);
  const mission = MISSIONS[missionIndex];
  const op = getOp(opId);

  useEffect(() => {
    audio.init();
    audio.startAmbient();
    const g = new Game(canvasRef.current, {
      missionIndex,
      opId,
      onHud: setHud,
      onRadio: (m) => setRadio((r) => [...r.slice(-3), { ...m, t: Date.now() }]),
      onPause: setPaused,
      onEnd: (res) => onEnd(res),
      minimap: () => miniRef.current,
    });
    gameRef.current = g;
    if (import.meta.env.DEV) window.__bcGame = g; // 開発時のデバッグ用
    const it = setTimeout(() => setIntro(false), 2600);
    return () => {
      clearTimeout(it);
      g.destroy();
      audio.stopAmbient();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  useEffect(() => {
    const id = setInterval(() => setRadio((r) => r.filter((m) => Date.now() - m.t < 7000)), 500);
    return () => clearInterval(id);
  }, []);

  const resume = () => gameRef.current && gameRef.current.setPaused(false);
  const ob = hud && hud.objectives;
  const hpPct = hud ? hud.hp / hud.maxHp : 1;
  const abReady = hud && hud.abilityCd <= 0;

  return (
    <div className="screen game-screen">
      <canvas ref={canvasRef} className="game-canvas" />

      {intro && (
        <div className="mission-intro">
          <div className="mi-loc">{mission.location}</div>
          <div className="mi-code">{mission.code}</div>
          <div className="mi-title">{mission.title}</div>
        </div>
      )}

      {hud && (
        <>
          <div className="hud-tl">
            <div className="hud-mission">
              <span>{mission.code}</span>
            </div>
            <ul className="hud-obj">
              {ob.bomb && (
                <li className={ob.bomb.defused ? 'done' : 'urgent'}>
                  <i />
                  爆弾を解除 {ob.bomb.defused ? '' : `— ${fmt(ob.bomb.timer)}`}
                </li>
              )}
              <li className={ob.hostages === ob.hostagesTotal ? 'done' : ''}>
                <i />
                人質救出 {ob.hostages}/{ob.hostagesTotal}
              </li>
              <li className={ob.suspects === ob.suspectsTotal ? 'done' : ''}>
                <i />
                容疑者確保 {ob.suspects}/{ob.suspectsTotal}
              </li>
              <li className={ob.allDone ? 'active' : 'locked'}>
                <i />
                撤収ポイントへ帰還
              </li>
            </ul>
          </div>

          <div className="hud-top">
            {ob.bomb && !ob.bomb.defused ? (
              <div className={`bomb-timer ${ob.bomb.timer < 30 ? 'crit' : ''}`}>
                <small>DETONATION</small>
                {fmt(ob.bomb.timer)}
              </div>
            ) : (
              <div className="mission-timer">
                <small>ELAPSED</small>
                {fmt(hud.time)}
              </div>
            )}
          </div>

          <div className="hud-tr">
            <div className="hud-score">
              <small>SCORE</small>
              {hud.score.toLocaleString()}
            </div>
            <canvas ref={miniRef} width={220} height={110} className="minimap" />
          </div>

          <div className="radio-feed">
            {radio.map((m) => (
              <div key={m.id} className="radio-msg">
                <b>{m.from}</b>
                <span>{m.text}</span>
              </div>
            ))}
          </div>

          <div className="hud-bl" style={{ '--op': op.color }}>
            <div className="hud-op">
              <div className="hud-op-name">{op.name}</div>
              <div className="hud-op-role">{op.role}</div>
            </div>
            <div className="hp-bar">
              <div className="hp-fill" style={{ width: `${hpPct * 100}%`, background: hpPct < 0.3 ? '#ff3b2a' : hpPct < 0.6 ? '#ffb347' : '#e9f1f7' }} />
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="hp-seg" style={{ left: `${(i + 1) * 10}%` }} />
              ))}
            </div>
            <div className="hp-num">
              {Math.ceil(hud.hp)} <small>/ {hud.maxHp}</small>
            </div>
          </div>

          <div className="hud-br" style={{ '--op': op.color }}>
            <div className={`ability ${abReady ? 'ready' : ''} ${hud.abilityActive > 0 ? 'live' : ''}`}>
              <svg viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="21" className="ab-bg" />
                <circle cx="24" cy="24" r="21" className="ab-fg" style={{ strokeDashoffset: 132 * (hud.abilityCd / hud.abilityMax) }} />
              </svg>
              <span className="ab-key">Q</span>
              <div className="ab-name">
                {op.ability.name}
                <small>{abReady ? 'READY' : `${Math.ceil(hud.abilityCd)}s`}</small>
              </div>
            </div>
            <div className="weapon">
              <div className="wp-name">{op.weapon.name}</div>
              <div className="wp-ammo">
                <b className={hud.mag === 0 ? 'empty' : hud.mag <= hud.magMax * 0.25 ? 'low' : ''}>{hud.mag}</b>
                <span>/ {hud.magMax}</span>
              </div>
              <div className="wp-rounds">
                {Array.from({ length: Math.min(hud.magMax, 32) }).map((_, i) => (
                  <i key={i} className={i < hud.mag ? 'on' : ''} />
                ))}
              </div>
              {hud.reload > 0 && (
                <div className="wp-reload">
                  RELOADING <span style={{ width: `${hud.reload * 100}%` }} />
                </div>
              )}
              {hud.mag === 0 && hud.reload === 0 && <div className="wp-reload warn">[R] RELOAD</div>}
            </div>
          </div>

          {hud.interact && !hud.ended && (
            <div className="interact">
              <span className="kbd">E</span>
              {hud.interact.label}
              {hud.interact.hold && (
                <div className="ip-bar">
                  <span style={{ width: `${hud.interact.prog * 100}%` }} />
                </div>
              )}
            </div>
          )}

          <div className="key-hints">
            <span>
              <b>WASD</b>移動
            </span>
            <span>
              <b>SHIFT</b>ダッシュ
            </span>
            <span>
              <b>CLICK</b>射撃
            </span>
            <span>
              <b>F</b>投降勧告
            </span>
            <span>
              <b>E</b>ドア/拘束/救出
            </span>
            <span>
              <b>Q</b>アビリティ
            </span>
            <span>
              <b>R</b>リロード
            </span>
            <span>
              <b>ESC</b>ポーズ
            </span>
          </div>
        </>
      )}

      {paused && (
        <div className="overlay">
          <div className="pause-box">
            <h2>PAUSED</h2>
            <button className="btn btn-primary" onClick={resume}>
              RESUME<small>再開</small>
            </button>
            <button className="btn" onClick={onRestart}>
              RESTART<small>最初から</small>
            </button>
            <button className="btn" onClick={onQuit}>
              ABORT<small>ブリーフィングへ戻る</small>
            </button>
            <div className="pause-tip">TIP: 気付かれていない容疑者や、閃光弾で混乱した容疑者は [F] の投降勧告に応じやすい。逮捕は無力化の3倍のスコア。</div>
          </div>
        </div>
      )}
    </div>
  );
}
