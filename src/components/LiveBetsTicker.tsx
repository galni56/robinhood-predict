import { formatEther, formatUnits } from 'viem'
import { truncateAddress } from '@/components/AddressLabel'
import { useBetLogs } from '@/chain/betLogs'
import { MarketSideOnchain } from '@/chain/contracts'
import { isDemoMode } from '@/chain/demo'
import { TokenLogo } from '@/components/TokenLogo'
import { assetIconUrl } from '@/lib/assetIcons'

/** A live-feeling scrolling strip of real bets across every market, same
 * marquee technique as TickerTape (the price strip) -- inspired by seeing a
 * competitor's markets dashboard (chroma.markets, also built on Robinhood
 * Chain) lean on a similar activity feed to make a page feel busy even at
 * modest volume. Reads off useBetLogs(), the same cached log scan the
 * sidebar's leaderboard/recent-bets widgets use, so this doesn't add its
 * own getLogs call. */
export function LiveBetsTicker({ tickerByMarketId }: { tickerByMarketId: Map<string, string> }) {
  const betLogs = useBetLogs()

  if (!betLogs.data || betLogs.data.length === 0) return null

  const items = [...betLogs.data]
    .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0))
    .slice(0, 20)
    .map((log) => ({
      key: log.txHash,
      side: log.side === MarketSideOnchain.YES ? 'YES' : 'NO',
      amount: isDemoMode() ? `${formatUnits(log.amount, 6)} USDG` : `${formatEther(log.amount)} ETH`,
      user: truncateAddress(log.user),
      ticker: tickerByMarketId.get(log.id.toString()) ?? `market #${log.id}`,
    }))

  // Duplicated so the CSS marquee loops seamlessly.
  const track = [...items, ...items]

  return (
    <div className="border border-white/5 bg-[#241b2f] overflow-hidden group mb-6 rounded-2xl">
      <div className="flex w-max animate-[ticker-scroll_45s_linear_infinite] group-hover:[animation-play-state:paused]">
        {track.map((item, i) => (
          <span key={`${item.key}-${i}`} className="flex items-center gap-1.5 px-4 py-2 text-xs whitespace-nowrap shrink-0">
            <span className={item.side === 'YES' ? 'font-bold text-[#B3A7FA]' : 'font-bold text-[#F2A65A]'}>{item.side}</span>
            <span className="text-white/50 font-mono">{item.user}</span>
            <span className="text-white/30">bet</span>
            <span className="font-mono text-white/70">{item.amount}</span>
            <span className="text-white/30">on</span>
            {assetIconUrl(item.ticker) && <TokenLogo ticker={item.ticker} className="h-5 w-5 rounded-md" />}
            <span className="font-bold text-white/70">{item.ticker}</span>
          </span>
        ))}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
