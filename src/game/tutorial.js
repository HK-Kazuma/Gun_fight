// チュートリアル（OPERATION BOOTCAMP）の台本
//
// マップ上のマーカー（maps.js の訓練施設レイアウト）を名前で参照する。
//   数字マーカーは各区画の入口。隣にあるドアは施錠され、unlock() で開けられるようになる。
//   英小文字マーカーは容疑者・人質・標的などの出現位置（同じ文字が複数あれば全員出る）。
//
// 各項目（step）の書き方
//   label    : 左上の項目リストに出る短い名前
//   title    : 指示パネルの見出し
//   text(k)  : 指示文。k は操作モード（PC／スマホ）に合わせたキー名。[[...]] はキー表示になる
//   points(k): 説明カードの箇条書き（info の項目のみ）
//   info     : true なら説明だけの項目（NEXT で進む）
//   start    : 章の開始・やり直し・スキップ時にプレイヤーを置くマーカー
//   goal     : 目的地のマーカー（'extract' は撤収ポイント）
//   setup(g) : 項目の開始時に呼ばれる（敵の配置など）
//   check(g) : true になったら項目クリア
//   fail(g)  : 文字列を返すと失敗扱いで、その項目をやり直す
//   progress(g): パネルに出す進み具合

export const KEYS = {
  pc: {
    move: '[[W A S D]]',
    dash: '[[SHIFT]]',
    aim: '[[マウス]]',
    fire: '[[左クリック]]',
    reload: '[[R]]',
    shout: '[[F]]',
    act: '[[E]]',
    ab: '[[Q]]',
    next: '[[ENTER]]',
  },
  touch: {
    move: '[[左スティック]]',
    dash: '[[DASH]]',
    aim: '[[照準スティック]]',
    fire: '[[射撃ボタン]]',
    reload: '[[RELOAD]]',
    shout: '[[投降勧告]]',
    act: '[[E]]',
    ab: '[[アビリティ]]',
    next: '[[NEXT]]',
  },
};

const secured = (e) => e.state === 'down' || e.state === 'cuffed';
const foes = (g) => g.tut.ents.filter((o) => o._tk === 'enemy');
const allSecured = (g) => foes(g).every(secured);
const allCuffed = (g) => foes(g).every((e) => e.state === 'cuffed');
const anyDown = (g) => foes(g).some((e) => e.state === 'down');
const hostages = (g) => g.tut.ents.filter((o) => o._tk === 'hostage');
const rescued = (g) => hostages(g).every((h) => h.state === 'escort' || h.state === 'safe');
const count = (list, f) => list.filter(f).length;
const foeProgress = (g, word = '容疑者') => `${word} ${count(foes(g), secured)}/${foes(g).length}`;
const hostageProgress = (g) => `人質 ${count(hostages(g), (h) => h.state === 'escort' || h.state === 'safe')}/${hostages(g).length}`;

