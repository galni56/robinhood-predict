# Asset Race Stock and Meme live display

This service uses the same `PoolPriceEngine` and exact StockToken/USDG pools as
`SignedPoolRaceOracle` settlement. Browser data is still display-only and
cannot affect a race, but its market source and integer price math now match
onchain P0/P1.

The same engine/collector/SSE process also serves registry-approved Meme/WETH
pools, with no additional polling loop or price API. Their `priceQuote` is WETH
per Meme and `quoteSymbol` is WETH; `priceUsdG` remains Stock-only compatibility
metadata. Integer returns always use official onchain P0 in the same quote.
See `ASSET_RACE_MEME_POOL_REVIEW.md` for exact approved pools and depth evidence.

## Approved pools

The canonical Stock Token addresses and immutable pool metadata are frozen in
`config/asset-race-assets.json`. V3 pools were verified through the factory,
token ordering, fee, and `slot0`; V4 PoolIds were reconstructed from their
onchain `Initialize` PoolKeys and read through the official `StateView`.

| Asset | Approved pair identifier | Liquidity | 24h volume |
|---|---|---:|---:|
| NVDA | `0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3` | ~$7.31m | ~$21.75m |
| TSLA | `0xf4ACdAEEB7022862A763C9B1B885e11191c889E3` | ~$1.13m | ~$0.99m |
| AAPL | `0xc748f4671a867db48b552f6b7650bf3255e05f80f00e3f7aad1b17ccb7898fdb` | ~$1.46m | ~$0.62m |
| META | `0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36` | ~$1.11m | ~$1.08m |
| MSTR | `0x319bac87e616a89e241c10aeb8afd4892a852cdd8b373cd9765ecddc40b87cfe` | ~$1.37m | ~$2.94m |
| AMZN | `0x8AC92DA74AB5F3b1d024Dc1943Ad7e15Dc4179Ef` | ~$1.31m | ~$1.04m |
| MSFT | `0xeb60bCD1D920ad6E102690CCFC6fB488899E1510` | ~$0.75m | ~$0.51m |
| GOOGL | `0x34D0dC122CF9A8Eb296fC5e0D3A233625D7d19b7` | ~$1.18m | ~$6.36m |
| MU | `0xd057B1Bc54917855BBee58eAd58647f47caB35E5` | ~$1.68m | ~$1.13m |
| NFLX | `0x59895C0302F41aEaa129D2fa2442CEc01E7eF45E` | ~$0.26m | ~$0.29m |

DEX Screener metadata remains useful for discovery, liquidity monitoring, and
display sanity checks. It is not the primary live source and never enters P0/P1.

## Runtime

Start one process for the whole deployment:

```bash
npm run live:asset-race
```

Optional public configuration:

```text
ASSET_RACE_LIVE_HOST=127.0.0.1
ASSET_RACE_LIVE_PORT=8787
ASSET_RACE_LIVE_POLL_INTERVAL_MS=1000
ASSET_RACE_LIVE_STALE_MS=5000
ASSET_RACE_POOL_RPC_URL=https://rpc.mainnet.chain.robinhood.com
VITE_ASSET_RACE_LIVE_URL=/api/asset-race/live
```

Each poll first freezes one latest block, then reads every V3/V4 pool at that
explicit block through JSON-RPC batching. The process polls once per second
even when no browsers are connected. All browsers share one SSE endpoint:

```text
GET /api/asset-race/live
```

The VPS reverse proxy must disable buffering and caching for this endpoint:

```nginx
location /api/asset-race/live {
    proxy_pass http://127.0.0.1:8787;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```

Do not expose port 8787 publicly. Run the service as an unprivileged user and
restart it automatically with the existing service manager.

## Display semantics and fallback

At RUNNING, provisional return is `current pool price / onchain startPrice - 1`
using integer arithmetic. The onchain P0 is the only economic anchor, so page
refreshes, late viewers, and backend restarts cannot change the percentage.
No browser `localStorage` anchor is used.

An unchanged pool state remains unchanged; the SSE heartbeat only updates
availability. If direct RPC fails, the backend retains its last known direct
pool value and marks it stale. The frontend does not fall back to underlying
equity quotes. A future DEX Screener fallback may display the exact frozen pair,
but can never enter settlement.

When the contract reports RESOLVED/VOID/CANCELLED, the existing official result
view replaces provisional live values. Only deterministic T0/T1 block-pair
observations are signed; arbitrary UI ticks are never signed.

## Observed cadence

A 1,000-block production sample covered 99 seconds: 900 consecutive blocks
shared their predecessor's timestamp and 99 advanced by one second; maximum
timestamp gap was one second with no continuity errors. Pool prices use the last
block strictly before T, so maxEndpointLag is zero/unused: a delayed boundary
child still proves the correct state. Start/resolution grace alone limits
operational capture. The public RPC served recent historical pool state around 5,000 blocks
deep but rejected reads around 10,000 blocks deep, so archive depth must be
monitored and exceed the operational capture grace.
