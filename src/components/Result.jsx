import TitleBackdrop from './TitleBackdrop.jsx';
import { ACHIEVEMENTS } from '../game/achievements.js';
import { MISSIONS } from '../game/maps.js';
import { getOp } from '../game/operators.js';

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export default function Result({ result, unlocked, onRetry, onNext, onBrief, onTitle }) {
  const r = result;
  const op = getOp(r.opId);
  const hasNext = r.success && r.missionIndex < MISSIONS.length - 1;
  return (
    <div className="screen result-screen">
      <TitleBackdrop dim={0.82} />
      <div className={`result-box ${r.success ? 'ok' : 'ng'}`}>
        <div className="rb-head">
          <div>
            <div className="rb-code">{r.missionCode}</div>
            <h1>{r.success ? 'MISSION COMPLETE' : 'MISSION FAILED'}</h1>
            <div className="rb-reason">
              {r.reason} — {r.detail}
            </div>
          </div>
          <div className={`rank rank-${r.rank === '-' ? 'F' : r.rank}`}>
            <small>RANK</small>
            {r.rank === '-' ? 'F' : r.rank}
          </div>
        </div>
        <div className="rb-body">
          <div className="rb-col">
            <h3>SCORE BREAKDOWN</h3>
            <table>
              <tbody>
                {r.breakdown.map(([k, v]) => (
                  <tr key={k} className={v < 0 ? 'neg' : ''}>
                    <td>{k}</td>
                    <td>{v > 0 ? `+${v.toLocaleString()}` : v.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>TOTAL</td>
                  <td>{r.score.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rb-col">
            <h3>AFTER ACTION REPORT</h3>
            <div className="aar">
              <div>
                <b>{op.name}</b>
                <span>OPERATOR</span>
              </div>
              <div>
                <b>{fmt(r.time)}</b>
                <span>TIME</span>
              </div>
              <div>
                <b>{r.stats.arrested}</b>
                <span>ARRESTED</span>
              </div>
              <div>
                <b>{r.stats.neutralized}</b>
                <span>NEUTRALIZED</span>
              </div>
              <div>
                <b>{r.stats.rescued}</b>
                <span>RESCUED</span>
              </div>
              <div>
                <b>{Math.round(r.stats.accuracy * 100)}%</b>
                <span>ACCURACY</span>
              </div>
              <div>
                <b>{Math.round(r.stats.damageTaken)}</b>
                <span>DMG TAKEN</span>
              </div>
              <div>
                <b>{r.stats.unauthorized}</b>
                <span>VIOLATIONS</span>
              </div>
            </div>
            {unlocked.length > 0 && (
              <div className="new-ach">
                <h3>ACHIEVEMENT UNLOCKED</h3>
                {unlocked.map((id) => {
                  const a = ACHIEVEMENTS.find((x) => x.id === id);
                  return (
                    <div key={id} className="ach-pop">
                      <span className="medal">★</span>
                      <div>
                        <b>{a.name}</b> <em>{a.ja}</em>
                        <p>{a.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="rb-actions">
          {hasNext && (
            <button className="btn btn-primary" onClick={onNext}>
              NEXT OPERATION<small>次の作戦へ</small>
            </button>
          )}
          <button className={`btn ${hasNext ? '' : 'btn-primary'}`} onClick={onRetry}>
            RETRY<small>再挑戦</small>
          </button>
          <button className="btn" onClick={onBrief}>
            BRIEFING<small>作戦・隊員選択</small>
          </button>
          <button className="btn btn-ghost" onClick={onTitle}>
            TITLE
          </button>
        </div>
      </div>
    </div>
  );
}
