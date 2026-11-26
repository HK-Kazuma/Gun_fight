import { elementLabel } from '../game/settings.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// レイアウト値（アンカー＋オフセット）から CSS を作る
export function placeStyle(l) {
  return {
    left: `calc(${l.ax * 100}% + ${l.dx}px)`,
    top: `calc(${l.ay * 100}% + ${l.dy}px)`,
    transform: `translate(${-l.ax * 100}%, ${-l.ay * 100}%) scale(${l.s})`,
    transformOrigin: `${l.ax * 100}% ${l.ay * 100}%`,
  };
}

// ドラッグ後の位置から、最も近いアンカーとオフセットを求める
function toAnchor(left, top, w, h, W, H) {
  const cx = left + w / 2;
  const cy = top + h / 2;
  const ax = cx < W / 3 ? 0 : cx > (W * 2) / 3 ? 1 : 0.5;
  const ay = cy < H / 3 ? 0 : cy > (H * 2) / 3 ? 1 : 0.5;
  let dx = left + ax * w - ax * W;
  let dy = top + ay * h - ay * H;
  // 画面の端・中央に吸着
  if (Math.abs(dx) < 8) dx = 0;
  if (Math.abs(dy) < 8) dy = 0;
  return { ax, ay, dx: Math.round(dx), dy: Math.round(dy) };
}

/**
 * HUD やボタンを配置するラッパー。
 * editor が渡されると、ドラッグ＆ドロップで移動できる編集モードになる。
 */
export default function Placed({ id, layout, mul = 1, editor, className = '', style, children, interactive, ...rest }) {
  const l = layout[id];
  if (!l) return null;

  const onPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    editor.onSelect(id);
    const el = e.currentTarget;
    const parent = el.offsetParent;
    if (!parent) return;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const C = parent.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev) => {
      const left = clamp(r.left - C.left + ev.clientX - sx, 0, Math.max(0, C.width - r.width));
      const top = clamp(r.top - C.top + ev.clientY - sy, 0, Math.max(0, C.height - r.height));
      editor.onChange(id, toAnchor(left, top, r.width, r.height, C.width, C.height));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const cls = ['placed', className, interactive && !editor ? 'interactive' : '', editor ? 'editing' : '', editor && editor.selected === id ? 'sel' : '']
    .filter(Boolean)
    .join(' ');
  const st = { ...placeStyle(l), ...style };
  const opacity = clamp(l.o * mul, 0.05, 1);

  return (
    <div className={cls} style={st} onPointerDown={editor ? onPointerDown : undefined} data-id={id} {...(editor ? {} : rest)}>
      <div className="placed-body" style={{ opacity }}>
        {children}
      </div>
      {editor && <span className="placed-tag">{elementLabel(id)}</span>}
    </div>
  );
}
