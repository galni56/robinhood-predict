/** Fixed full-viewport background: a slow, continuously shifting gradient
 * in the brand green/emerald/violet palette (pure CSS — see `.aurora-bg` in
 * index.css). Replaced an earlier Canvas-drawn neon grid that turned out
 * unreliable across browsers; a CSS `background-position` animation has no
 * JS/canvas failure mode and costs nothing to maintain. */
export function AuroraBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 aurora-bg" />
      <div className="absolute inset-0 bg-[#05050a]/35" />
    </div>
  )
}
