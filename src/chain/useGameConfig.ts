import { useQuery } from '@tanstack/react-query'
import { usePrograms } from '@/solana/programs'
import { configPda, stakeMintPda } from '@/solana/pda'
import { NATIVE_SOL } from '@/solana/config'

const big = (value: { toString(): string }) => BigInt(value.toString())

export interface GameConfig {
  paused: boolean
  raceCount: bigint
  arenaCount: bigint
  raceDurations: bigint[]
  communityPolicyConfigured: boolean
  communityPolicy: {
    lobbyDuration: bigint
    bettingDuration: bigint
    startGrace: bigint
    resolutionGrace: bigint
    feeBp: number
    minActiveContenders: number
  }
  /** Native SOL stake limits for community races and arenas. */
  sol?: { enabled: boolean; minStake: bigint; maxStake: bigint }
}

/** Program-wide settings shared by both games. */
export function useGameConfig() {
  const { games } = usePrograms()
  return useQuery({
    queryKey: ['game-config', games.programId.toBase58()],
    queryFn: async (): Promise<GameConfig | null> => {
      const [config, sol] = await Promise.all([
        games.account.config.fetchNullable(configPda()),
        games.account.stakeMintConfig.fetchNullable(stakeMintPda(NATIVE_SOL)),
      ])
      if (!config) return null
      const policy = config.communityPolicy
      return {
        paused: config.paused,
        raceCount: big(config.raceCount),
        arenaCount: big(config.arenaCount),
        raceDurations: config.raceDurations.map(big).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        communityPolicyConfigured: config.communityPolicyConfigured,
        communityPolicy: {
          lobbyDuration: big(policy.lobbyDuration),
          bettingDuration: big(policy.bettingDuration),
          startGrace: big(policy.startGrace),
          resolutionGrace: big(policy.resolutionGrace),
          feeBp: policy.feeBp,
          minActiveContenders: policy.minActiveContenders,
        },
        sol: sol ? { enabled: sol.enabled, minStake: big(sol.minStake), maxStake: big(sol.maxStake) } : undefined,
      }
    },
    refetchInterval: 30_000,
  })
}
