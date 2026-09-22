// Read-only probe options. Secret-bearing provider URLs may come from the
// process environment, but are never returned in errors or printed here.
export function archiveRpcUrl(args, env = {}) {
  if (!Array.isArray(args)) throw new Error('InvalidArchiveRpcConfiguration')
  const index = args.indexOf('--rpc-url')
  const explicit = index < 0 ? undefined : args[index + 1]
  const configured = explicit || env.ASSET_RACE_POOL_RPC_URL?.trim()
  if (!/^https?:\/\//.test(configured ?? '')) throw new Error('MissingOrInvalidArchiveRpcUrl')
  return configured
}

export function archiveLookbacks(raw = '60') {
  if (typeof raw !== 'string' || !/^\d+(,\d+)*$/.test(raw)) throw new Error('InvalidArchiveLookbacks')
  const values = raw.split(',').map(BigInt)
  if (values.some((value) => value <= 0n) || new Set(values).size !== values.length) {
    throw new Error('InvalidArchiveLookbacks')
  }
  return values
}

export function archiveRpcMinIntervalMs(args, env = {}) {
  if (!Array.isArray(args)) throw new Error('InvalidArchiveRpcConfiguration')
  const index = args.indexOf('--rpc-min-interval-ms')
  const raw = index < 0 ? env.ASSET_RACE_ARCHIVE_MIN_INTERVAL_MS?.trim() : args[index + 1]
  if (raw === undefined || raw === '') return 150
  if (!/^\d+$/.test(raw)) throw new Error('InvalidArchiveRpcMinInterval')
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 50) throw new Error('InvalidArchiveRpcMinInterval')
  return value
}
