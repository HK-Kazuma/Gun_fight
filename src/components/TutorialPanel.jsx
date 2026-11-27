import { useEffect, useRef, useState } from 'react';
import { KEYS, TUTORIAL } from '../game/tutorial.js';
import { getOp } from '../game/operators.js';

// 「[[F]]」のような書き方をキー表示に変える
export function KeyText({ text }) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((s, i) =>
        s.startsWith('[[') ? (
          <span key={i} className="kbd tut-kbd">
            {s.slice(2, -2)}
          </span>
        ) : (
          <span key={i}>{s}</span>
        ),
      )}
    </>
  );
}

/**
 * チュートリアルの指示パネル。
 * 作業する項目は画面上部の細いパネル、説明だけの項目は中央のカードで表示する。
 */
export default function TutorialPanel({ tut, touch, radio, gameRef, paused, intro }) {
  const k = touch ? KEYS.touch : KEYS.pc;
  const chapter = TUTORIAL[tut.ci];
  const step = chapter && chapter.steps[tut.si];
  const [banner, setBanner] = useState(null);
  const firstCi = useRef(tut.ci);
  const [openId, setOpenId] = useState(null); // 小さい表示から説明を開き直した項目

  // 章が変わったら見出しを出す（最初の章は作戦名の表示と重なるので出さない）
  useEffect(() => {
    if (!chapter || tut.ci === firstCi.current) return undefined;
    firstCi.current = -1;
    setBanner(tut.ci);
    const id = setTimeout(() => setBanner(null), 2400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tut.ci]);

  // ENTER で説明を読み進める
  useEffect(() => {
    if (intro) return undefined;
    const onKey = (e) => {
      if (e.repeat) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') gameRef.current && gameRef.current.tutNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameRef, intro]);

  if (!step || tut.state === 'finished' || intro) return null;
  const g = () => gameRef.current;
  const op = chapter.op ? getOp(chapter.op) : null;
  const last = radio.length ? radio[radio.length - 1] : null;
  const text = step.text(k, touch);
  const total = chapter.steps.length;
  const reading = tut.readT > 0;
  const open = reading || openId === step.id;
  // 小さい表示では、この項目で使うキーだけを並べる
  const keys = [...new Set(text.match(/\[\[[^\]]+\]\]/g) || [])];

  return (
    <>
      {banner !== null && (
        <div className="tut-banner" style={op ? { '--op': op.color } : undefined}>
          <small>
            CHAPTER {tut.ci + 1} / {TUTORIAL.length}
          </small>
          <b>{chapter.name}</b>
          <span>{chapter.ja}</span>
        </div>
      )}

      {step.info ? (
        !paused && (
          <div className="tut-card-wrap">
            <div className="tut-card" style={op ? { '--op': op.color } : undefined}>
              <div className="tut-card-head">
                <small>
                  {chapter.name} — {chapter.ja}
                </small>
                <h2>{step.title}</h2>
              </div>
              {op && (
                <div className="tut-op-stats">
                  <span>
                    HP <b>{op.hp}</b>
                  </span>
                  <span>
                    武器 <b>{op.weapon.name}</b>
                  </span>
                  <span>
                    アビリティ <b>{op.ability.name}</b>
                  </span>
                  <span>
                    再使用 <b>{op.ability.cd}s</b>
                  </span>
                </div>
              )}
              <p className="tut-card-text">
                <KeyText text={text} />
              </p>
              {step.points && (
                <ul className="tut-points">
                  {step.points(k).map((pt, i) => (
                    <li key={i}>
                      <KeyText text={pt} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="tut-card-actions">
                <button className="btn btn-primary" onClick={() => g() && g().tutNext()}>
                  {step.final ? 'FINISH' : 'NEXT'}
                  <small>{step.final ? '訓練を終える' : touch ? '次へ' : 'ENTER で次へ'}</small>
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className={`tut-panel ${tut.state} ${open ? 'full' : 'mini'}`} style={op ? { '--op': op.color } : undefined}>
          <div className="tut-panel-head">
            <span className="tut-step-no">
              {chapter.name} {tut.si + 1}/{total}
            </span>
            <b>{step.title}</b>
            {tut.state === 'done' && <span className="tut-flag ok">CLEAR</span>}
            {tut.state === 'reset' && <span className="tut-flag ng">RETRY</span>}
            {!open && tut.progress && <span className="tut-progress">{tut.progress}</span>}
            <span className="tut-tools">
              {!reading && (
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setOpenId(open ? null : step.id);
                  }}
                >
                  {open ? '閉じる' : '説明'}
                </button>
              )}
              <button onClick={() => g() && g().tutRetry()} title="この項目を最初からやり直す">
                やり直す
              </button>
              <button onClick={() => g() && g().tutSkip()} title="この項目を飛ばす">
                スキップ ▸
              </button>
            </span>
          </div>
          {open && (
            <p className="tut-text">
              <KeyText text={text} />
            </p>
          )}
          {!open && keys.length > 0 && (
            <div className="tut-keys">
              <KeyText text={keys.join('')} />
            </div>
          )}
          {reading && (
            <div className="tut-wait">
              <span>指示を確認しろ — あと {Math.ceil(tut.readT)} 秒で開始</span>
              <i style={{ width: `${(tut.readT / tut.readMax) * 100}%` }} />
            </div>
          )}
          {((open && tut.progress) || last) && (
            <div className="tut-foot">
              {open && tut.progress && <span className="tut-progress">{tut.progress}</span>}
              {last && (
                <span className="tut-radio">
                  <b>{last.from}</b> {last.text}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
