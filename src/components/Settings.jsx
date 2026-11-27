import { useState } from 'react';
import Hud, { SAMPLE_HUD, SAMPLE_RADIO } from './Hud.jsx';
import TouchControls from './TouchControls.jsx';
import { ELEMENTS, elementLabel, defaultLayout, isCoarsePointer } from '../game/settings.js';
import { MISSIONS } from '../game/maps.js';
import { OPERATORS } from '../game/operators.js';

const pct = (v) => `${Math.round(v * 100)}%`;

function Slider({ label, value, min, max, step = 0.05, onChange, format = pct }) {
  return (
    <label className="set-row slider">
      <span className="set-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <b className="set-val">{format(value)}</b>
    </label>
  );
}

function Toggle({ label, desc, value, onChange }) {
  return (
    <button type="button" className={`set-row toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}>
      <span className="set-label">
        {label}
        {desc && <small>{desc}</small>}
      </span>
      <span className="switch">
        <i />
      </span>
    </button>
  );
}

function Segment({ label, value, options, onChange }) {
  return (
    <div className="set-row seg">
      <span className="set-label">{label}</span>
      <div className="segment">
        {options.map(([v, t]) => (
          <button type="button" key={v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * レイアウト編集。HUD とボタンをドラッグで移動し、スライダーで大きさと透明度を調整する。
 */
export function LayoutEditor({ mode, settings, onSave, onCancel, mission, op, hud, overGame }) {
  const [layout, setLayout] = useState(() => JSON.parse(JSON.stringify(settings.layouts[mode])));
  const [sel, setSel] = useState(null);
  const [panelTop, setPanelTop] = useState(false);
  const [hudOpacity, setHudOpacity] = useState(settings.hudOpacity);
  const [controlOpacity, setControlOpacity] = useState(settings.controlOpacity);
  const touch = mode === 'touch';
  const editor = {
    selected: sel,
    onSelect: setSel,
    onChange: (id, patch) => setLayout((l) => ({ ...l, [id]: { ...l[id], ...patch } })),
  };
  const items = ELEMENTS.filter((e) => e.modes.includes(mode));
  const cur = sel && layout[sel];
  const patch = (p) => sel && editor.onChange(sel, p);
  const previewSettings = { ...settings, controlOpacity };

  return (
    <div className={`layout-editor ${overGame ? 'over-game' : ''} ${touch ? 'touch-mode' : ''}`} onPointerDown={() => setSel(null)}>
      <div className="le-guides">
        <i style={{ left: '33.33%' }} />
        <i style={{ left: '66.66%' }} />
        <i className="h" style={{ top: '33.33%' }} />
        <i className="h" style={{ top: '66.66%' }} />
      </div>
      <div className="hud-layer">
        <Hud
          hud={hud || SAMPLE_HUD}
          mission={mission || MISSIONS[0]}
          op={op || OPERATORS[0]}
          radio={SAMPLE_RADIO}
          layout={layout}
          touch={touch}
          mul={hudOpacity}
          editor={editor}
        />
        {touch && <TouchControls hud={hud || SAMPLE_HUD} op={op || OPERATORS[0]} layout={layout} settings={previewSettings} editor={editor} />}
      </div>

      <div className={`le-panel ${panelTop ? 'top' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
        <div className="le-head">
          <b>{touch ? 'スマホ横画面レイアウト' : 'PCレイアウト'}</b>
          <span>ドラッグで移動・タップで選択</span>
          <button type="button" className="le-icon" onClick={() => setPanelTop((v) => !v)} title="パネルを移動">
            {panelTop ? '▼' : '▲'}
          </button>
        </div>
        <div className="le-chips">
          {items.map((e) => (
            <button type="button" key={e.id} className={sel === e.id ? 'active' : ''} onClick={() => setSel(e.id)}>
              {e.label}
            </button>
          ))}
        </div>
        {cur ? (
          <div className="le-sel">
            <div className="le-sel-name">{elementLabel(sel)}</div>
            <Slider label="大きさ" value={cur.s} min={0.4} max={2} onChange={(v) => patch({ s: v })} />
            <Slider label="不透明度" value={cur.o} min={0.1} max={1} onChange={(v) => patch({ o: v })} />
            <button type="button" className="btn small" onClick={() => patch(defaultLayout(mode)[sel])}>
              この要素を初期配置に戻す
            </button>
          </div>
        ) : (
          <div className="le-global">
            <Slider label="HUD 全体の不透明度" value={hudOpacity} min={0.2} max={1} onChange={setHudOpacity} />
            {touch && <Slider label="ボタン全体の不透明度" value={controlOpacity} min={0.15} max={1} onChange={setControlOpacity} />}
          </div>
        )}
        <div className="le-actions">
          <button type="button" className="btn btn-ghost small" onClick={() => setLayout(defaultLayout(mode))}>
            すべて初期化
          </button>
          <button type="button" className="btn small" onClick={onCancel}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary small" onClick={() => onSave(layout, { hudOpacity, controlOpacity })}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 設定画面。操作モード・タッチ操作の挙動・透明度・カメラ・レイアウト編集。
 */
export default function SettingsModal({ settings, onChange, onClose, mission, op, hud, overGame, currentTouch }) {
  const [editing, setEditing] = useState(null);
  const set = (p) => onChange({ ...settings, ...p });

  if (editing) {
    return (
      <LayoutEditor
        mode={editing}
        settings={settings}
        mission={mission}
        op={op}
        hud={hud}
        overGame={overGame}
        onCancel={() => setEditing(null)}
        onSave={(layout, extra) => {
          onChange({ ...settings, ...extra, layouts: { ...settings.layouts, [editing]: layout } });
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>SETTINGS</h2>
          <span className="set-now">{currentTouch ? 'タッチ操作で表示中' : 'PC操作で表示中'}</span>
        </div>
        <div className="settings-grid">
          <section>
            <h3>操作</h3>
            <Segment
              label="操作モード"
              value={settings.controlMode}
              options={[
                ['auto', `自動（${isCoarsePointer() ? 'タッチ' : 'PC'}）`],
                ['pc', 'PC'],
                ['touch', 'スマホ'],
              ]}
              onChange={(v) => set({ controlMode: v })}
            />
            <Slider label="カメラの距離" value={settings.zoom} min={0.7} max={1.3} onChange={(v) => set({ zoom: v })} format={(v) => (v < 0.98 ? `広い ${pct(v)}` : v > 1.02 ? `近い ${pct(v)}` : `標準`)} />
            <Slider label="HUD の不透明度" value={settings.hudOpacity} min={0.2} max={1} onChange={(v) => set({ hudOpacity: v })} />
            <Slider label="ボタンの不透明度" value={settings.controlOpacity} min={0.15} max={1} onChange={(v) => set({ controlOpacity: v })} />
            <h3>レイアウト</h3>
            <p className="set-note">HUD（体力ゲージ・弾薬／リロードゲージ・オペレーション表示など）とボタンを、ドラッグ＆ドロップで動かし、バーで大きさを変えられます。</p>
            <div className="set-btns">
              <button type="button" className="btn" onClick={() => setEditing('touch')}>
                スマホ横画面<small>レイアウト編集</small>
              </button>
              <button type="button" className="btn" onClick={() => setEditing('pc')}>
                PC<small>レイアウト編集</small>
              </button>
            </div>
          </section>
          <section>
            <h3>タッチ操作</h3>
            <Segment
              label="視点操作"
              value={settings.aimStickMode}
              options={[
                ['fixed', '固定'],
                ['float', '移動'],
              ]}
              onChange={(v) => set({ aimStickMode: v })}
            />
            <p className="set-note">
              {settings.aimStickMode === 'float'
                ? '画面右側の触れた位置が、照準スティックの中心になります。'
                : '照準スティックは、レイアウト編集で配置した場所に固定されます。'}
            </p>
            <Toggle label="フローティングスティック"desc="画面左側のどこを触っても移動スティックが出る" value={settings.floatingStick} onChange={(v) => set({ floatingStick: v })} />
            <Toggle label="ダッシュを切り替え式にする" desc="オフにすると押している間だけダッシュ" value={settings.dashToggle} onChange={(v) => set({ dashToggle: v })} />
            <Toggle label="スティックを端まで倒してダッシュ" value={settings.stickDash} onChange={(v) => set({ stickDash: v })} />
            <Toggle label="照準スティックで自動射撃" desc="照準スティックを大きく倒すと撃つ" value={settings.aimAutoFire} onChange={(v) => set({ aimAutoFire: v })} />
            <Toggle label="移動方向に自動で向く" desc="一度照準するまで、ライトが進行方向を向く" value={settings.autoFace} onChange={(v) => set({ autoFace: v })} />
            <Toggle label="タップした場所に照準" desc={settings.aimStickMode === 'float' ? '視点操作が「移動」の間、画面右側は照準スティックになる' : 'ボタン以外の画面をタッチした方向を向く'} value={settings.tapAim} onChange={(v) => set({ tapAim: v })} />
            <Toggle label="振動" value={settings.vibrate} onChange={(v) => set({ vibrate: v })} />
          </section>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  );
}
