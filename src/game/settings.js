// 設定（操作モード・透明度・HUD／ボタン配置）の定義と保存

const KEY = 'breach_clear_settings_v1';

// 配置できる要素の一覧
// kind: 'hud' は情報表示、'ctrl' はタッチ操作のボタン
// modes: どの操作モードで表示されるか
export const ELEMENTS = [
  { id: 'objectives', label: 'オペレーション（目標）', kind: 'hud', modes: ['pc', 'touch'] },
  { id: 'timer', label: 'タイマー', kind: 'hud', modes: ['pc', 'touch'] },
  { id: 'scoremap', label: 'スコア／ミニマップ', kind: 'hud', modes: ['pc', 'touch'] },
  { id: 'radio', label: '無線ログ', kind: 'hud', modes: ['pc', 'touch'] },
  { id: 'hp', label: '体力ゲージ', kind: 'hud', modes: ['pc', 'touch'] },
  { id: 'weapon', label: '弾薬／リロードゲージ', kind: 'hud', modes: ['pc', 'touch'] },
  { id: 'ability', label: 'アビリティ表示', kind: 'hud', modes: ['pc'] },
  { id: 'prompt', label: 'アクション表示', kind: 'hud', modes: ['pc', 'touch'] },
  { id: 'keyhints', label: 'キー操作ガイド', kind: 'hud', modes: ['pc'] },
  { id: 'moveStick', label: '移動スティック', kind: 'ctrl', modes: ['touch'] },
  { id: 'aimStick', label: '照準スティック', kind: 'ctrl', modes: ['touch'] },
  { id: 'fire', label: '射撃ボタン', kind: 'ctrl', modes: ['touch'] },
  { id: 'reload', label: 'リロードボタン', kind: 'ctrl', modes: ['touch'] },
  { id: 'dash', label: 'ダッシュボタン', kind: 'ctrl', modes: ['touch'] },
  { id: 'shout', label: '投降勧告ボタン', kind: 'ctrl', modes: ['touch'] },
  { id: 'interact', label: 'アクションボタン（E）', kind: 'ctrl', modes: ['touch'] },
  { id: 'abilityBtn', label: 'アビリティボタン', kind: 'ctrl', modes: ['touch'] },
  { id: 'pause', label: 'ポーズボタン', kind: 'ctrl', modes: ['touch'] },
];

export const elementLabel = (id) => (ELEMENTS.find((e) => e.id === id) || {}).label || id;

// タッチ操作の丸いボタンの基本サイズ（px）
export const CTRL_SIZE = {
  moveStick: 132,
  aimStick: 112,
  fire: 96,
  reload: 58,
  dash: 58,
  shout: 56,
  interact: 64,
  abilityBtn: 64,
  pause: 42,
};

// 位置は「アンカー（画面の左/中央/右 × 上/中央/下）＋オフセット(px)」で持つ。
// ax, ay は 0 / 0.5 / 1。要素の同じ割合の点がアンカー点に揃う。
// s: 大きさの倍率, o: 不透明度（0〜1）
const L = (ax, ay, dx, dy, s = 1, o = 1) => ({ ax, ay, dx, dy, s, o });

export const DEFAULT_LAYOUTS = {
  // 既存の PC 用レイアウトをそのまま再現
  pc: {
    objectives: L(0, 0, 4, 2),
    timer: L(0.5, 0, 0, -2),
    scoremap: L(1, 0, -4, 0),
    radio: L(0, 1, 4, -124),
    hp: L(0, 1, 4, -28),
    weapon: L(1, 1, -4, -28),
    ability: L(1, 1, -226, -28),
    prompt: L(0.5, 1, 0, -124),
    keyhints: L(0.5, 1, 0, 6),
  },
  // スマホ横画面用：左に移動スティック、右に射撃を中心とした丸ボタン群
  touch: {
    objectives: L(0, 0, 0, 0, 0.72),
    timer: L(0.5, 0, 0, -4, 0.7),
    scoremap: L(1, 0, -54, 0, 0.6),
    radio: L(0.5, 0, 0, 50, 0.72),
    hp: L(0.5, 1, -96, -2, 0.62),
    weapon: L(0.5, 1, 92, -2, 0.62),
    prompt: L(0.5, 1, 0, -64, 0.8),
    moveStick: L(0, 1, 22, -10),
    dash: L(0, 1, 34, -162),
    fire: L(1, 1, -8, -10),
    aimStick: L(1, 1, -128, -4),
    reload: L(1, 1, -27, -122),
    abilityBtn: L(1, 1, -110, -128),
    shout: L(1, 1, -206, -134),
    interact: L(1, 1, -24, -206),
    pause: L(1, 0, 0, 0),
  },
};

export const DEFAULT_SETTINGS = {
  controlMode: 'auto', // 'auto' | 'pc' | 'touch'
  hudOpacity: 1,
  controlOpacity: 0.7,
  zoom: 1,
  floatingStick: true, // 画面左側のどこを触ってもスティックが出る
  dashToggle: true, // ダッシュボタンを押すたびに切り替え
  stickDash: false, // スティックを端まで倒すとダッシュ
  aimAutoFire: false, // 照準スティックを大きく倒すと自動射撃
  autoFace: true, // 照準していない時は移動方向を向く
  tapAim: true, // 画面右側をタップした位置に照準
  vibrate: true,
  layouts: DEFAULT_LAYOUTS,
};

const cloneLayouts = (l) => JSON.parse(JSON.stringify(l));

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return { ...DEFAULT_SETTINGS, layouts: cloneLayouts(DEFAULT_LAYOUTS) };
    const layouts = cloneLayouts(DEFAULT_LAYOUTS);
    for (const mode of ['pc', 'touch']) {
      const saved = (raw.layouts && raw.layouts[mode]) || {};
      for (const id of Object.keys(layouts[mode])) if (saved[id]) layouts[mode][id] = { ...layouts[mode][id], ...saved[id] };
    }
    return { ...DEFAULT_SETTINGS, ...raw, layouts };
  } catch {
    return { ...DEFAULT_SETTINGS, layouts: cloneLayouts(DEFAULT_LAYOUTS) };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても続行 */
  }
}

export const defaultLayout = (mode) => cloneLayouts(DEFAULT_LAYOUTS[mode]);

export function isCoarsePointer() {
  if (typeof window === 'undefined') return false;
  return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
}

export function resolveTouch(settings) {
  if (settings.controlMode === 'touch') return true;
  if (settings.controlMode === 'pc') return false;
  return isCoarsePointer();
}