export const TUTORIAL = [
  {
    id: 'basic',
    name: 'BASIC TRAINING',
    ja: '基本操作',
    desc: '移動・射撃・リロード・ドア突破・投降と拘束・交戦・人質救出・撤収',
    op: null,
    steps: [
      {
        id: 'welcome',
        label: 'ブリーフィング',
        title: '訓練施設へようこそ',
        info: true,
        start: 'P',
        text: () => 'ここは対テロ部隊の訓練施設だ。まず基本操作を一つずつ確認し、そのあと隊員4名それぞれの特徴と、その強みが活きる場面を実地で学ぶ。',
        points: (k) => [
          '画面上部に、いまやるべきことが表示される。左上は訓練項目のリストだ',
          '黄色いマーカーは目的地。画面の外にある時は矢印で方向を示す',
          '失敗しても、その項目の最初からやり直せる。訓練中は倒れることはない',
          `説明だけの項目は ${k.next} で次へ進む`,
        ],
      },
      {
        id: 'move',
        label: '移動',
        title: '移動',
        goal: 'a',
        text: (k, touch) =>
          `${k.move} で移動する。${touch ? 'スティックは画面左側のどこを触っても出せる。' : ''}前方に光っている黄色いマーカーまで歩け。`,
        check: (g) => g.near('a', 0.8),
      },
      {
        id: 'dash',
        label: 'ダッシュ',
        title: 'ダッシュ',
        goal: 'r',
        text: (k, touch) =>
          `${k.dash} を${touch ? 'タップしてから' : '押しながら'}移動するとダッシュになる。速く動ける代わりに、射撃のブレが大きくなり、敵にも気付かれやすい。ダッシュで射撃場のマーカーまで移動しろ。`,
        progress: (g) => `ダッシュ ${g.tut.sprintT > 0.4 ? '✓' : '—'}`,
        check: (g) => g.tut.sprintT > 0.4 && g.near('r', 1),
      },
      {
        id: 'shoot',
        label: '照準と射撃',
        title: '照準と射撃',
        text: (k) =>
          `${k.aim} で狙い、${k.fire} で撃つ（押し続けると連射）。照準の十字が開いているほど弾がばらつく。走りながらより、立ち止まって撃つほうが正確だ。前方の標的を3つ倒せ。`,
        setup: (g) => g.spawnTargets('t'),
        progress: (g) => {
          const ts = g.tut.ents.filter((o) => o._tk === 'target');
          return `標的 ${count(ts, (t) => t.down)}/${ts.length}`;
        },
        check: (g) => g.tut.ents.filter((o) => o._tk === 'target').every((t) => t.down),
      },
      {
        id: 'reload',
        label: 'リロード',
        title: 'リロード',
        text: (k) =>
          `${k.reload} でリロードする。弾倉が空になると自動でリロードが始まるが、その間は撃てない。交戦の前に自分で済ませておくのが鉄則だ。数発撃ってから、リロードを1回最後まで完了させろ。`,
        progress: (g) => `リロード ${g.tut.reloads > 0 ? '✓' : '—'}`,
        check: (g) => g.tut.reloads > 0,
      },
      {
        id: 'breach',
        label: 'ドア突破',
        title: 'ドア突破',
        goal: '5',
        text: (k) =>
          `ドアの前で ${k.act} を押すと、ドアを蹴破って突入する。大きな音が出るので、近くの容疑者には気付かれる。赤いランプが点いたドアは施錠中で、指示があるまで開かない。射撃場の奥のドアを突破しろ。`,
        setup: (g) => g.unlock('5'),
        check: (g) => g.doorOpen('5'),
      },
      {
        id: 'arrest',
        label: '投降と拘束',
        title: '投降勧告と拘束',
        start: '5',
        text: (k) =>
          `容疑者を見つけたら ${k.shout} で投降を呼びかける。こちらに気付いていない相手や、弱っている相手ほど応じやすい。手を上げたら近づいて ${k.act} を長押しで拘束する。逮捕は +300、無力化（射殺）は +100。投降した相手を撃つと規律違反で -500 だ。部屋の容疑者を逮捕しろ。`,
        setup: (g) => g.spawnEnemies('e', { angle: 0, surrender: 'always' }),
        fail: (g) => (anyDown(g) ? 'この項目の目標は逮捕だ。撃たずに投降させろ。' : null),
        check: allCuffed,
      },
      {
        id: 'combat',
        label: '交戦',
        title: '交戦と遮蔽',
        start: '6',
        text: (k) =>
          `投降に応じない容疑者もいる。撃たれたら木箱の陰に隠れ、${k.reload} を済ませてから撃ち返せ。木箱は弾を防ぐが、視線は通る。HPが減ったら緑のメディキットに触れると回復する。武装した容疑者を無力化しろ。`,
        setup: (g) => {
          g.unlock('6');
          g.spawnEnemies('f', { angle: Math.PI, surrender: 'never' });
        },
        progress: (g) => foeProgress(g),
        check: allSecured,
      },
      {
        id: 'hostage',
        label: '人質救出',
        title: '人質救出と爆発物',
        start: '9',
        text: (k) =>
          `人質に近づいて ${k.act} を長押しで救出すると、自分で撤収ポイントへ向かう。人質を撃てば即作戦失敗だ。赤いドラム缶は撃つと爆発し、周りの容疑者をまとめて倒せる。ただし人質を巻き込むな。容疑者2名を片付け、人質を救出しろ。`,
        setup: (g) => {
          g.unlock('9');
          g.unlock('0');
          g.spawnBarrels('g');
          g.spawnEnemies('i', { angle: 0 });
          g.spawnHostages('y');
        },
        progress: (g) => `${foeProgress(g)} ・ ${hostageProgress(g)}`,
        check: (g) => allSecured(g) && rescued(g),
      },
      {
        id: 'extract',
        label: '撤収',
        title: '撤収',
        goal: 'extract',
        text: () => 'すべての目標を達成したら、撤収ポイント（緑の点線の枠）に入ると作戦完了だ。人質に続いて、奥の部屋の撤収ポイントに入れ。',
        check: (g) => g.inExtraction(g.player),
      },
    ],
  },
  {
    id: 'holt',
    name: 'HOLT',
    ja: 'チームリーダー',
    desc: '一斉投降命令で、撃たずに複数の容疑者を制圧する',
    op: 'holt',
    steps: [
      {
        id: 'holt-info',
        label: '隊員の特徴',
        title: 'HOLT — チームリーダー',
        info: true,
        start: 'j',
        text: () => '20年のキャリアを持つ部隊の要。撃たずに場を制する「声」が最大の武器だ。',
        points: (k) => [
          'M4 CARBINE：連射・精度・威力のバランスが良く、どの距離でも戦える',
          'HP 110・被ダメージ 15% 軽減。前に出ても崩れにくい',
          `COMMAND（${k.ab}）：視界内（11m 以内）の容疑者全員に強力な投降勧告。成功率 +50%、自分の HP も 25 回復`,
          '活きる場面：複数の容疑者を、誰も撃たずに一度で制圧したい時',
        ],
      },
      {
        id: 'holt-command',
        label: '一斉投降',
        title: 'COMMAND で一斉投降',
        start: 'j',
        goal: '1',
        text: (k) =>
          `奥の部屋に容疑者が3人。普通の投降勧告は1人ずつ成否が分かれ、拒否した相手とは撃ち合いになる。ドアを突破したら、3人が見える位置ですぐに ${k.ab} の COMMAND を使え。全員がまとめて手を上げる。HP が減っているので、回復効果も確かめろ。3人全員を逮捕しろ。`,
        setup: (g) => {
          g.player.hp = 60;
          g.unlock('1');
          g.spawnEnemies('k', { angle: 0 });
        },
        fail: (g) => (anyDown(g) ? 'COMMAND なら誰も撃たずに済む。もう一度だ。' : null),
        progress: (g) => `逮捕 ${count(foes(g), (e) => e.state === 'cuffed')}/${foes(g).length}`,
        check: allCuffed,
      },
    ],
  },
  {
    id: 'reyes',
    name: 'REYES',
    ja: 'ブリーチャー',
    desc: '突入時のスタンと閃光弾で、待ち伏せや固まった敵を崩す',
    op: 'reyes',
    steps: [
      {
        id: 'reyes-info',
        label: '隊員の特徴',
        title: 'REYES — ブリーチャー',
        info: true,
        start: 'o',
        text: () => '突入のスペシャリスト。ドアを蹴破った瞬間から、室内の主導権を握る。',
        points: (k) => [
          'M870 SHOTGUN：8発の散弾。至近距離なら一撃で倒せるが、離れると弾が散って当たらない',
          'HP 125・被ダメージ 20% 軽減。最もタフで、突入の先頭に立てる',
          'パッシブ：REYES がドアを突破すると、ドア付近（4m）の容疑者が2秒スタンする',
          `FLASHBANG（${k.ab}）：照準の方向へ閃光弾を投げ、範囲内の容疑者を約4秒無力化。スタン中の投降勧告はほぼ確実に成功する`,
          '活きる場面：待ち伏せされた部屋への突入、固まっている複数の容疑者',
        ],
      },
      {
        id: 'reyes-breach',
        label: '突入スタン',
        title: '突入スタン（パッシブ）',
        start: 'o',
        goal: '2',
        text: (k) =>
          `ドアのすぐ裏で容疑者2人が銃を構えて待ち構えている。普通に入れば撃たれるが、REYES がドアを蹴破れば2人ともスタンする。頭の上で星が回っている間に ${k.shout} で投降させ、拘束しろ（撃って無力化してもよい）。`,
        setup: (g) => {
          g.unlock('2');
          g.spawnEnemies('q', { angle: Math.PI });
        },
        progress: (g) => foeProgress(g),
        check: allSecured,
      },
      {
        id: 'reyes-flash',
        label: '閃光弾',
        title: '閃光弾でまとめて無力化',
        start: '4',
        goal: '4',
        text: (k) =>
          `次の部屋の奥に容疑者が3人固まっている。ドアから遠く、突入スタンは届かない。ドアを突破したら ${k.aim} で容疑者の方を狙い、${k.ab} で閃光弾を投げ込め（壁に当たると跳ね返る。閃光弾の方を向いていると自分も目がくらむ）。スタンした3人に ${k.shout} で投降を呼びかけ、全員を確保しろ。`,
        setup: (g) => {
          g.unlock('4');
          g.spawnEnemies('s', { angle: 0 });
        },
        progress: (g) => `${foeProgress(g)} ・ 閃光弾スタン ${g.tut.flashStuns}`,
        check: allSecured,
      },
    ],
  },
  {
    id: 'kane',
    name: 'KANE',
    ja: 'マークスマン',
    desc: '長いライトと一撃の DMR、スローモーションで遠距離戦を制する',
    op: 'kane',
    steps: [
      {
        id: 'kane-info',
        label: '隊員の特徴',
        title: 'KANE — マークスマン',
        info: true,
        start: 'u',
        text: () => '一発で終わらせる精密射手。距離のある戦いほど強い。',
        points: (k) => [
          'MK12 DMR：1発 110 ダメージで、通常の容疑者は一撃。ブレはほぼ無いが、連射は遅く、続けて撃つと照準が開く',
          'ライトの照射距離が最長（14m）。容疑者の視界（約 9.5m）の外から先に見つけられる',
          'HP 90・軽減なし。撃ち合いが長引くと最も脆い',
          `FOCUS（${k.ab}）：5秒間、周囲の時間が 30% に減速する（自分はほぼ通常の速さ）。爆弾のタイマーも遅くなる`,
          '活きる場面：長い廊下や広い部屋での遠距離戦、人質のそばにいる容疑者への精密射撃',
        ],
      },
      {
        id: 'kane-range',
        label: '遠距離戦',
        title: '遠距離戦と FOCUS',
        start: 'u',
        goal: '3',
        text: (k) =>
          `長い廊下の先に容疑者が4人。1発撃てば銃声で全員が動き出す。相手の視界の外から1人目を確実に倒し、残りが向かってきたら ${k.ab} の FOCUS を発動して、スローの間に1人ずつ撃ち抜け。`,
        setup: (g) => {
          g.unlock('3');
          g.spawnEnemies('v', { angle: Math.PI });
        },
        progress: (g) => foeProgress(g),
        check: allSecured,
      },
      {
        id: 'kane-shield',
        label: '精密射撃',
        title: '人質のそばの容疑者',
        start: '7',
        goal: '7',
        text: () =>
          '下の部屋で、容疑者が人質のすぐそばに立っている。投降には応じない。散弾や連射では人質に当たる危険があるが、KANE の精度なら撃ち抜ける。立ち止まり、照準の十字が一番閉じてから撃て。容疑者を無力化して、人質を救出しろ。',
        setup: (g) => {
          g.unlock('7');
          g.spawnEnemies('x', { angle: -0.32, surrender: 'never', anchored: true });
          g.spawnHostages('z', '7');
        },
        progress: (g) => `${foeProgress(g)} ・ ${hostageProgress(g)}`,
        check: (g) => allSecured(g) && rescued(g),
      },
    ],
  },
  {
    id: 'park',
    name: 'PARK',
    ja: 'テック／偵察',
    desc: '壁越しの偵察ドローンと最速の足で、時間との勝負に勝つ',
    op: 'park',
    steps: [
      {
        id: 'park-info',
        label: '隊員の特徴',
        title: 'PARK — テック／偵察',
        info: true,
        start: 'p',
        text: () => '電子戦と偵察を担う部隊の目。情報とスピードで先手を取る。',
        points: (k) => [
          'MP5 SMG：毎分 880 発の高レート。1発は軽いが、近〜中距離で弾をばらまいて押し切る',
          '移動速度が全隊員で最速。ダッシュなら危険な通路も一瞬で抜けられる',
          'HP 95・軽減なし',
          `RECON DRONE（${k.ab}）：7秒間、壁越しにすべての容疑者・人質・爆弾の位置と距離を表示する（ミニマップにも出る）`,
          '活きる場面：どの部屋に何がいるかわからない時、制限時間がある時',
        ],
      },
      {
        id: 'park-recon',
        label: '偵察と爆弾解除',
        title: '偵察ドローンと爆弾解除',
        start: 'p',
        text: (k) =>
          `6つの部屋のどこかに、時限爆弾・人質1名・容疑者2名がいる。制限時間は75秒、総当たりでは間に合わない。まず ${k.ab} でドローンを飛ばして配置を確かめ、最短ルートで動け。爆弾は近づいて ${k.act} を長押し（約3秒）すると解除できる。`,
        setup: (g) => {
          g.unlock('8');
          g.spawnBomb('b', 75);
          g.spawnEnemies('n', { angle: Math.PI / 2 });
          g.spawnHostages('l', '8');
        },
        progress: (g) => `爆弾 ${g.bomb && g.bomb.defused ? '✓' : '—'} ・ ${foeProgress(g)} ・ ${hostageProgress(g)}`,
        check: (g) => !!g.bomb && g.bomb.defused && allSecured(g) && rescued(g),
      },
      {
        id: 'complete',
        label: '修了',
        title: '全訓練課程を修了',
        info: true,
        final: true,
        text: () =>
          'よくやった。実戦では、選ばなかった隊員のうち2名が分隊として同行し、交戦中の容疑者を援護射撃してくれる。作戦ごとに、どの隊員の強みが活きるかを考えて出動しろ。',
        points: () => [
          'HOLT：複数の容疑者を、撃たずに一斉に制圧する',
          'REYES：待ち伏せされた部屋への突入と、固まった容疑者の無力化',
          'KANE：遠距離戦と、人質のそばにいる容疑者への精密射撃',
          'PARK：中の様子がわからない建物の偵察と、時間制限のある任務',
        ],
      },
    ],
  },
];
