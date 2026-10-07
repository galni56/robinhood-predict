import { useSyncExternalStore } from 'react'
import { piu, setSfxEnabled, sfxEnabled, subscribeSound } from '@/lib/sfx'

/** Speaker icon that mutes or unmutes the music and button sounds (header and footer). */
export function SoundToggle({ color, size = 40 }: { color: string; size?: number }) {
  const on = useSyncExternalStore(subscribeSound, sfxEnabled, () => true)
  return (
    <button
      type="button"
      onClick={() => {
        setSfxEnabled(!on)
        if (!on) piu()
      }}
      aria-label={on ? 'Turn sound off' : 'Turn sound on'}
      aria-pressed={on}
      title={on ? 'Sound on - click to mute' : 'Sound off - click to turn on'}
      style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size + 4, height: size + 4, padding: 0, background: 'none', border: 0, cursor: 'pointer', color }}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
        <rect x="1" y="6" width="3" height="4" />
        <rect x="4" y="5" width="1" height="6" />
        <rect x="5" y="4" width="1" height="8" />
        <rect x="6" y="3" width="1" height="10" />
        <rect x="7" y="2" width="1" height="12" />
        {on ? (
          <>
            <rect x="9" y="7" width="1" height="2" />
            <rect x="10" y="5" width="1" height="1" />
            <rect x="10" y="10" width="1" height="1" />
            <rect x="11" y="6" width="1" height="4" />
            <rect x="12" y="3" width="1" height="1" />
            <rect x="12" y="12" width="1" height="1" />
            <rect x="13" y="4" width="1" height="2" />
            <rect x="13" y="10" width="1" height="2" />
            <rect x="14" y="6" width="1" height="4" />
          </>
        ) : (
          <>
            <rect x="9" y="5" width="1" height="1" />
            <rect x="10" y="6" width="1" height="1" />
            <rect x="11" y="7" width="2" height="2" />
            <rect x="13" y="9" width="1" height="1" />
            <rect x="14" y="10" width="1" height="1" />
            <rect x="14" y="5" width="1" height="1" />
            <rect x="13" y="6" width="1" height="1" />
            <rect x="10" y="9" width="1" height="1" />
            <rect x="9" y="10" width="1" height="1" />
          </>
        )}
      </svg>
    </button>
  )
}
