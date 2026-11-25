// 正面向きの隊員シルエット（タイトル画面・隊員選択の肖像用）
// 原点は首の付け根。単位は約1px = 1/scale

function bodyPath(head) {
  const p = new Path2D();
  // 胴体・腕（左右対称）
  p.moveTo(-20, -4);
  p.bezierCurveTo(-34, 4, -62, 8, -82, 22); // 僧帽筋
  p.bezierCurveTo(-104, 34, -112, 60, -112, 92); // 肩
  p.bezierCurveTo(-114, 140, -118, 200, -120, 260); // 腕の外側
  p.lineTo(120, 260);
  p.bezierCurveTo(118, 200, 114, 140, 112, 92);
  p.bezierCurveTo(112, 60, 104, 34, 82, 22);
  p.bezierCurveTo(62, 8, 34, 4, 20, -4);
  p.closePath();
  // 首
  p.moveTo(-17, -24);
  p.lineTo(17, -24);
  p.lineTo(20, 2);
  p.lineTo(-20, 2);
  p.closePath();
  // 頭部
  p.moveTo(26, -58);
  p.bezierCurveTo(27, -30, 18, -14, 0, -12);
  p.bezierCurveTo(-18, -14, -27, -30, -26, -58);
  p.bezierCurveTo(-26, -86, 26, -86, 26, -58);
  p.closePath();
  if (head === 'helmet') {
    p.moveTo(-36, -52);
    p.bezierCurveTo(-40, -112, 40, -112, 36, -52);
    p.lineTo(32, -46);
    p.lineTo(-32, -46);
    p.closePath();
    // NVGマウント
    p.rect(-9, -98, 18, 14);
  } else if (head === 'cap') {
    p.moveTo(-29, -62);
    p.bezierCurveTo(-31, -98, 31, -98, 29, -62);
    p.lineTo(-29, -62);
    p.closePath();
    p.moveTo(-30, -64);
    p.lineTo(30, -64);
    p.bezierCurveTo(30, -58, 22, -54, 0, -54);
    p.bezierCurveTo(-22, -54, -30, -58, -30, -64);
    p.closePath();
  } else if (head === 'hair') {
    p.moveTo(-28, -50);
    p.bezierCurveTo(-34, -100, 34, -100, 28, -50);
    p.bezierCurveTo(30, -30, 34, -10, 26, 4);
    p.lineTo(18, -30);
    p.lineTo(-18, -30);
    p.lineTo(-26, 4);
    p.bezierCurveTo(-34, -10, -30, -30, -28, -50);
    p.closePath();
  }
  return p;
}

function rifleShape(ctx, dir) {
  ctx.save();
  ctx.translate(dir * 4, 150);
  ctx.rotate(dir * -0.5);
  ctx.beginPath();
  ctx.rect(-96, -9, 190, 17); // 本体
  ctx.rect(-136, -5, 42, 12); // ストック
  ctx.rect(92, -4, 44, 7); // バレル
  ctx.rect(-14, 6, 15, 36); // マガジン
  ctx.rect(28, 6, 11, 26); // グリップ
  ctx.rect(-40, -20, 40, 11); // スコープ
  ctx.restore();
}

export function drawTrooper(ctx, x, y, s, opts = {}) {
  const { head = 'helmet', rim = '255,140,50', accent = null, rifle = 'right', alpha = 1 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = alpha;
  const body = bodyPath(head);

  // 1) リム光で塗る → 2) 少し左上にずらした暗色で上塗り = 右端だけ光る
  const rimFill = ctx.createLinearGradient(-120, 0, 120, 0);
  rimFill.addColorStop(0, 'rgba(120,160,220,0.55)');
  rimFill.addColorStop(0.5, 'rgba(60,50,45,0.6)');
  rimFill.addColorStop(1, `rgba(${rim},1)`);
  ctx.fillStyle = rimFill;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.save();
  ctx.translate(-4, 3);
  const base = ctx.createLinearGradient(0, -100, 0, 260);
  base.addColorStop(0, '#161b22');
  base.addColorStop(0.5, '#0d1116');
  base.addColorStop(1, '#050608');
  ctx.fillStyle = base;
  ctx.fill(body);
  ctx.restore();

  // 装備のディテール
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  // プレートキャリア
  ctx.beginPath();
  ctx.moveTo(-66, 40);
  ctx.lineTo(66, 40);
  ctx.lineTo(70, 260);
  ctx.lineTo(-70, 260);
  ctx.closePath();
  ctx.fill();
  // ショルダーストラップ
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(-58, 14, 20, 40);
  ctx.fillRect(38, 14, 20, 40);
  // マガジンポーチ
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-52 + i * 36, 132, 30, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(-52 + i * 36, 132, 30, 6);
  }
  // パッチ
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(-36, 70, 72, 20);
  if (accent) {
    ctx.fillStyle = accent;
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillRect(-100, 86, 18, 5);
    ctx.globalAlpha = alpha;
  }
  // 顔の陰影（目元）
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(-24, -52, 48, 9);
  // 右頬の炎の照り返し
  const cheek = ctx.createRadialGradient(24, -40, 0, 24, -40, 26);
  cheek.addColorStop(0, `rgba(${rim},0.35)`);
  cheek.addColorStop(1, `rgba(${rim},0)`);
  ctx.fillStyle = cheek;
  ctx.fillRect(-10, -80, 60, 70);
  ctx.restore();

  // ライフル（体の前）
  if (rifle) {
    const dir = rifle === 'right' ? 1 : -1;
    ctx.fillStyle = `rgba(${rim},0.9)`;
    rifleShape(ctx, dir);
    ctx.fill();
    ctx.save();
    ctx.translate(-3, 2.5);
    ctx.fillStyle = '#040506';
    rifleShape(ctx, dir);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
