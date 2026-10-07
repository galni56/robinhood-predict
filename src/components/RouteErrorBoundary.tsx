import { Component, type ReactNode } from 'react'
import { PIXEL } from '@/retro/scene'


/** One broken page (a malformed server row, a render bug) shows a recovery
 * card instead of white-screening the whole app. Keyed by route in App.tsx,
 * so navigating away resets it. */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[page]', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ maxWidth: 560, margin: '64px auto', padding: '0 16px', fontFamily: "'HasteFun Digits', 'Pixelify Sans', 'Courier New', monospace", color: '#1B1340' }}>
        <div className="rx-raised" style={{ background: '#FFF6DF', padding: 24 }}>
          <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, lineHeight: 1.5 }}>SOMETHING BROKE</h1>
          <p style={{ margin: '12px 0 20px', fontSize: 18, fontWeight: 500 }}>
            This page hit an error. Your account and any SOL you sent are safe - reload to try again.
          </p>
          <button type="button" className="rx-btn rx-btn-yellow" style={{ minHeight: 52, padding: '0 24px', fontFamily: PIXEL, fontSize: 12 }} onClick={() => window.location.reload()}>
            RELOAD
          </button>
        </div>
      </div>
    )
  }
}
