import { arenaFromAccount } from '@/chain/priceArena'
import { DESIGN_SAMPLES_ENABLED, SAMPLE_ARENAS } from '@/chain/designSamples'
import { useIndexedGames } from '@/chain/useIndexedGames'

/** Every arena. See useIndexedGames for the indexer/direct split. In dev,
 * sample arenas stand in while no data source has anything, so screens can
 * be designed without a local validator. */
export function usePriceArenas() {
  const { list, ...rest } = useIndexedGames('arena', arenaFromAccount)
  if (DESIGN_SAMPLES_ENABLED && list.length === 0 && !rest.isLoading) {
    return { arenas: SAMPLE_ARENAS, ...rest, error: null }
  }
  return { arenas: list, ...rest }
}
