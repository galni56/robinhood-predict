import { getAddress, isAddress } from 'viem'

export function parseLegacyDeployments(value, {
  activeAddress,
  scanFrom = 0n,
  variableName = 'LEGACY_ADDRESSES',
} = {}) {
  const normalizedActive = getAddress(activeAddress)
  const seen = new Set([normalizedActive.toLowerCase()])
  const addresses = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  return addresses.map((address, index) => {
    if (!isAddress(address)) throw new Error(`${variableName} contains an invalid address`)
    const normalized = getAddress(address)
    const key = normalized.toLowerCase()
    if (seen.has(key)) throw new Error(`${variableName} must contain unique addresses distinct from the active contract`)
    seen.add(key)
    return { address: normalized, label: `legacy-${index + 1}`, scanFrom: BigInt(scanFrom) }
  })
}

export function earliestDeploymentDueAt(deployments) {
  let earliest
  for (const deployment of deployments) {
    const dueAt = deployment.tracker.earliestDueAt()
    if (dueAt !== undefined && (earliest === undefined || dueAt < earliest)) earliest = dueAt
  }
  return earliest
}
