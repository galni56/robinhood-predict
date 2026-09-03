import { mockAddress } from '@/lib/hash'
import type { Token } from '@/types'

// A recognizable basket of "tokenized stocks" — all mock, prices are rough
// flavor only and NOT a real feed. (For reference: the real Robinhood Chain
// lists 2,000+ tokenized names as of mid-2026 — this is a curated subset for
// a demo, not an attempt to mirror the full catalog.)
export const TOKENS: Token[] = [
  { symbol: 'xHOOD', name: 'Robinhood Markets Inc.', startPrice: 46.2, accent: 'emerald' },
  { symbol: 'xSOFI', name: 'SoFi Technologies Inc.', startPrice: 14.8, accent: 'sky' },
  { symbol: 'xPLTR', name: 'Palantir Technologies Inc.', startPrice: 78.4, accent: 'violet' },
  { symbol: 'xRIOT', name: 'Riot Platforms Inc.', startPrice: 9.6, accent: 'orange' },
  { symbol: 'xLCID', name: 'Lucid Group Inc.', startPrice: 3.1, accent: 'rose' },
  { symbol: 'xNIO', name: 'NIO Inc.', startPrice: 5.4, accent: 'red' },
  { symbol: 'xGME', name: 'GameStop Corp.', startPrice: 22.7, accent: 'yellow' },
  { symbol: 'xAMC', name: 'AMC Entertainment Holdings', startPrice: 4.3, accent: 'indigo' },
  { symbol: 'xAAPL', name: 'Apple Inc.', startPrice: 232.0, accent: 'sky' },
  { symbol: 'xMSFT', name: 'Microsoft Corp.', startPrice: 418.0, accent: 'emerald' },
  { symbol: 'xNVDA', name: 'NVIDIA Corp.', startPrice: 136.0, accent: 'emerald' },
  { symbol: 'xTSLA', name: 'Tesla Inc.', startPrice: 342.0, accent: 'red' },
  { symbol: 'xAMZN', name: 'Amazon.com Inc.', startPrice: 196.0, accent: 'orange' },
  { symbol: 'xMETA', name: 'Meta Platforms Inc.', startPrice: 582.0, accent: 'sky' },
  { symbol: 'xGOOGL', name: 'Alphabet Inc.', startPrice: 168.0, accent: 'sky' },
  { symbol: 'xNFLX', name: 'Netflix Inc.', startPrice: 748.0, accent: 'red' },
  { symbol: 'xAMD', name: 'Advanced Micro Devices Inc.', startPrice: 144.0, accent: 'emerald' },
  { symbol: 'xCOIN', name: 'Coinbase Global Inc.', startPrice: 248.0, accent: 'sky' },
  { symbol: 'xMSTR', name: 'Strategy Inc. (MicroStrategy)', startPrice: 378.0, accent: 'orange' },
  { symbol: 'xUBER', name: 'Uber Technologies Inc.', startPrice: 72.0, accent: 'violet' },
  { symbol: 'xBA', name: 'Boeing Co.', startPrice: 178.0, accent: 'indigo' },
  { symbol: 'xDIS', name: 'Walt Disney Co.', startPrice: 112.0, accent: 'sky' },
  { symbol: 'xPYPL', name: 'PayPal Holdings Inc.', startPrice: 68.0, accent: 'violet' },
  { symbol: 'xSNAP', name: 'Snap Inc.', startPrice: 10.2, accent: 'yellow' },
  { symbol: 'xF', name: 'Ford Motor Co.', startPrice: 11.4, accent: 'indigo' },
].map((t) => ({ ...t, contractAddress: mockAddress(`token:${t.symbol}`) }))

export const TOKEN_BY_SYMBOL = new Map(TOKENS.map((t) => [t.symbol, t]))

export const RHCHAIN_META = {
  name: 'RHChain (testnet)',
  disclaimer:
    'Mock demo only — not affiliated with Robinhood Markets, Inc. No real chain, feed, funds or accounts are involved.',
  ticker: 'mUSD',
  blockTimeMs: 6_000,
}
