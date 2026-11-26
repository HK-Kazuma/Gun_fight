import { ACHIEVEMENTS } from '../game/achievements.js';

export function AchievementsModal({ save, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>ACHIEVEMENTS</h2>
          <span>
            {Object.keys(save.achievements).length} / {ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const got = !!save.achievements[a.id];
            return (
              <div key={a.id} className={`ach ${got ? 'got' : ''}`}>
                <span className="medal">{got ? '★' : '☆'}</span>
                <div>
                  <b>{a.name}</b>
                  <em>{a.ja}</em>
                  <p>{a.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
        <button className="btn" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

const CONTROLS = [
  ['W A S D', '移動'],
  ['SHIFT', 'ダッシュ（射撃精度が下がる）'],
  ['マウス', '照準・ライトの向き'],
  ['左クリック', '射撃（長押しで連射）'],
  ['R', 'リロード'],
  ['F', '投降勧告 — 成功すると容疑者が手を上げる'],
  ['E', 'ドア突破 ／ 長押しで拘束・人質救出・爆弾解除'],
  ['Q / 右クリック', 'オペレーター固有アビリティ'],
  ['ESC', 'ポーズ'],
];

const TOUCH_CONTROLS = [
  ['左スティック', '移動（画面左側のどこを触っても出せる）'],
  ['DASH', 'ダッシュ（タップで切り替え）'],
  ['照準スティック', '照準・ライトの向き（画面右側のタップでも照準）'],
  ['射撃ボタン', '射撃（押したままドラッグで照準も動かせる）'],
  ['RELOAD', 'リロード'],
  ['投降勧告', '容疑者に投降を呼びかける'],
  ['E', 'ドア突破 ／ 長押しで拘束・人質救出・爆弾解除'],
  ['アビリティ', 'オペレーター固有アビリティ'],
  ['⏸', 'ポーズ（設定からボタン配置を変更できる）'],
];

export function ControlsModal({ onClose, touch }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>CONTROLS & RULES</h2>
        </div>
        <div className="controls-grid">
          <div>
            {(touch ? TOUCH_CONTROLS : CONTROLS).map(([k, v]) => (
              <div key={k} className="ctrl-row">
                <span className="kbd wide">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
          <div className="rules">
            <h3>交戦規定 / RULES OF ENGAGEMENT</h3>
            <ul>
              <li>建物内は暗闇。視界はライトの照らす範囲と炎の明かりだけ。</li>
              <li>容疑者を無力化すると +100、投降させて [E] で拘束すると +300。</li>
              <li>気付かれていない容疑者・体力が減った容疑者・スタン中の容疑者は投降しやすい。</li>
              <li>投降した容疑者を撃つと規律違反で -500。人質を撃つと作戦失敗。</li>
              <li>赤いドラム缶は撃つと爆発する。人質を巻き込まないよう注意。</li>
              <li>分隊の2名は自動で追従し、交戦中の敵だけを撃つ。</li>
              <li>全目標達成後、撤収ポイント（緑の枠）に戻るとクリア。早いほど高得点。</li>
            </ul>
          </div>
        </div>
        <button className="btn" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  );
}
