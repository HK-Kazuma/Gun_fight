/**
 * スマホを縦向きで開いた時の案内。表示の切り替えは CSS（縦向きの時だけ表示）で行う。
 */
export default function RotateHint() {
  return (
    <div className="rotate-hint" role="alert">
      <svg className="rotate-art" viewBox="0 0 200 200" aria-hidden="true">
        {/* 回す向き（反時計回り）を示す矢印 */}
        <g className="rotate-arrows">
          <path d="M100 16A84 84 0 0 0 16 100" />
          <path d="M7 89l9 12 10-11" />
          <path d="M100 184a84 84 0 0 0 84-84" />
          <path d="M193 111l-9-12-10 11" />
        </g>
        <g className="rotate-phone">
          <rect className="body" x="65" y="36" width="70" height="128" rx="12" />
          <rect className="display" x="71" y="50" width="58" height="98" rx="3" />
          <path className="detail" d="M90 43h20M88 156h24" />
          <g className="mark">
            <circle cx="100" cy="99" r="13" />
            <path d="M100 80v11M100 107v11M81 99h11M108 99h11" />
          </g>
        </g>
      </svg>
      <p className="rotate-text">
        画面を横向きにしてね
        <small>ROTATE YOUR DEVICE</small>
      </p>
    </div>
  );
}
