import Placed from './Placed.jsx';

export const fmt = (t) => {
  t = Math.max(0, t);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};

// レイアウト編集画面で使う見本データ
export const SAMPLE_HUD = {
  hp: 72,
  maxHp: 100,
  mag: 9,
  magMax: 30,
  reload: 0.45,
  abilityCd: 6,
  abilityMax: 20,
  abilityActive: 0,
  interact: { label: '容疑者を拘束する', prog: 0.4, hold: true },
  objectives: { hostages: 1, hostagesTotal: 2, suspects: 3, suspectsTotal: 6, allDone: false, bomb: null },
  time: 83,
  score: 1200,
  ended: false,
};
export const SAMPLE_RADIO = [
  { id: 's1', from: 'COMMAND', text: '人質の安全を最優先せよ。' },
  { id: 's2', from: 'REYES', text: 'クリア。次の部屋へ。' },
];

/**
 * ゲーム中の情報表示（体力・弾薬・目標など）。
 * 各要素は Placed で配置され、レイアウト編集でドラッグ・拡大縮小できる。
 */
export default function Hud({ hud, mission, op, radio, layout, touch, miniRef, mul = 1, editor }) {
  const ob = hud.objectives;
  const hpPct = hud.hp / hud.maxHp;
  const abReady = hud.abilityCd <= 0;
  const pp = { layout, mul, editor };

  return (
    <>
      <Placed {...pp} id="objectives">
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
      </Placed>

      <Placed {...pp} id="timer">
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
      </Placed>

      <Placed {...pp} id="scoremap">
        <div className="hud-tr">
          <div className="hud-score">
            <small>SCORE</small>
            {hud.score.toLocaleString()}
          </div>
          <canvas ref={miniRef} width={220} height={110} className="minimap" />
        </div>
      </Placed>

      <Placed {...pp} id="radio">
        <div className={`radio-feed ${editor ? 'static' : ''}`}>
          {radio.map((m) => (
            <div key={m.id} className="radio-msg">
              <b>{m.from}</b>
              <span>{m.text}</span>
            </div>
          ))}
        </div>
      </Placed>

      <Placed {...pp} id="hp" style={{ '--op': op.color }}>
        <div className="hud-bl">
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
      </Placed>

      {!touch && (
        <Placed {...pp} id="ability" style={{ '--op': op.color }}>
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
        </Placed>
      )}

      <Placed {...pp} id="weapon">
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
          {hud.mag === 0 && hud.reload === 0 && <div className="wp-reload warn">{touch ? 'RELOAD!' : '[R] RELOAD'}</div>}
        </div>
      </Placed>

      {hud.interact && !hud.ended && (
        <Placed {...pp} id="prompt">
          <div className="interact">
            {touch ? <span className="kbd round">E</span> : <span className="kbd">E</span>}
            {hud.interact.label}
            {hud.interact.hold && (
              <div className="ip-bar">
                <span style={{ width: `${hud.interact.prog * 100}%` }} />
              </div>
            )}
          </div>
        </Placed>
      )}

      {!touch && (
        <Placed {...pp} id="keyhints">
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
        </Placed>
      )}
    </>
  );
}
