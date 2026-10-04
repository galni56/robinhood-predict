import { useMemo } from 'react'
import { raceFromServer, type AssetRaceViewModel } from '@/chain/assetRaces'
import { DESIGN_SAMPLES_ENABLED, SAMPLE_RACES } from '@/chain/designSamples'
import { useGameState, type ServerRace } from '@/chain/gameServer'

const byNewest = (a: { id: bigint }, b: { id: bigint }) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0)

// react-query's structural sharing keeps an unchanged race the same object
// across polls, so each one is converted once.
const cache = new WeakMap<ServerRace, AssetRaceViewModel>()
const convert = (race: ServerRace) => {
  let model = cache.get(race)
  if (!model) {
    model = raceFromServer(race)
    cache.set(race, model)
  }
  return model
}

/** Every race, from the game server's shared snapshot. In dev, sample races
 * stand in while there is nothing, so screens can be designed without servers. */
export function useAssetRaces() {
  const state = useGameState()
  const races = useMemo(() => (state.data?.races ?? []).map(convert).sort(byNewest), [state.data])
  const rest = { isLoading: state.isLoading, error: state.error, refetch: async () => { await state.refetch() } }
  if (DESIGN_SAMPLES_ENABLED && races.length === 0 && !state.isLoading) {
    return { races: SAMPLE_RACES, ...rest, error: null }
  }
  return { races, ...rest }
}
