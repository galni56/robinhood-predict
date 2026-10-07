import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import { LAUNCH_LIMITS, LAUNCH_RPC_URL, LAUNCH_WS_URL, createTokenInstructions, launchMemoInstruction, uploadLaunchMetadata } from '@/chain/pumpLaunch'
import { recordLaunch, useProphetLaunches } from '@/chain/gameServer'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { COIN_BODIES } from '@/components/GamePickers'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { assetIconUrl } from '@/lib/assetIcons'
import { ipfsImageUrl } from '@/lib/ipfs'
import { shortTxError } from '@/lib/format'
import { life } from '@/lib/life'
import { CoinFighter, DriftingCloud, Sun } from '@/retro/landingFx'
import { PxSprite } from '@/retro/Sprite'
import { CREAM, INK, PINK, SKY, YELLOW, PIXEL } from '@/retro/scene'
import { coinBlueGrin, coinGreen, coinOrangeGrin, coinPinkGrin } from '@/retro/spriteData'

const bytes = (value: string) => new TextEncoder().encode(value).length
const GREEN = '#8BE89A'
const short = (mint: string) => `${mint.slice(0, 4)}…${mint.slice(-4)}`
const ago = (at: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - at)
  return s < 3600 ? `${Math.max(1, Math.floor(s / 60))} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`
}

