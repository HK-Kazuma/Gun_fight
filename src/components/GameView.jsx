import { useEffect, useRef, useState } from 'react';
import { Game } from '../game/engine.js';
import { MISSIONS } from '../game/maps.js';
import { getOp } from '../game/operators.js';
import { audio } from '../game/audio.js';
import { resolveTouch } from '../game/settings.js';
import Hud from './Hud.jsx';
import TouchControls from './TouchControls.jsx';
import SettingsModal from './Settings.jsx';
import TutorialPanel from './TutorialPanel.jsx';

export default function GameView({ missionIndex, opId, tutorialChapter = 0, onEnd, onQuit, runKey, onRestart, settings, onSettings }) {
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const gameRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [radio, setRadio] = useState([]);
  const [paused, setPaused] = useState(false);
  const [intro, setIntro] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const touch = resolveTouch(settings);
  const layout = settings.layouts[touch ? 'touch' : 'pc'];
  const mission = MISSIONS[missionIndex];
  // チュートリアルでは章ごとに隊員が切り替わるので、ゲームから届いた隊員を使う
  const op = getOp((hud && hud.opId) || opId);
  const tut = hud && hud.tutorial;

  useEffect(() => {
    audio.init();
    audio.startAmbient();
    const g = new Game(canvasRef.current, {
      missionIndex,
      opId,
      tutorialChapter,
      onHud: setHud,
      onRadio: (m) => setRadio((r) => [...r.slice(-3), { ...m, t: Date.now() }]),
      onPause: setPaused,
      onEnd: (res) => onEnd(res),
      minimap: () => miniRef.current,
      touch,
      zoomMul: settings.zoom,
      autoFace: settings.autoFace,
      aimSpeed: settings.aimSpeed,
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

  // 設定の変更をゲームに反映
  useEffect(() => {
    gameRef.current && gameRef.current.setOptions({ touch, zoomMul: settings.zoom, autoFace: settings.autoFace, aimSpeed: settings.aimSpeed });
  }, [touch, settings.zoom, settings.autoFace, settings.aimSpeed]);

  // タッチ操作で縦向きになったらポーズ
  useEffect(() => {
    if (!touch) return undefined;
    const check = () => {
      const g = gameRef.current;
      if (g && !g.ended && !g.paused && window.innerHeight > window.innerWidth) g.setPaused(true);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [touch]);

  useEffect(() => {
    if (!paused) setShowSettings(false);
  }, [paused]);

  const resume = () => gameRef.current && gameRef.current.setPaused(false);

  return (
    <div className={`screen game-screen ${touch ? 'touch-mode' : ''}`}>
      <canvas ref={canvasRef} className="game-canvas" />

      {intro && (
        <div className="mission-intro">
          <div className="mi-loc">{mission.location}</div>
          <div className="mi-code">{mission.code}</div>
          <div className="mi-title">{mission.title}</div>
        </div>
      )}

      {hud && !(paused && showSettings) && (
        <div className="hud-layer">
          <Hud hud={hud} mission={mission} op={op} radio={radio} layout={layout} touch={touch} miniRef={miniRef} mul={settings.hudOpacity} />
          {touch && !paused && <TouchControls gameRef={gameRef} hud={hud} op={op} layout={layout} settings={settings} />}
        </div>
      )}

      {tut && !(paused && showSettings) && (
        <div className={`tut-layer ${touch ? 'touch' : ''}`}>
          <TutorialPanel tut={tut} touch={touch} radio={radio} gameRef={gameRef} paused={paused} intro={intro} />
        </div>
      )}

      {touch && (
        <div className="rotate-hint">
          <div className="rotate-icon" />
          端末を横向きにしてください
        </div>
      )}

      {paused && !showSettings && (
        <div className="overlay">
          <div className="pause-box">
            <h2>PAUSED</h2>
            <button className="btn btn-primary" onClick={resume}>
              RESUME<small>再開</small>
            </button>
            {tut && (
              <button
                className="btn"
                onClick={() => {
                  gameRef.current && gameRef.current.tutRetry();
                  resume();
                }}
              >
                RETRY STEP<small>この項目をやり直す</small>
              </button>
            )}
            <button className="btn" onClick={onRestart}>
              RESTART<small>{tut ? '選んだ章の最初から' : '最初から'}</small>
            </button>
            <button className="btn" onClick={() => setShowSettings(true)}>
              SETTINGS<small>設定・レイアウト</small>
            </button>
            <button className="btn" onClick={onQuit}>
              ABORT<small>ブリーフィングへ戻る</small>
            </button>
            {tut ? (
              <div className="pause-tip">TIP: 指示パネルの「スキップ」で項目を飛ばせる。ブリーフィング画面では、好きな章から始められる。</div>
            ) : (
              <div className="pause-tip">TIP: 気付かれていない容疑者や、閃光弾で混乱した容疑者は {touch ? '投降勧告ボタン' : '[F] の投降勧告'}に応じやすい。逮捕は無力化の3倍のスコア。</div>
            )}
          </div>
        </div>
      )}

      {paused && showSettings && (
        <SettingsModal
          settings={settings}
          onChange={onSettings}
          onClose={() => setShowSettings(false)}
          mission={mission}
          op={op}
          hud={hud}
          overGame
          currentTouch={touch}
        />
      )}
    </div>
  );
}
