import { X_URL } from '@/lib/social'

/** HasteFun on X: a pixel "X" in the same style and size as the sound toggle. */
export function XLink({ color, size = 40 }: { color: string; size?: number }) {
  if (!X_URL) return null
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="HasteFun on X"
      title="HasteFun on X"
      style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size + 4, height: size + 4, color }}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
        {/* The X logo as pixels: a heavy stroke top-left to bottom-right, a thin one the other way. */}
        <rect x="2" y="2" width="3" height="2" />
        <rect x="4" y="4" width="3" height="2" />
        <rect x="6" y="6" width="3" height="2" />
        <rect x="8" y="8" width="3" height="2" />
        <rect x="10" y="10" width="3" height="2" />
        <rect x="11" y="12" width="3" height="2" />
        <rect x="12" y="2" width="2" height="1" />
        <rect x="11" y="3" width="1" height="1" />
        <rect x="10" y="4" width="1" height="1" />
        <rect x="9" y="5" width="1" height="1" />
        <rect x="6" y="9" width="1" height="1" />
        <rect x="5" y="10" width="1" height="1" />
        <rect x="4" y="11" width="1" height="1" />
        <rect x="3" y="12" width="1" height="1" />
        <rect x="2" y="13" width="1" height="1" />
      </svg>
    </a>
  )
}
