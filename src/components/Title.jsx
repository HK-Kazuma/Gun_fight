import TitleBackdrop from './TitleBackdrop.jsx';
import { OPERATORS } from '../game/operators.js';

export default function Title({ onStart, onAchievements, onControls, onSettings, soundReady, muted, onToggleMute, unlockedCount, totalAch }) {
  return (
    <div className="screen title-screen">
      <TitleBackdrop />
      <div className="credit-row">
        {OPERATORS.map((o) => (
          <span key={o.id}>{o.name}</span>
        ))}
        <span>TACTICAL RESPONSE UNIT</span>
      </div>
      <div className="title-block">
        <div className="network-tag">NIGHT OPERATIONS</div>
        <div className="title-rule" />
        <h1 className="logo">
          BREACH<span className="amp">&amp;</span>CLEAR
        </h1>
        <div className="title-rule" />
        <p className="tagline">撃つか、投降させるか。判断は、お前の一瞬に委ねられる。</p>
        {!soundReady && <div className="sound-hint">CLICK / TAP TO ENABLE SOUND</div>}
        <div className="title-menu">
          <button className="btn btn-primary" onClick={onStart}>
            <span className="btn-key hide-touch">ENTER</span> DEPLOY<small>出動する</small>
          </button>
          <button className="btn" onClick={onAchievements}>
            ACHIEVEMENTS<small>実績 {unlockedCount}/{totalAch}</small>
          </button>
          <button className="btn" onClick={onControls}>
            CONTROLS<small>操作方法</small>
          </button>
          <button className="btn" onClick={onSettings}>
            SETTINGS<small>設定・レイアウト</small>
          </button>
          <button className="btn btn-ghost" onClick={onToggleMute}>
            SOUND {muted ? 'OFF' : 'ON'}
          </button>
        </div>
      </div>
    </div>
  );
}
