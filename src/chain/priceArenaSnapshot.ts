import type { PriceArenaData } from '@/chain/priceArena'

const OPEN = 0
const RESOLVED = 1
const CANCELLED = 2
const LOBBY = 0
const RUNNING = 1
const RESOLVED_PHASE = 2
const CANCELLED_PHASE = 3
const LOBBY_SECONDS = 600n
const MAX_PARTICIPANTS = 20
const SUPPORTED_DURATIONS = new Set([60n, 300n, 900n, 3_600n])

/**
 * Fail closed when a stale/misaligned multicall row is decoded as an Arena.
 *
 * `useReadContracts` can briefly expose the previous query shape while a new
 * bounded id window is being fetched. A structurally valid but misaligned row
 * used to enter the session snapshot and then survive route navigation. These
 * invariants all come from PriceArena.sol and let the UI retain the last valid
 * card without ever rendering the corrupt observation.
 */
export function isCoherentPriceArenaSnapshot(
  arena: PriceArenaData,
  phase: number,
  assetCategory?: number,
) {
  const duration = BigInt(arena.duration)
  const participantCount = Number(arena.participantCount)
  const winnerCount = Number(arena.winnerCount)
  const status = Number(arena.status)
  const category = Number(arena.category)

  if (assetCategory == null || category !== assetCategory) return false
  if (!SUPPORTED_DURATIONS.has(duration)) return false
  if (![OPEN, RESOLVED, CANCELLED].includes(status)) return false
  if (![LOBBY, RUNNING, RESOLVED_PHASE, CANCELLED_PHASE].includes(phase)) return false
  if (status === OPEN && phase !== LOBBY && phase !== RUNNING) return false
  if (status === RESOLVED && phase !== RESOLVED_PHASE) return false
  if (status === CANCELLED && phase !== CANCELLED_PHASE) return false

  if (arena.createdAt <= 0n) return false
  if (arena.startsAt !== arena.createdAt + LOBBY_SECONDS) return false
  if (arena.deadline !== arena.startsAt + duration) return false
  if (status === OPEN ? arena.resolvedAt !== 0n : arena.resolvedAt < arena.startsAt) return false

  if (!Number.isInteger(participantCount) || participantCount < 0 || participantCount > MAX_PARTICIPANTS) return false
  if (!Number.isInteger(winnerCount) || winnerCount < 0 || winnerCount > participantCount) return false
  if ((participantCount === 0) !== (arena.totalPool === 0n)) return false
  if (status === OPEN && (winnerCount !== 0 || arena.finalPrice !== 0n)) return false
  if (status === RESOLVED && (participantCount < 2 || arena.finalPrice <= 0n || winnerCount !== Math.floor(participantCount / 2))) return false
  if (status === CANCELLED && winnerCount !== 0) return false
  if (Number(arena.feeBp) !== 200) return false

  const titleLength = new TextEncoder().encode(arena.title).length
  return titleLength > 0 && titleLength <= 64
}
