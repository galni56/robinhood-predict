import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import { LAUNCH_LIMITS, LAUNCH_RPC_URL, LAUNCH_WS_URL, createTokenInstructions, uploadLaunchMetadata } from '@/chain/pumpLaunch'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { shortTxError } from '@/lib/format'
import { CoinFighter, DriftingCloud, Sun } from '@/retro/landingFx'
import { CREAM, INK, PINK, SKY, YELLOW } from '@/retro/scene'
import { coinPinkGrin } from '@/retro/spriteData'

const PIXEL = "'Press Start 2P', 'Courier New', monospace"
const bytes = (value: string) => new TextEncoder().encode(value).length

type Step = 'idle' | 'uploading' | 'signing' | 'confirming'
const STEP_LABEL: Record<Step, string> = { idle: '', uploading: 'Uploading image…', signing: 'Signing…', confirming: 'Launching on pump.fun…' }

/** Launch a token on pump.fun from Prophet: the creator's wallet signs and
 * pays pump.fun's network costs; Prophet takes nothing. */
export function OnchainLaunchPage() {
  const { publicKey, connected, sendTransaction } = useWallet()
  const connection = useMemo(() => new Connection(LAUNCH_RPC_URL, { commitment: 'confirmed', wsEndpoint: LAUNCH_WS_URL }), [])
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [description, setDescription] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const [website, setWebsite] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [launched, setLaunched] = useState<{ mint: string; signature: string } | null>(null)
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
      const tx = new Transaction({ feePayer: publicKey, ...latest }).add(...createTokenInstructions({ mint, user: publicKey, name: cleanName, symbol: cleanSymbol, uri }))
      setStep('signing')
      const signature = await sendTransaction(tx, connection, { signers: [mint], preflightCommitment: 'confirmed' })
      setStep('confirming')
      const result = await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
      if (result.value.err) throw new Error(`Launch failed: ${JSON.stringify(result.value.err)}`)
      setLaunched({ mint: mint.publicKey.toBase58(), signature })
      setStep('idle')
    } catch (cause) {
      setStep('idle')
      setError(shortTxError(cause, 'launch'))
    }
  }

  const label = { display: 'block', marginBottom: 8, fontFamily: PIXEL, fontSize: 11 } as const
  const busy = step !== 'idle'

  return (
    <div style={{ position: 'relative', minHeight: '100%', background: SKY, color: INK, fontFamily: "'Pixelify Sans', 'Courier New', monospace", overflow: 'hidden' }}>
      <Sun size={72} style={{ top: 24, right: '5%' }} />
      <DriftingCloud width={120} top={60} duration={80} delay={10} />
      <DriftingCloud width={90} top={220} duration={65} delay={40} />
      <div className="mx-auto max-w-[1100px] px-4 py-8" style={{ position: 'relative' }}>
        <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(18px, 2.6vw, 32px)', fontWeight: 400, lineHeight: 1.4, textShadow: `4px 4px 0 ${YELLOW}` }}>LAUNCH YOUR COIN</h1>
        <p style={{ margin: '10px 0 0', maxWidth: 680, fontSize: 18, fontWeight: 600 }}>
          Your coin goes live on pump.fun in one signature. When it graduates to PumpSwap it can join Prophet races and arenas.
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
        ) : (
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
                Costs about 0.02 SOL of Solana network fees and account rent, paid by your wallet to the network and pump.fun. Prophet takes nothing. You become the coin&apos;s creator and earn pump.fun&apos;s creator fees.
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
                  ['3', 'Joins Prophet', 'From then on it can race and fight here.'],
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
        <p style={{ marginTop: 24, fontSize: 14 }}>
          <Link to="/onchain/pumpswap" style={{ fontWeight: 700, textDecoration: 'underline' }}>See the PumpSwap coins in the game →</Link>
        </p>
      </div>
    </div>
  )
}
