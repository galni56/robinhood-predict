import { raceFromAccount } from '@/chain/assetRaces'
import { useIndexedGames } from '@/chain/useIndexedGames'

/** Every race. See useIndexedGames for the indexer/direct split. */
export function useAssetRaces() {
  const { list, ...rest } = useIndexedGames('race', raceFromAccount)
  return { races: list, ...rest }
}
