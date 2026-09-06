/** Big abstract product mark for the landing hero's right column — concentric
 * "target" rings with a trajectory line landing dead-center on a PX
 * monogram, standing in for a literal product photo/logo. Pure inline SVG:
 * scales cleanly to any size, no image asset to ship or fail to load. */
export function HeroMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} role="img" aria-label="PredictX">
      <defs>
        <linearGradient id="hm-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#8FBF1F" />
          <stop offset="100%" stopColor="#C6FF3D" />
        </linearGradient>
        <filter id="hm-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="origin-center animate-[spin_60s_linear_infinite]" style={{ transformOrigin: '200px 200px' }}>
        <circle cx="200" cy="200" r="170" fill="none" stroke="rgba(198,255,61,0.35)" strokeWidth="2" strokeDasharray="4 10" />
      </g>
      <circle cx="200" cy="200" r="170" fill="none" stroke="rgba(198,255,61,0.12)" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="125" fill="none" stroke="rgba(198,255,61,0.18)" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="80" fill="none" stroke="rgba(198,255,61,0.28)" strokeWidth="2" />

      {/* Trajectory landing on the target, standing in for "call the price right" */}
      <path
        d="M64 336 L 172 228"
        stroke="url(#hm-grad)"
        strokeWidth="9"
        strokeLinecap="round"
        filter="url(#hm-glow)"
      />
      <circle cx="64" cy="336" r="7" fill="url(#hm-grad)" />

      <circle cx="200" cy="200" r="38" fill="url(#hm-grad)" filter="url(#hm-glow)" />
      <text
        x="200"
        y="213"
        textAnchor="middle"
        fontFamily="Manrope, sans-serif"
        fontWeight="800"
        fontSize="30"
        fill="#0a0a12"
      >
        PX
      </text>
    </svg>
  )
}
