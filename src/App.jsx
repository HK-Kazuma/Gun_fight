import { useCallback, useEffect, useState } from 'react';
import Title from './components/Title.jsx';
import Briefing from './components/Briefing.jsx';
import GameView from './components/GameView.jsx';
import Result from './components/Result.jsx';
import { AchievementsModal, ControlsModal } from './components/Modals.jsx';
import { ACHIEVEMENTS, applyResult, loadSave } from './game/achievements.js';
import { MISSIONS } from './game/maps.js';
import { audio } from './game/audio.js';
import SettingsModal from './components/Settings.jsx';
import { loadSettings, saveSettings, resolveTouch } from './game/settings.js';

// スマホではフルスクリーン＋横向き固定を試みる（対応していない端末では何もしない）
function enterLandscape() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}))
        .catch(() => {});
    }
  } catch {
    /* 非対応 */
  }
}

export default function App() {
  const [screen, setScreen] = useState('title');
  const [modal, setModal] = useState(null);
  const [save, setSave] = useState(() => loadSave());
  // 訓練を終えるまでは、作戦一覧の先頭（チュートリアル）を選んでおく
  const [missionIndex, setMissionIndex] = useState(() => (save.tutorialDone ? 1 : 0));
  const [tutChapter, setTutChapter] = useState(0);
  const [opId, setOpId] = useState('holt');
  const [result, setResult] = useState(null);
  const [unlocked, setUnlocked] = useState([]);
  const [runKey, setRunKey] = useState(0);
  const [muted, setMuted] = useState(false);
  const [settings, setSettingsState] = useState(() => loadSettings());
  const setSettings = useCallback((s) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);
  const touch = resolveTouch(settings);
  const [soundReady, setSoundReady] = useState(false);

  // タイトル／ブリーフィングでは BGM を流す。ブラウザの制限で、最初の操作があるまでは音を出せない
  useEffect(() => {
    const menu = screen === 'title' || screen === 'brief';
    if (!menu) {
      audio.stopTitleMusic();
      return undefined;
    }
    const begin = () => {
      audio.init();
      audio.startTitleMusic();
      setSoundReady(true);
    };
    if (audio.ctx) begin();
    window.addEventListener('pointerdown', begin);
    window.addEventListener('keydown', begin);
    return () => {
      window.removeEventListener('pointerdown', begin);
      window.removeEventListener('keydown', begin);
    };
  }, [screen]);

  const deploy = useCallback(() => {
    audio.init();
    if (touch) enterLandscape();
    setRunKey((k) => k + 1);
    setScreen('game');
  }, [touch]);

  const onEnd = useCallback(
    (r) => {
      setSave((prev) => {
        const { save: next, unlocked: u } = applyResult(prev, r);
        setUnlocked(u);
        return next;
      });
      setResult(r);
      setScreen('result');
    },
    [],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Enter' || modal) return;
      if (screen === 'title') {
        audio.init();
        setScreen('brief');
      } else if (screen === 'brief') deploy();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, modal, deploy]);

  const toggleMute = () => {
    audio.init();
    audio.setMuted(!muted);
    setMuted(!muted);
  };

  return (
    <div className={`app ${touch ? 'is-touch' : ''}`}>
      {screen === 'title' && (
        <Title
          onStart={() => {
            audio.init();
            setScreen('brief');
          }}
          onAchievements={() => setModal('ach')}
          onControls={() => setModal('ctrl')}
          onSettings={() => setModal('settings')}
          soundReady={soundReady}
          muted={muted}
          onToggleMute={toggleMute}
          unlockedCount={Object.keys(save.achievements).length}
          totalAch={ACHIEVEMENTS.length}
        />
      )}
      {screen === 'brief' && (
        <Briefing
          missionIndex={missionIndex}
          setMissionIndex={setMissionIndex}
          opId={opId}
          setOpId={setOpId}
          tutChapter={tutChapter}
          setTutChapter={setTutChapter}
          onDeploy={deploy}
          onBack={() => setScreen('title')}
          save={save}
        />
      )}
      {screen === 'game' && (
        <GameView
          key={runKey}
          runKey={runKey}
          missionIndex={missionIndex}
          opId={opId}
          tutorialChapter={tutChapter}
          onEnd={onEnd}
          onQuit={() => setScreen('brief')}
          onRestart={deploy}
          settings={settings}
          onSettings={setSettings}
        />
      )}
      {screen === 'result' && result && (
        <Result
          result={result}
          unlocked={unlocked}
          onRetry={deploy}
          onNext={() => {
            setMissionIndex((i) => Math.min(MISSIONS.length - 1, i + 1));
            deploy();
          }}
          onBrief={() => setScreen('brief')}
          onTitle={() => setScreen('title')}
        />
      )}
      {modal === 'ach' && <AchievementsModal save={save} onClose={() => setModal(null)} />}
      {modal === 'ctrl' && <ControlsModal touch={touch} onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsModal settings={settings} onChange={setSettings} onClose={() => setModal(null)} currentTouch={touch} />}
    </div>
  );
}
