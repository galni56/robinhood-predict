import { arenaFromAccount } from '@/chain/priceArena'
import { useIndexedGames } from '@/chain/useIndexedGames'

/** Every arena. See useIndexedGames for the indexer/direct split. */
export function usePriceArenas() {
  const { list, ...rest } = useIndexedGames('arena', arenaFromAccount)
  return { arenas: list, ...rest }
}
