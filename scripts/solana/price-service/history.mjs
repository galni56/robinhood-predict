// Slot-indexed account history built from accountSubscribe notifications.
//
// Solana RPC cannot return an account's state at a past slot, so the service
// records every confirmed change as it happens. State at slot S is the latest
// recorded change at or before S — valid only if no gap (a span where updates
// may have been missed) covers S.

export class AccountHistory {
  constructor() {
    /** account -> [{ slot, data }] ascending by slot */
    this.entries = new Map()
    /** account -> [{ after, before }]: state unknown for slots in (after, before) */
    this.gaps = new Map()
  }

  record(account, slot, data) {
    const list = this.entries.get(account) ?? []
    let i = list.length
    while (i > 0 && list[i - 1].slot > slot) i--
    if (i > 0 && list[i - 1].slot === slot) list[i - 1] = { slot, data }
    else list.splice(i, 0, { slot, data })
    this.entries.set(account, list)
  }

  latestSlot(account) {
    const list = this.entries.get(account)
    return list?.length ? list[list.length - 1].slot : null
  }

  /** Marks slots strictly between `after` and `before` as unknown. */
  markGap(account, after, before) {
    if (before - after <= 1) return
    const list = this.gaps.get(account) ?? []
    list.push({ after, before })
    this.gaps.set(account, list)
  }

  /** Marks every slot after `after` unknown until `closeOpenGaps`: for an
   * outage whose end is not known yet (a dropped websocket, an RPC switch). */
  openGap(account, after) {
    const list = this.gaps.get(account) ?? []
    list.push({ after, before: Infinity })
    this.gaps.set(account, list)
  }

  /** Ends open gaps at `slot`, the slot of a fresh baseline read. */
  closeOpenGaps(account, slot) {
    for (const gap of this.gaps.get(account) ?? []) if (gap.before === Infinity) gap.before = slot
  }

  /** Account data at `slot`, or throws if the state there is not known exactly. */
  stateAt(account, slot) {
    const list = this.entries.get(account) ?? []
    let found = null
    for (const entry of list) {
      if (entry.slot <= slot) found = entry
      else break
    }
    if (!found) throw new Error(`${account}: no recorded state at or before slot ${slot}`)
    // Inside a gap only a notification for exactly this slot is trustworthy.
    for (const gap of this.gaps.get(account) ?? []) {
      if (slot > gap.after && slot < gap.before && found.slot !== slot) {
        throw new Error(`${account}: updates may have been missed around slot ${slot}`)
      }
    }
    return found.data
  }

  latest(account) {
    const list = this.entries.get(account)
    return list?.length ? list[list.length - 1].data : undefined
  }

  /** Drops entries older than `minSlot`, keeping one base entry before it. */
  prune(minSlot) {
    for (const [account, list] of this.entries) {
      let firstKept = 0
      while (firstKept + 1 < list.length && list[firstKept + 1].slot <= minSlot) firstKept++
      if (firstKept > 0) list.splice(0, firstKept)
    }
    for (const [account, list] of this.gaps) {
      this.gaps.set(account, list.filter((g) => g.before > minSlot))
    }
  }
}
