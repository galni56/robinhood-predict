import { explorerUrl } from '@/solana/config'
import { useNickname } from '@/solana/nicknames'

export function truncateAddress(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

/** Shows a wallet's on-chain nickname if it has set one (nickname_registry),
 * otherwise a truncated address. Every displayed address should go through
 * this so nicknames show up consistently. Links to the explorer by default. */
export function AddressLabel({
  address,
  className = '',
  link = true,
}: {
  address: string
  className?: string
  link?: boolean
}) {
  const nickname = useNickname(address)
  const label = nickname.data ? nickname.data : truncateAddress(address)

  if (!link) return <span className={className}>{label}</span>
  return (
    <a href={explorerUrl('address', address)} target="_blank" rel="noreferrer" className={className}>
      {label}
    </a>
  )
}
