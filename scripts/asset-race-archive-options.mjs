// Public read-only probe options; no environment/credentials/network access.
export function archiveLookbacks(raw = '60') {
  if (typeof raw !== 'string' || !/^\d+(,\d+)*$/.test(raw)) throw new Error('InvalidArchiveLookbacks')
  const values = raw.split(',').map(BigInt)
  if (values.some((value) => value <= 0n) || new Set(values).size !== values.length) {
    throw new Error('InvalidArchiveLookbacks')
  }
  return values
}
