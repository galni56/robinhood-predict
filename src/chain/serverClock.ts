import { useEffect, useSyncExternalStore } from 'react'
import { useGameState } from '@/chain/gameServer'

// The game server's clock decides when games open, start and end, so every
// countdown is drawn on that clock: local time plus an offset learned from
// `/state`. One shared ticker drives every countdown on the page.
//
// Each sample (server `now` minus the moment the response arrived) can only
// UNDER-estimate the offset - the server floors to whole seconds, and the
// response may be cached or delayed. So the best estimate is the largest
// recent sample, which also keeps countdowns from jittering between polls.

const TICK_MS = 500
const WINDOW = 20

let samples: number[] = []
let offsetMs = 0
let nowMs = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function tick() {
  nowMs = Date.now() + offsetMs
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer == null) {
    tick()
    timer = setInterval(tick, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer != null) {
      clearInterval(timer)
      timer = null
    }
  }
}

function addSample(serverSeconds: number, receivedMs: number) {
  samples = [...samples, serverSeconds * 1000 - receivedMs].slice(-WINDOW)
  offsetMs = Math.max(...samples)
}

/** Current time on the game server's clock, in milliseconds. */
export function useServerNowMs() {
  const state = useGameState()
  const serverNow = state.data?.now
  const receivedAt = state.dataUpdatedAt
  useEffect(() => {
    if (serverNow != null && receivedAt > 0) addSample(serverNow, receivedAt)
  }, [serverNow, receivedAt])
  return useSyncExternalStore(subscribe, () => nowMs)
}
