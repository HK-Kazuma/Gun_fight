import { MISSIONS } from './maps.js';

export const ACHIEVEMENTS = [
  { id: 'first', name: 'FIRST DEPLOYMENT', ja: '初出動', desc: 'いずれかのミッションをクリアする' },
  { id: 'pacifist', name: 'BY THE BOOK', ja: '教本通り', desc: '容疑者を1人も無力化せず、全員を逮捕してクリア' },
  { id: 'untouched', name: 'UNTOUCHED', ja: '無傷の帰還', desc: 'ダメージを受けずにクリア' },
  { id: 'speed', name: 'RAPID RESPONSE', ja: '迅速展開', desc: 'OPERATION NIGHTFALLを75秒以内にクリア' },
  { id: 'demo', name: 'DEMOLITION', ja: '爆破専門家', desc: '1回の爆発で容疑者を2人以上無力化' },
  { id: 'zero', name: 'ZERO HOUR', ja: 'ゼロアワー', desc: '時限爆弾を解除してOPERATION ZERO HOURをクリア' },
  { id: 'elite', name: 'ELITE UNIT', ja: 'エリート部隊', desc: 'いずれかのミッションでSランクを獲得' },
  { id: 'sharp', name: 'SHARPSHOOTER', ja: '精密射撃', desc: '10発以上撃って命中率70%以上でクリア' },
  { id: 'squad', name: 'FULL SQUAD', ja: 'フルスクワッド', desc: '4人全員のオペレーターでミッションをクリア' },
  { id: 'campaign', name: 'CITY SAVED', ja: '街の守護者', desc: '全3ミッションをクリア' },
];

const KEY = 'breach-and-clear-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { achievements: {}, best: {}, ops: [], ...s };
    }
  } catch (e) {
    /* ストレージ不可の環境ではメモリのみ */
  }
  return { achievements: {}, best: {}, ops: [] };
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch (e) {
    /* noop */
  }
}

const RANK_ORDER = ['C', 'B', 'A', 'S'];

// 結果を保存データに反映し、新規解除された実績を返す
export function applyResult(save, r) {
  const next = { ...save, achievements: { ...save.achievements }, best: { ...save.best }, ops: [...save.ops] };
  const unlocked = [];
  const unlock = (id) => {
    if (!next.achievements[id]) {
      next.achievements[id] = Date.now();
      unlocked.push(id);
    }
  };
  // 訓練の結果は修了の記録だけ残し、実績やベストスコアには数えない
  if (r.tutorial) {
    if (r.success) next.tutorialDone = true;
    writeSave(next);
    return { save: next, unlocked };
  }
  if (r.stats.explosionMulti >= 2) unlock('demo');
  if (r.success) {
    const prev = next.best[r.missionId];
    if (!prev || r.score > prev.score) {
      next.best[r.missionId] = {
        score: r.score,
        rank: !prev || RANK_ORDER.indexOf(r.rank) > RANK_ORDER.indexOf(prev.rank) ? r.rank : prev.rank,
        time: r.time,
      };
    } else if (RANK_ORDER.indexOf(r.rank) > RANK_ORDER.indexOf(prev.rank)) {
      next.best[r.missionId] = { ...prev, rank: r.rank };
    }
    if (!next.ops.includes(r.opId)) next.ops.push(r.opId);
    unlock('first');
    if (r.stats.neutralized === 0 && r.stats.arrested === r.stats.totalSuspects) unlock('pacifist');
    if (r.stats.damageTaken === 0) unlock('untouched');
    if (r.missionId === 'm1' && r.time <= 75) unlock('speed');
    if (r.missionId === 'm3') unlock('zero');
    if (r.rank === 'S') unlock('elite');
    if (r.stats.shots >= 10 && r.stats.hits / r.stats.shots >= 0.7) unlock('sharp');
    if (next.ops.length >= 4) unlock('squad');
    if (MISSIONS.filter((m) => !m.tutorial).every((m) => next.best[m.id])) unlock('campaign');
  }
  writeSave(next);
  return { save: next, unlocked };
}
