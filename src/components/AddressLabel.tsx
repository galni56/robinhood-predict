import type { Address } from 'viem'
import { robinhoodMainnet } from '@/chain/config'
import { useNickname } from '@/chain/nicknames'

export function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Shows an address's on-chain nickname if it's set one (via
 * NicknameRegistry), otherwise falls back to a truncated address --
 * everywhere an address is displayed should go through this instead of
 * calling truncateAddress() directly, so a nickname shows up consistently
 * wherever it's relevant. Links to the block explorer by default. */
export function AddressLabel({
  address,
  className = '',
  link = true,
}: {
  address: Address
  className?: string
  link?: boolean
}) {
  const nickname = useNickname(address)
  const label = nickname.data && nickname.data.length > 0 ? nickname.data : truncateAddress(address)

  if (!link) return <span className={className}>{label}</span>
  return (
    <a
      href={`${robinhoodMainnet.blockExplorers.default.url}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {label}
    </a>
  )
}