/** What happens after the launch, the current stage marked. */
function NextSteps({ done }: { done: boolean }) {
  const stages = [
    { sprite: coinPinkGrin, title: 'Live on pump.fun', body: 'Anyone can buy it on the bonding curve right away.', tag: done ? 'DONE' : 'STEP 1' },
    { sprite: coinOrangeGrin, title: 'Fill the curve', body: 'Every buy pushes the price up. When the curve is full, pump.fun moves the coin to a PumpSwap pool.', tag: done ? 'NOW' : 'STEP 2' },
    { sprite: coinBlueGrin, title: 'Race on HasteFun', body: 'Within about 15 minutes of graduating it joins the PumpSwap list with a MADE ON HASTEFUN badge and can race.', tag: 'NEXT' },
  ]
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
      {stages.map((s, i) => {
        const tagBg = s.tag === 'DONE' ? GREEN : s.tag === 'NOW' ? YELLOW : i === 2 ? PINK : CREAM
        return (
          <div key={s.title} className="rx-raised" style={{ position: 'relative', background: CREAM, padding: '20px 16px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', opacity: done && i === 2 ? 0.85 : 1 }}>
            <span style={{ position: 'absolute', top: -14, left: 12, background: tagBg, border: `3px solid ${INK}`, fontFamily: PIXEL, fontSize: 9, padding: '4px 6px', color: INK }}>{s.tag === 'DONE' ? '✓ DONE' : s.tag}</span>
            <span className="rx-life-idle" style={{ flex: 'none', marginTop: 4, ...life(21 + i, 1, 1.2, 2.8) }}><PxSprite data={s.sprite} width={38} height={40} /></span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{s.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.4, opacity: 0.8, marginTop: 4 }}>{s.body}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const launchConnection = new Connection(LAUNCH_RPC_URL, 'confirmed')

/**
 * Name, ticker and picture of a coin launched here, read from the chain: the
 * server keeps only the mint. pump.fun coins are Token-2022 with the metadata
 * inside the mint account; the picture is in the JSON its uri points to.
 */
function useCoinMeta(mint: string) {
  return useQuery({
    queryKey: ['coin-meta', mint],
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const account = await launchConnection.getParsedAccountInfo(new PublicKey(mint))
      const data = account.value?.data as { parsed?: { info?: { extensions?: { extension: string; state: { name: string; symbol: string; uri: string } }[] } } } | undefined
      const meta = data?.parsed?.info?.extensions?.find((e) => e.extension === 'tokenMetadata')?.state
      if (!meta) return null
      let image: string | undefined
      try {
        const json = await (await fetch(ipfsImageUrl(meta.uri) ?? meta.uri)).json() as { image?: string }
        image = ipfsImageUrl(json.image)
      } catch { /* no picture: the coin shows its letter */ }
      return { name: meta.name, symbol: meta.symbol, image }
    },
  })
}

function YourCoin({ mint, at, index }: { mint: string; at: number; index: number }) {
  const { data: meta } = useCoinMeta(mint)
  return (
    <div className="rx-plate" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#FFFFFF', color: INK }}>
      <span className="rx-life-idle" style={life(71 + index, 1, 1.1, 2.6)}><CoinFighter body={COIN_BODIES[index % COIN_BODIES.length]} logoUrl={meta?.image ?? null} symbol={meta?.symbol ?? '?'} size={40} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta ? `$${meta.symbol}` : short(mint)}{meta?.name ? <span style={{ fontWeight: 600, opacity: 0.65 }}> · {meta.name}</span> : null}</span>
        <span style={{ display: 'block', fontSize: 12, opacity: 0.65 }}>launched {ago(at)} · {short(mint)}</span>
      </span>
      <a href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer" className="rx-btn rx-btn-yellow" style={{ padding: '8px 12px', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>pump.fun ↗</a>
    </div>
  )
}

/** The connected wallet's launches, newest first, on top of the page. */
function YourCoins({ wallet }: { wallet: string }) {
  const { data: launches } = useProphetLaunches()
  const mine = (launches ?? []).filter((l) => l.wallet === wallet).sort((a, b) => b.at - a.at)
  if (mine.length === 0) return null
  return (
    <div className="rx-raised" style={{ marginTop: 28, background: CREAM, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontFamily: PIXEL, fontSize: 12 }}>YOUR COINS · {mine.length}</span>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
        {mine.map((l, i) => <YourCoin key={l.mint} mint={l.mint} at={l.at} index={i} />)}
      </div>
    </div>
  )
}

/** Coins launched from this page: graduated ones racing now, then the latest launches. */
function MadeHere() {
  const { data: launches } = useProphetLaunches()
  const { assets } = useApprovedRaceAssets()
  const racing = assets.filter((a) => a.launchedOnProphet)
  const recent = [...(launches ?? [])].sort((a, b) => b.at - a.at).slice(0, 8)
  if (!launches?.length && racing.length === 0) return null
  return (
    <div className="rx-raised" style={{ marginTop: 36, background: CREAM, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 12 }}>MADE ON HASTEFUN</span>
        <span style={{ fontWeight: 700, opacity: 0.7 }}>{launches?.length ?? 0} launched · {racing.length} racing</span>
      </div>
      {racing.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {racing.map((a, i) => (
            <Link key={a.assetId} to="/onchain/pumpswap" className="rx-plate rx-hop-host" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: GREEN, color: INK, textDecoration: 'none', fontWeight: 700 }}>
              <CoinFighter body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={assetIconUrl(a.symbol) ?? a.logoUrl} symbol={a.symbol} size={28} />
              ${a.symbol} <span style={{ fontFamily: PIXEL, fontSize: 8 }}>RACING</span>
            </Link>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
          {recent.map((l, i) => <YourCoin key={l.mint} mint={l.mint} at={l.at} index={i + 3} />)}
        </div>
      )}
    </div>
  )
}

type Step = 'idle' | 'uploading' | 'signing' | 'confirming'
const STEP_LABEL: Record<Step, string> = { idle: '', uploading: 'Uploading image…', signing: 'Signing…', confirming: 'Launching on pump.fun…' }

/** Launch a token on pump.fun from HasteFun: the creator's wallet signs and
 * pays pump.fun's network costs; HasteFun takes nothing. */
export function OnchainLaunchPage() {
  const { publicKey, connected, sendTransaction } = useWallet()
  const connection = useMemo(() => new Connection(LAUNCH_RPC_URL, { commitment: 'confirmed', wsEndpoint: LAUNCH_WS_URL }), [])
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [description, setDescription] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  // Coins launched here link back to HasteFun unless the creator sets another site.
  const [website, setWebsite] = useState(() => `${window.location.origin}${import.meta.env.BASE_URL}`)
  const [image, setImage] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [launched, setLaunched] = useState<{ mint: string; signature: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const cleanName = name.trim()
  const cleanSymbol = symbol.trim().toUpperCase()
  const problem = !image ? 'Add a picture'
    : image.size > LAUNCH_LIMITS.imageBytes ? 'The picture is over 4.5 MB'
      : !cleanName ? 'Name your coin'
        : bytes(cleanName) > LAUNCH_LIMITS.name ? `Name: up to ${LAUNCH_LIMITS.name} characters`
          : !cleanSymbol ? 'Pick a ticker'
            : bytes(cleanSymbol) > LAUNCH_LIMITS.symbol ? `Ticker: up to ${LAUNCH_LIMITS.symbol} characters`
              : bytes(description) > LAUNCH_LIMITS.description ? `Description: up to ${LAUNCH_LIMITS.description} characters`
                : null

  async function launch() {
    if (!publicKey || !image || problem) return
    setError(null)
    try {
      setStep('uploading')
      const uri = await uploadLaunchMetadata({ name: cleanName, symbol: cleanSymbol, description: description.trim(), image, twitter: twitter.trim(), telegram: telegram.trim(), website: website.trim() })
      // The new token's mint address: a fresh key made here, used once to sign.
      const mint = Keypair.generate()
      const latest = await connection.getLatestBlockhash('confirmed')
      // The memo marks the launch as made on HasteFun, so the coin is labeled in races once it graduates.
      const tx = new Transaction({ feePayer: publicKey, ...latest }).add(...createTokenInstructions({ mint, user: publicKey, name: cleanName, symbol: cleanSymbol, uri }), launchMemoInstruction(publicKey))
      setStep('signing')
      const signature = await sendTransaction(tx, connection, { signers: [mint], preflightCommitment: 'confirmed' })
      setStep('confirming')
      const result = await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
      if (result.value.err) throw new Error(`Launch failed: ${JSON.stringify(result.value.err)}`)
      setLaunched({ mint: mint.publicKey.toBase58(), signature })
      void recordLaunch(mint.publicKey.toBase58(), signature)
      setStep('idle')
    } catch (cause) {
      setStep('idle')
      setError(shortTxError(cause, 'launch'))
    }
  }

  const label = { display: 'block', marginBottom: 8, fontFamily: PIXEL, fontSize: 11 } as const
  const busy = step !== 'idle'

  return (
    <div style={{ position: 'relative', minHeight: '100%', background: SKY, color: INK, fontFamily: "'HasteFun Digits', 'Pixelify Sans', 'Courier New', monospace", overflow: 'hidden' }}>
      <Sun size={72} style={{ top: 24, right: '5%' }} />
      <DriftingCloud width={120} top={60} duration={80} delay={10} />
      <DriftingCloud width={90} top={220} duration={65} delay={40} />
      <div className="mx-auto max-w-[1100px] px-4 py-8" style={{ position: 'relative' }}>
        <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(18px, 2.6vw, 32px)', fontWeight: 400, lineHeight: 1.4, textShadow: `4px 4px 0 ${YELLOW}` }}>LAUNCH YOUR COIN</h1>
        <p style={{ margin: '10px 0 0', maxWidth: 680, fontSize: 18, fontWeight: 600 }}>
          Your coin goes live on pump.fun in one signature. When it graduates to PumpSwap it can join HasteFun races and arenas.
        </p>

        {launched ? (
          <div className="rx-raised" style={{ marginTop: 28, background: CREAM, padding: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 28 }}>
            <div style={{ animation: 'rx-bob 0.5s steps(1) infinite' }}><CoinFighter body={coinPinkGrin} logoUrl={preview} symbol={cleanSymbol} size={110} /></div>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ fontFamily: PIXEL, fontSize: 18 }}>${cleanSymbol} IS LIVE!</div>
              <p style={{ margin: '10px 0', fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>Mint: {launched.mint}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <a href={`https://pump.fun/coin/${launched.mint}`} target="_blank" rel="noreferrer" className="rx-btn rx-btn-yellow" style={{ padding: '12px 18px', fontWeight: 700 }}>Open on pump.fun ↗</a>
                <a href={`https://solscan.io/tx/${launched.signature}`} target="_blank" rel="noreferrer" className="rx-btn rx-btn-white" style={{ padding: '12px 18px', fontWeight: 700 }}>Transaction ↗</a>
                <button type="button" onClick={() => { setLaunched(null); setName(''); setSymbol(''); setDescription(''); setImage(null) }} className="rx-btn rx-btn-white" style={{ padding: '12px 18px', fontWeight: 700 }}>Launch another</button>
              </div>
            </div>
          </div>
        ) : null}

        {launched && (
          <>
            <h2 style={{ margin: '40px 0 24px', fontFamily: PIXEL, fontSize: 12, fontWeight: 400 }}>WHAT HAPPENS NEXT</h2>
            <NextSteps done />
            <div className="rx-raised" style={{ marginTop: 24, background: INK, color: CREAM, padding: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
              <span className="rx-life-idle" style={life(9, 1, 1.2, 2.4)}><PxSprite data={coinGreen} width={44} height={47} /></span>
              <div style={{ flex: '1 1 280px' }}>
                <div style={{ fontFamily: PIXEL, fontSize: 11, color: YELLOW }}>GET IT MOVING</div>
                <div style={{ marginTop: 6, fontSize: 15, opacity: 0.85 }}>Buy the first bit yourself, then share the link - the curve fills faster when people see it early.</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(`https://pump.fun/coin/${launched.mint}`); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="rx-btn rx-btn-white" style={{ padding: '12px 16px', fontWeight: 700 }}>{copied ? 'Copied!' : 'Copy link'}</button>
                <a href={`https://x.com/intent/post?text=${encodeURIComponent(`$${cleanSymbol} is live on pump.fun, launched on HasteFun`)}&url=${encodeURIComponent(`https://pump.fun/coin/${launched.mint}`)}`} target="_blank" rel="noreferrer" className="rx-btn rx-btn-yellow" style={{ padding: '12px 16px', fontWeight: 700 }}>Post on X ↗</a>
              </div>
            </div>
          </>
        )}

        {!launched && publicKey && <YourCoins wallet={publicKey.toBase58()} />}

        {launched ? null : (
          <div style={{ marginTop: 28, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'start' }}>
            <div className="rx-raised" style={{ background: CREAM, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <span style={label}>PICTURE</span>
                <label className="rx-hop-host" style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', border: `3px dashed ${INK}`, padding: 14, background: '#FFFFFF' }}>
                  <CoinFighter body={coinPinkGrin} logoUrl={preview} symbol={cleanSymbol || '?'} size={64} />
                  <span style={{ fontWeight: 700 }}>{image ? image.name : 'Choose an image (PNG, JPG, GIF, up to 4.5 MB)'}</span>
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => setImage(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                </label>
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr' }}>
                <div><label style={label} htmlFor="coin-name">NAME</label><input id="coin-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Moon Cat" className="rx-input w-full px-3 font-medium" style={{ height: 50 }} /></div>
                <div><label style={label} htmlFor="coin-ticker">TICKER</label><input id="coin-ticker" value={symbol} onChange={(e) => setSymbol(e.target.value.replace(/\s/g, ''))} placeholder="MCAT" className="rx-input w-full px-3 font-medium" style={{ height: 50, textTransform: 'uppercase' }} /></div>
              </div>
              <div><label style={label} htmlFor="coin-desc">DESCRIPTION</label><textarea id="coin-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this coin about?" className="rx-input w-full px-3 py-2 font-medium" /></div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="X / Twitter link" className="rx-input px-3 font-medium" style={{ height: 44 }} />
                <input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Telegram link" className="rx-input px-3 font-medium" style={{ height: 44 }} />
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" className="rx-input px-3 font-medium" style={{ height: 44 }} />
              </div>
              {error && <p style={{ margin: 0, color: '#C2245A', fontWeight: 600 }}>{error}</p>}
              {!connected ? <WalletOptionsList tone="race" /> : (
                <button type="button" onClick={launch} disabled={!!problem || busy} className="rx-btn rx-btn-pink w-full" style={{ minHeight: 60, fontFamily: PIXEL, fontSize: 13 }}>
                  {busy ? STEP_LABEL[step] : problem ?? 'LAUNCH ON PUMP.FUN'}
                </button>
              )}
              <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>
                Costs about 0.02 SOL of Solana network fees and account rent, paid by your wallet to the network and pump.fun. HasteFun takes nothing. You become the coin&apos;s creator and earn pump.fun&apos;s creator fees.
              </p>
            </div>

            <div className="rx-raised" style={{ background: INK, color: CREAM, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 10, opacity: 0.7 }}>PREVIEW</span>
              <div className="rx-hop" style={{ display: 'inline-block' }}><CoinFighter body={coinPinkGrin} logoUrl={preview} symbol={cleanSymbol || '?'} size={120} /></div>
              <div style={{ fontFamily: PIXEL, fontSize: 16, color: YELLOW }}>{cleanSymbol ? `$${cleanSymbol}` : '$TICKER'}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{cleanName || 'Your coin'}</div>
              <p style={{ margin: 0, fontSize: 15, opacity: 0.8, maxWidth: 320, overflowWrap: 'anywhere' }}>{description.trim() || 'Your description shows here.'}</p>
              <div style={{ marginTop: 8, display: 'grid', gap: 8, width: '100%', textAlign: 'left', fontSize: 14 }}>
                {[
                  ['1', 'Live on pump.fun', 'Anyone can buy it on the bonding curve right away.'],
                  ['2', 'Graduates to PumpSwap', 'When the curve fills up, pump.fun moves it to a PumpSwap pool.'],
                  ['3', 'Joins HasteFun', 'From then on it can race and fight here.'],
                ].map(([n, t, b]) => (
                  <div key={n} style={{ display: 'flex', gap: 10 }}>
                    <span style={{ flex: 'none', width: 24, height: 24, background: n === '3' ? PINK : YELLOW, color: INK, fontFamily: PIXEL, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
                    <span><b>{t}.</b> <span style={{ opacity: 0.75 }}>{b}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <MadeHere />
        <p style={{ marginTop: 24, fontSize: 14 }}>
          <Link to="/onchain/pumpswap" style={{ fontWeight: 700, textDecoration: 'underline' }}>See the PumpSwap coins in the game →</Link>
        </p>
      </div>
    </div>
  )
}
