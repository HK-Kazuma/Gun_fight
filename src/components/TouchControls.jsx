import { useEffect, useRef, useState } from 'react';
import Placed from './Placed.jsx';
import { CTRL_SIZE } from '../game/settings.js';

const DEAD = 0.14;
const SLOP = 4; // これ以上指が動くまで照準は変えない（px）

// ---------- アイコン ----------
const I = {
  fire: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
      <circle cx="12" cy="12" r="1.6" className="fill" />
    </svg>
  ),
  reload: (
    <svg viewBox="0 0 24 24">
      <path d="M19 8a8 8 0 1 0 1 6" />
      <path d="M20 3v5h-5" />
    </svg>
  ),
  dash: (
    <svg viewBox="0 0 24 24">
      <path d="M5 6l6 6-6 6M12 6l6 6-6 6" />
    </svg>
  ),
  shout: (
    <svg viewBox="0 0 24 24">
      <path d="M3 10v4h4l7 5V5L7 10H3z" />
      <path d="M17.5 8.5a5 5 0 0 1 0 7M20 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24">
      <path d="M8 5v14M16 5v14" />
    </svg>
  ),
};

const vibrate = (on) => on && navigator.vibrate && navigator.vibrate(12);

function Ring({ value, className = '' }) {
  // value: 0〜1 の進み具合
  return (
    <svg className={`tc-ring ${className}`} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="47" className="tc-ring-bg" />
      <circle cx="50" cy="50" r="47" className="tc-ring-fg" style={{ strokeDashoffset: 295.3 * (1 - Math.max(0, Math.min(1, value))) }} />
    </svg>
  );
}

/**
 * スマホ横画面用のタッチ操作。
 * editor が渡されると見た目だけを表示し、ドラッグで配置を変えられる。
 */
