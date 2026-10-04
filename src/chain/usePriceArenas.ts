import { useMemo } from 'react'
import { arenaFromServer, type PriceArenaViewModel } from '@/chain/priceArena'
import { DESIGN_SAMPLES_ENABLED, SAMPLE_ARENAS } from '@/chain/designSamples'
import { useGameState, type ServerArena } from '@/chain/gameServer'

const byNewest = (a: { id: bigint }, b: { id: bigint }) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0)

const cache = new WeakMap<ServerArena, PriceArenaViewModel>()
const convert = (arena: ServerArena) => {
  let model = cache.get(arena)
  if (!model) {
    model = arenaFromServer(arena)
    cache.set(arena, model)
  }
  return model
}

/** Every arena, from the game server's shared snapshot. In dev, sample
 * arenas stand in while there is nothing, so screens can be designed. */
export function usePriceArenas() {
  const state = useGameState()
  const arenas = useMemo(() => (state.data?.arenas ?? []).map(convert).sort(byNewest), [state.data])
  const rest = { isLoading: state.isLoading, error: state.error, refetch: async () => { await state.refetch() } }
  if (DESIGN_SAMPLES_ENABLED && arenas.length === 0 && !state.isLoading) {
    return { arenas: SAMPLE_ARENAS, ...rest, error: null }
  }
  return { arenas, ...rest }
}
