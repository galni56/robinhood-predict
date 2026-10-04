import { Link } from 'react-router-dom'
import { PumpSwapCoins } from '@/components/PumpSwapCoins'
import { PxSprite } from '@/retro/Sprite'
import { boxerOrange, boxerPink, coinBlue, coinOrangeGrin, coinPinkGrin, coinPurple, logoCoin } from '@/retro/spriteData'
import { Cloud, CREAM, GrassStrip, Hills, INK, NIGHT, PINK, RoadBand, RoadLane, SKY, Stars, YELLOW } from '@/retro/scene'

// 1:1 port of the approved mock's landing (Main.dc.html), English copy,
// wired to the app's routes. Every size, color and animation step comes
// from the mock.

const PIXEL = "'Press Start 2P', 'Courier New', monospace"

const STEPS = [
  ['Connect a wallet', 'You need a Solana wallet and some SOL to stake.'],
  ['Pick your coin', 'Back the favorite in a race or a fighter in the arena.'],
  ['Claim your win', 'Your coin won? Take your share of the bank.'],
] as const

export function OnchainLandingPage() {
  return (
    <div style={{ fontFamily: "'Pixelify Sans', 'Courier New', monospace", color: INK, background: SKY, overflow: 'hidden' }}>
      {/* ------------------------------------------------------- hero */}
      <header
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          padding: '56px clamp(16px, 4vw, 64px) 0',
          textAlign: 'center',
        }}
      >
        <Cloud width={140} duration="7s" style={{ top: 36, left: '6%' }} />
        <Cloud width={112} duration="9s" style={{ top: 150, right: '7%' }} />
        <Cloud width={84} duration="11s" style={{ top: 330, left: '16%' }} />

        <span className="rx-plate" style={{ position: 'relative', fontFamily: PIXEL, fontSize: 12, lineHeight: 1, background: CREAM, padding: '12px 14px' }}>
          ON SOLANA
        </span>
        <h1 style={{ position: 'relative', margin: 0, fontFamily: PIXEL, fontSize: 'clamp(20px, 3.4vw, 48px)', fontWeight: 400, lineHeight: 1.5 }}>
          <span style={{ display: 'block', textShadow: `4px 4px 0 ${YELLOW}` }}>COIN RACES</span>
          <span style={{ display: 'block', textShadow: `4px 4px 0 ${PINK}` }}>& ARENA FIGHTS</span>
        </h1>
        <p style={{ position: 'relative', margin: 0, maxWidth: 640, fontSize: 'clamp(18px, 1.6vw, 22px)', lineHeight: 1.4, fontWeight: 500, textWrap: 'pretty' }}>
          Pick a coin, bet on it and watch it tear toward the finish. Whoever grows the most in price wins.
        </p>
        <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '12px 24px' }}>
          <Link to="/onchain/races" className="rx-btn rx-btn-yellow" style={{ minHeight: 64, padding: '0 40px', fontFamily: PIXEL, fontSize: 20 }}>
            PLAY
          </Link>
          <a
            href="#how"
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 8px', fontSize: 22, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 6 }}
          >
            How it works
          </a>
        </div>

        {/* Hills, grass and the four-lane road. */}
        <div aria-hidden="true" style={{ alignSelf: 'stretch', margin: '32px calc(clamp(16px, 4vw, 64px) * -1) 0', position: 'relative' }}>
          <Hills />
          <GrassStrip height={20} top />
          <RoadBand>
            <RoadLane height={76} coinSprite={coinOrangeGrin} x={70} label="BONK" blinkDelay="0s" />
            <RoadLane height={76} coinSprite={coinPinkGrin} x={55} label="WIF" blinkDelay="0.25s" />
            <RoadLane height={76} coinSprite={coinPurple} x={62} label="SOL" blinkDelay="0.1s" />
            <RoadLane height={76} coinSprite={coinBlue} x={38} label="POPCAT" blinkDelay="0.35s" />
          </RoadBand>
          <GrassStrip height={28} />
        </div>
      </header>

      {/* -------------------------------------------------- two modes */}
      <section style={{ background: '#58D36B', padding: '72px clamp(16px, 4vw, 64px) 88px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(20px, 2.4vw, 32px)', fontWeight: 400, lineHeight: 1.4, textAlign: 'center', textShadow: '4px 4px 0 #8BE89A' }}>
            TWO MODES
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 40 }}>
            {/* Races card */}
            <article className="rx-raised" style={{ display: 'flex', flexDirection: 'column', background: CREAM }}>
              <div aria-hidden="true" style={{ position: 'relative', height: 220, background: SKY, overflow: 'hidden', borderBottom: `4px solid ${INK}` }}>
                <Cloud width={84} duration="8s" style={{ top: 22, left: '10%' }} />
                <Cloud width={56} duration="10s" style={{ top: 44, right: '14%' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#4A3F78', borderTop: `4px solid ${INK}` }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      right: '10%',
                      width: 24,
                      background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / 24px 24px`,
                    }}
                  />
                  <RoadLane height={64} coinSprite={coinOrangeGrin} coinWidth={48} x={60} blinkDelay="0s" coinTop={6} />
                  <RoadLane height={64} coinSprite={coinPurple} coinWidth={48} x={36} blinkDelay="0.25s" coinTop={6} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, padding: 28 }}>
                <h3 style={{ margin: 0, fontFamily: PIXEL, fontSize: 24, fontWeight: 400, lineHeight: 1.3 }}>RACES</h3>
                <p style={{ margin: 0, fontSize: 20, lineHeight: 1.4, fontWeight: 500, textWrap: 'pretty' }}>
                  Several coins start at once. The one whose price grows the most during the run takes the win.
                </p>
                <Link to="/onchain/races" className="rx-btn rx-btn-yellow" style={{ minHeight: 56, padding: '0 28px', fontFamily: PIXEL, fontSize: 16 }}>
                  TO THE START
                </Link>
              </div>
            </article>

            {/* Arena card */}
            <article className="rx-raised" style={{ display: 'flex', flexDirection: 'column', background: CREAM }}>
              <div aria-hidden="true" style={{ position: 'relative', height: 220, background: NIGHT, overflow: 'hidden', borderBottom: `4px solid ${INK}` }}>
                <Stars
                  stars={[
                    ['8%', 24, 4, 1.3],
                    ['21%', 58, 8, 1.9],
                    ['37%', 18, 4, 1.1],
                    ['63%', 30, 8, 1.7],
                    ['78%', 62, 4, 1.4],
                    ['91%', 22, 4, 2.1],
                  ]}
                />
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 28 }}>
                  <div style={{ animation: 'rx-bob 0.6s steps(1) infinite' }}>
                    <PxSprite data={boxerOrange} width={114} height={102} />
                  </div>
                  <span style={{ alignSelf: 'center', fontFamily: PIXEL, fontSize: 32, color: YELLOW, textShadow: '4px 4px 0 #C2245A' }}>VS</span>
                  <div style={{ animation: 'rx-bob 0.6s steps(1) 0.3s infinite' }}>
                    <PxSprite data={boxerPink} width={114} height={102} flip />
                  </div>
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 40,
                    boxSizing: 'border-box',
                    background: '#C2245A',
                    backgroundImage: 'repeating-linear-gradient(90deg, rgba(27, 19, 64, 0.4) 0 4px, transparent 4px 56px)',
                    borderTop: `4px solid ${INK}`,
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, padding: 28 }}>
                <h3 style={{ margin: 0, fontFamily: PIXEL, fontSize: 24, fontWeight: 400, lineHeight: 1.3 }}>ARENA</h3>
                <p style={{ margin: 0, fontSize: 20, lineHeight: 1.4, fontWeight: 500, textWrap: 'pretty' }}>
                  One coin, one round. Call the final price - the closest call takes the bank.
                </p>
                <Link to="/onchain/arenas" className="rx-btn rx-btn-pink" style={{ minHeight: 56, padding: '0 28px', fontFamily: PIXEL, fontSize: 16 }}>
                  INTO THE FIGHT
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- PumpSwap coins */}
      <section style={{ background: '#4B37B0', borderTop: `4px solid ${INK}`, padding: '56px clamp(16px, 4vw, 64px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <PumpSwapCoins limit={6} feed />
        </div>
      </section>

      {/* ------------------------------------------------ how to play */}
      <section id="how" style={{ background: CREAM, padding: '72px clamp(16px, 4vw, 64px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(20px, 2.4vw, 32px)', fontWeight: 400, lineHeight: 1.4, textAlign: 'center', textShadow: `4px 4px 0 ${YELLOW}` }}>
            HOW TO PLAY
          </h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 40 }}>
            {STEPS.map(([title, body], index) => (
              <li key={title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
                <span aria-hidden="true" className="rx-raised" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, fontFamily: PIXEL, fontSize: 24, background: PINK }}>
                  {index + 1}
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{title}</h3>
                <p style={{ margin: 0, fontSize: 20, lineHeight: 1.4, fontWeight: 500, textWrap: 'pretty' }}>{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------ token */}
      <section style={{ background: YELLOW, borderTop: `4px solid ${INK}`, padding: '56px clamp(16px, 4vw, 64px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '32px 48px' }}>
          <div style={{ flex: '1 1 420px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24 }}>
            <div style={{ animation: 'rx-bob 0.6s steps(1) infinite' }}>
              <PxSprite data={logoCoin} width={96} height={102} />
            </div>
            <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(18px, 2.2vw, 28px)', fontWeight: 400, lineHeight: 1.4 }}>TOKEN $PROPHET</h2>
              <p style={{ margin: 0, maxWidth: 520, fontSize: 20, lineHeight: 1.4, fontWeight: 500, textWrap: 'pretty' }}>
                Launching on pump.fun. Buyback and burn run through pump.fun and PumpSwap.
              </p>
            </div>
          </div>
          <div style={{ flex: '0 1 380px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
            <div className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 12, lineHeight: 1.6, background: CREAM, padding: '16px 18px', overflowWrap: 'anywhere' }}>
              [CONTRACT ADDRESS]
            </div>
            <a href="https://pump.fun" target="_blank" rel="noreferrer" className="rx-btn rx-btn-pink" style={{ minHeight: 56, padding: '0 28px', fontFamily: PIXEL, fontSize: 14 }}>
              BUY ON PUMP.FUN
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
