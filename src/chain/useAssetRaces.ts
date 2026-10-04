import { raceFromAccount } from '@/chain/assetRaces'
import { DESIGN_SAMPLES_ENABLED, SAMPLE_RACES } from '@/chain/designSamples'
import { useIndexedGames } from '@/chain/useIndexedGames'

/** Every race. See useIndexedGames for the indexer/direct split. In dev,
 * sample races stand in while no data source has anything, so screens can
 * be designed without a local validator. */
export function useAssetRaces() {
  const { list, ...rest } = useIndexedGames('race', raceFromAccount)
  if (DESIGN_SAMPLES_ENABLED && list.length === 0 && !rest.isLoading) {
    return { races: SAMPLE_RACES, ...rest, error: null }
  }
  return { races: list, ...rest }
}
