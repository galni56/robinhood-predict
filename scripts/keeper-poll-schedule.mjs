/** Shared by all three lifecycle keepers (Asset Race, Prediction Market,
 * Price Arena). How long to sleep before the next poll: exactly until the
 * soonest-tracked item is due, floored at pollIntervalMs (so an
 * already-due item -- including one that just failed a transition attempt,
 * which leaves its due time unchanged -- retries promptly instead of
 * spinning), and capped at idlePollIntervalMs (so a quiet contract, or an
 * item not discovered yet, still gets noticed soon). Every start/resolution
 * grace window across all three contracts is measured in minutes, so an
 * idle cap of a few tens of seconds costs no real responsiveness.
 *
 * `earliestDueAt` is the soonest known due time in unix seconds (bigint),
 * or undefined if nothing is currently tracked. */
export function nextSleepMs(earliestDueAt, pollIntervalMs, idlePollIntervalMs, now = Date.now()) {
  if (earliestDueAt === undefined) return idlePollIntervalMs
  const msUntilDue = Number(earliestDueAt) * 1000 - now
  return Math.min(idlePollIntervalMs, Math.max(pollIntervalMs, msUntilDue))
}