export default function TouchControls({ gameRef, hud, op, layout, settings, editor }) {
  const mul = settings.controlOpacity;
  const pp = { layout, mul, editor };
  const moveKnob = useRef(null);
  const aimKnob = useRef(null);
  const layerRef = useRef(null);
  const st = useRef({ move: null, aim: null, fire: null, tap: null, dashBtn: false, stickEdge: false, fireBtn: false, aimFire: false });
  const [floatAt, setFloatAt] = useState(null);
  const [aimAt, setAimAt] = useState(null);
  const aimFloating = settings.aimStickMode === 'float';
  const [pressed, setPressed] = useState({});
  const [dashOn, setDashOn] = useState(false);
  const g = () => gameRef && gameRef.current;

  const setPress = (id, v) => setPressed((p) => (p[id] === v ? p : { ...p, [id]: v }));
  const syncSprint = () => {
    const s = st.current;
    g() && g().setSprint(s.dashBtn || s.stickEdge);
  };
  const syncFire = () => {
    const s = st.current;
    g() && g().setFire(s.fireBtn || s.aimFire);
  };

  // ---------- スティック共通 ----------
  const stickVec = (s, e) => {
    let x = (e.clientX - s.cx) / s.R;
    let y = (e.clientY - s.cy) / s.R;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y, m: Math.min(1, m) };
  };
  const setKnob = (ref, v, size) => {
    if (!ref.current) return;
    const r = size * 0.32;
    ref.current.style.transform = v ? `translate(${v.x * r}px, ${v.y * r}px)` : '';
  };

  // 指を置いた位置を「今の照準の向き」とみなし、そこからの相対操作にする
  const relativeAim = (e, R) => {
    const cur = g() ? g().getAimVec() : { x: 1, y: 0, m: 0.6 };
    const a = Math.atan2(cur.y, cur.x) || (g() ? g().aimAng : 0);
    // 中心に近すぎると向きが急に回るので、傾きに下限を設ける
    const m = Math.max(0.5, Math.min(settings.aimAutoFire ? 0.8 : 1, cur.m));
    const from = { x: Math.cos(a) * m, y: Math.sin(a) * m };
    return { cx: e.clientX - from.x * R, cy: e.clientY - from.y * R, R, from, sx: e.clientX, sy: e.clientY, dragged: false };
  };
  // 可動範囲を超えたら中心を指に追従させ、逆方向にもすぐ向けられるようにする
  const dragVec = (a, e) => {
    const v = stickVec(a, e);
    if (Math.hypot(e.clientX - a.cx, e.clientY - a.cy) > a.R) {
      a.cx = e.clientX - v.x * a.R;
      a.cy = e.clientY - v.y * a.R;
    }
    return v;
  };

  // ---------- 移動スティック ----------
  const moveStart = (e, floating) => {
    const s = st.current;
    if (s.move) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const layer = layerRef.current && layerRef.current.parentElement;
    if (!layer) return;
    const base = layer.querySelector('[data-id="moveStick"]');
    const l = layout.moveStick;
    const R = (CTRL_SIZE.moveStick * l.s) / 2;
    let cx;
    let cy;
    if (floating || !base) {
      cx = e.clientX;
      cy = e.clientY;
      const lr = layer.getBoundingClientRect();
      setFloatAt({ x: cx - lr.left, y: cy - lr.top });
    } else {
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    }
    s.move = { id: e.pointerId, cx, cy, R };
    setPress('moveStick', true);
    moveUpdate(e);
  };
  const moveUpdate = (e) => {
    const s = st.current;
    if (!s.move || s.move.id !== e.pointerId) return;
    const v = stickVec(s.move, e);
    setKnob(moveKnob, v, CTRL_SIZE.moveStick);
    const game = g();
    if (!game) return;
    game.setMove(v.m > DEAD ? { x: v.x, y: v.y } : null);
    const edge = settings.stickDash && v.m > 0.97;
    if (edge !== s.stickEdge) {
      s.stickEdge = edge;
      syncSprint();
    }
  };
  const moveEnd = (e) => {
    const s = st.current;
    if (!s.move || s.move.id !== e.pointerId) return;
    s.move = null;
    s.stickEdge = false;
    setKnob(moveKnob, null);
    setFloatAt(null);
    setPress('moveStick', false);
    g() && g().setMove(null);
    // トグル式ダッシュはスティックを離すと解除
    if (settings.dashToggle && s.dashBtn) {
      s.dashBtn = false;
      setDashOn(false);
    }
    syncSprint();
  };

  // ---------- 照準スティック ----------
  const aimStart = (e) => {
    const s = st.current;
    if (s.aim) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (aimFloating) {
      // 移動式：触れた位置をスティックの中心にする
      const layer = layerRef.current && layerRef.current.parentElement;
      if (!layer) return;
      const lr = layer.getBoundingClientRect();
      const R = (CTRL_SIZE.aimStick * layout.aimStick.s) / 2;
      s.aim = { id: e.pointerId, cx: e.clientX, cy: e.clientY, R, sx: e.clientX, sy: e.clientY, dragged: false, floating: true };
      setAimAt({ x: e.clientX - lr.left, y: e.clientY - lr.top });
      setKnob(aimKnob, null);
    } else {
      const r = e.currentTarget.getBoundingClientRect();
      s.aim = { id: e.pointerId, ...relativeAim(e, r.width / 2) };
      setKnob(aimKnob, s.aim.from, CTRL_SIZE.aimStick);
    }
    setPress('aimStick', true);
  };
  const aimUpdate = (e) => {
    const s = st.current;
    if (!s.aim || s.aim.id !== e.pointerId) return;
    if (!s.aim.dragged && Math.hypot(e.clientX - s.aim.sx, e.clientY - s.aim.sy) < SLOP) return;
    s.aim.dragged = true;
    // 移動式は中心を動かさない。固定式は可動範囲を超えると中心が指を追う
    const v = s.aim.floating ? stickVec(s.aim, e) : dragVec(s.aim, e);
    setKnob(aimKnob, v, CTRL_SIZE.aimStick);
    const game = g();
    if (!game) return;
    if (v.m > DEAD) game.setAim(v);
    const af = settings.aimAutoFire && v.m > 0.85;
    if (af !== s.aimFire) {
      s.aimFire = af;
      syncFire();
    }
  };
  const aimEnd = (e) => {
    const s = st.current;
    if (!s.aim || s.aim.id !== e.pointerId) return;
    s.aim = null;
    s.aimFire = false;
    setAimAt(null);
    setPress('aimStick', false);
    g() && g().setAim(null);
    syncFire();
  };

  // ---------- 射撃ボタン（押したままドラッグで照準も動かせる） ----------
  const fireStart = (e) => {
    const s = st.current;
    if (s.fire) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    s.fire = { id: e.pointerId, sx: e.clientX, sy: e.clientY, R: r.width * 0.9, dragged: false };
    s.fireBtn = true;
    vibrate(settings.vibrate);
    setPress('fire', true);
    syncFire();
  };
  const fireMove = (e) => {
    const s = st.current;
    if (!s.fire || s.fire.id !== e.pointerId) return;
    if (!s.fire.dragged) {
      if (Math.hypot(e.clientX - s.fire.sx, e.clientY - s.fire.sy) < s.fire.R * 0.2) return;
      // ドラッグし始めた位置を、今の照準の向きとして扱う
      Object.assign(s.fire, relativeAim(e, s.fire.R), { dragged: true });
      return;
    }
    g() && g().setAim(dragVec(s.fire, e));
  };
  const fireEnd = (e) => {
    const s = st.current;
    if (!s.fire || s.fire.id !== e.pointerId) return;
    if (s.fire.dragged) g() && g().setAim(null);
    s.fire = null;
    s.fireBtn = false;
    setPress('fire', false);
    syncFire();
  };

  // ---------- 画面タップで照準 ----------
  const tapStart = (e) => {
    const s = st.current;
    if (s.tap || !settings.tapAim) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    s.tap = e.pointerId;
    tapMove(e);
  };
  const tapMove = (e) => {
    const s = st.current;
    const game = g();
    if (s.tap !== e.pointerId || !game) return;
    const r = game.canvas.getBoundingClientRect();
    game.aimAtScreen(e.clientX - r.left, e.clientY - r.top);
  };
  const tapEnd = (e) => {
    if (st.current.tap === e.pointerId) st.current.tap = null;
  };

  // ---------- 普通のボタン ----------
  const btn = (id, down, up) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      vibrate(settings.vibrate);
      setPress(id, true);
      down && down();
    },
    onPointerUp: () => {
      setPress(id, false);
      up && up();
    },
    onPointerCancel: () => {
      setPress(id, false);
      up && up();
    },
  });
  const keyBtn = (id, code, hold) =>
    btn(
      id,
      () => g() && g().press(code),
      () => hold && g() && g().release(code),
    );
  const dashHandlers = btn(
    'dash',
    () => {
      const s = st.current;
      s.dashBtn = settings.dashToggle ? !s.dashBtn : true;
      setDashOn(s.dashBtn);
      syncSprint();
    },
    () => {
      if (settings.dashToggle) return;
      st.current.dashBtn = false;
      setDashOn(false);
      syncSprint();
    },
  );

  // 指を離している間も、ノブは最後の照準の向きを示す
  useEffect(() => {
    const game = g();
    if (editor || !game || st.current.aim || !game.aimLocked) return;
    setKnob(aimKnob, game.getAimVec(), CTRL_SIZE.aimStick);
  });

  // 画面から消える時に入力を解除
  useEffect(
    () => () => {
      const game = gameRef && gameRef.current;
      if (!game || editor) return;
      game.setMove(null);
      game.setAim(null);
      game.setFire(false);
      game.setSprint(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const live = !editor;
  const h = (handlers) => (live ? handlers : {});
  const abReady = hud.abilityCd <= 0;
  const ia = hud.interact && !hud.ended;
  const size = (id) => ({ width: CTRL_SIZE[id], height: CTRL_SIZE[id] });
  // 触れた位置にスティックを表示する
  const floatStyle = (at, l) =>
    at && l ? { left: at.x, top: at.y, transform: `translate(-50%, -50%) scale(${l.s})`, transformOrigin: '50% 50%' } : undefined;
  const aimHandlers = { onPointerDown: aimStart, onPointerMove: aimUpdate, onPointerUp: aimEnd, onPointerCancel: aimEnd };
  const tapHandlers = { onPointerDown: tapStart, onPointerMove: tapMove, onPointerUp: tapEnd, onPointerCancel: tapEnd };

  return (
    <>
      {live && (
        <div className="tc-zones">
          <div
            className="tc-zone left"
            onPointerDown={(e) => (settings.floatingStick ? moveStart(e, true) : tapStart(e))}
            onPointerMove={(e) => (st.current.move ? moveUpdate(e) : tapMove(e))}
            onPointerUp={(e) => (st.current.move ? moveEnd(e) : tapEnd(e))}
            onPointerCancel={(e) => (st.current.move ? moveEnd(e) : tapEnd(e))}
          />
          <div className="tc-zone right" {...(aimFloating ? aimHandlers : tapHandlers)} />
        </div>
      )}
      <span ref={layerRef} className="tc-anchor" />

      <Placed
        {...pp}
        id="moveStick"
        interactive
        style={floatStyle(floatAt, layout.moveStick)}
        onPointerDown={(e) => moveStart(e, false)}
        onPointerMove={moveUpdate}
        onPointerUp={moveEnd}
        onPointerCancel={moveEnd}
      >
        <div className={`tc-stick ${pressed.moveStick ? 'on' : ''}`} style={size('moveStick')}>
          <span className="tc-stick-label">MOVE</span>
          <div className="tc-knob" ref={moveKnob} />
        </div>
      </Placed>

      <Placed {...pp} id="aimStick" style={floatStyle(aimAt, layout.aimStick)} interactive {...h(aimHandlers)}>
        <div className={`tc-stick aim ${pressed.aimStick ? 'on' : ''}`} style={size('aimStick')}>
          <span className="tc-stick-label">AIM</span>
          <div className="tc-knob" ref={aimKnob}>
            {I.fire}
          </div>
        </div>
      </Placed>

      <Placed {...pp} id="fire" interactive {...h({ onPointerDown: fireStart, onPointerMove: fireMove, onPointerUp: fireEnd, onPointerCancel: fireEnd })}>
        <div className={`tc-btn fire ${pressed.fire ? 'on' : ''} ${hud.mag === 0 ? 'dim' : ''}`} style={size('fire')}>
          {I.fire}
          <span className="tc-sub">
            {hud.mag}/{hud.magMax}
          </span>
        </div>
      </Placed>

      <Placed {...pp} id="reload" interactive {...h(keyBtn('reload', 'KeyR'))}>
        <div className={`tc-btn ${pressed.reload ? 'on' : ''} ${hud.mag === 0 && hud.reload === 0 ? 'alert' : ''}`} style={size('reload')}>
          {hud.reload > 0 && <Ring value={hud.reload} className="amber" />}
          {I.reload}
          <span className="tc-label">RELOAD</span>
        </div>
      </Placed>

      <Placed {...pp} id="dash" interactive {...h(dashHandlers)}>
        <div className={`tc-btn ${pressed.dash || dashOn ? 'on' : ''} ${dashOn ? 'latched' : ''}`} style={size('dash')}>
          {I.dash}
          <span className="tc-label">DASH</span>
        </div>
      </Placed>

      <Placed {...pp} id="shout" interactive {...h(keyBtn('shout', 'KeyF'))}>
        <div className={`tc-btn ${pressed.shout ? 'on' : ''}`} style={size('shout')}>
          {I.shout}
          <span className="tc-label">投降勧告</span>
        </div>
      </Placed>

      <Placed {...pp} id="interact" interactive {...h(keyBtn('interact', 'KeyE', true))}>
        <div className={`tc-btn interact ${pressed.interact ? 'on' : ''} ${ia || editor ? 'ready' : 'dim'}`} style={size('interact')}>
          {ia && hud.interact.hold && <Ring value={hud.interact.prog} className="amber" />}
          <b className="tc-letter">E</b>
          <span className="tc-label">ACTION</span>
        </div>
      </Placed>

      <Placed {...pp} id="abilityBtn" style={{ '--op': op.color }} interactive {...h(keyBtn('abilityBtn', 'KeyQ'))}>
        <div className={`tc-btn ability ${pressed.abilityBtn ? 'on' : ''} ${abReady ? 'ready' : 'dim'} ${hud.abilityActive > 0 ? 'live' : ''}`} style={size('abilityBtn')}>
          <Ring value={1 - hud.abilityCd / hud.abilityMax} className="op" />
          <b className="tc-letter">{abReady ? 'Q' : Math.ceil(hud.abilityCd)}</b>
          <span className="tc-label">{op.ability.name}</span>
        </div>
      </Placed>

      <Placed {...pp} id="pause" interactive {...h(btn('pause', () => g() && g().setPaused(true)))}>
        <div className={`tc-btn small ${pressed.pause ? 'on' : ''}`} style={size('pause')}>
          {I.pause}
        </div>
      </Placed>
    </>
  );
}
