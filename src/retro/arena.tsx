import { PxSprite } from '@/retro/Sprite'
import { boxerOrange, boxerPink } from '@/retro/spriteData'
import { CREAM, INK, NIGHT, Stars, YELLOW } from '@/retro/scene'
import { PIXEL } from '@/retro/race'

// The mock's FIGHT stage (Arena.dc.html): starry night card, corner labels
// with HP bars, the yellow countdown block, two boxers and the rope floor.
// Our arena is one asset against the market, so the right corner is MARKET.

function HpBar({ align }: { align: 'left' | 'right' }) {
  return (
    <div
      role="presentation"
      style={{
        alignSelf: 'stretch',
        height: 24,
        margin: 4,
        background: NIGHT,
        boxShadow: `-4px 0 0 0 ${CREAM}, 4px 0 0 0 ${CREAM}, 0 -4px 0 0 ${CREAM}, 0 4px 0 0 ${CREAM}`,
        display: 'flex',
        justifyContent: align === 'left' ? 'flex-start' : 'flex-end',
      }}
    >
      <div style={{ width: '100%', background: '#58D36B', boxShadow: 'inset 0 4px 0 0 #8BE89A, inset 0 -4px 0 0 #2E9E48' }} />
    </div>
  )
}

export function FightStage({
  leftLabel,
  rightLabel,
  timerLabel,
  timerValue,
}: {
  leftLabel: string
  rightLabel: string
  timerLabel: string
  timerValue: string
}) {
  return (
    <div className="rx-raised" style={{ position: 'relative', background: NIGHT, overflow: 'hidden' }}>
      <div aria-hidden="true">
        <Stars
          stars={[
            ['5%', 120, 4, 1.3],
            ['14%', 180, 8, 1.9],
            ['27%', 130, 4, 1.1],
            ['41%', 210, 4, 1.6],
            ['58%', 140, 8, 1.7],
            ['71%', 200, 4, 1.4],
            ['84%', 125, 4, 2.1],
            ['93%', 190, 8, 1.2],
          ]}
        />
      </div>
      <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px 28px', padding: '24px 28px 0' }}>
        <div style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 16, lineHeight: 1, color: CREAM }}>{leftLabel}</span>
          <HpBar align="left" />
        </div>
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: CREAM }}>{timerLabel}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 24, lineHeight: 1, color: INK, background: YELLOW, padding: '12px 14px' }}>{timerValue}</span>
        </div>
        <div style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 16, lineHeight: 1, color: CREAM }}>{rightLabel}</span>
          <HpBar align="right" />
        </div>
      </div>
      <div aria-hidden="true" style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 'clamp(12px, 5vw, 80px)', padding: '36px 16px 0' }}>
        <div style={{ animation: 'rx-bob 0.6s steps(1) infinite' }}>
          <PxSprite data={boxerOrange} style={{ width: 'clamp(110px, 15vw, 190px)', height: 'auto' }} />
        </div>
        <span style={{ alignSelf: 'center', fontFamily: PIXEL, fontSize: 'clamp(32px, 6vw, 72px)', lineHeight: 1, color: YELLOW, textShadow: '6px 6px 0 #C2245A' }}>VS</span>
        <div style={{ animation: 'rx-bob 0.6s steps(1) 0.3s infinite' }}>
          <PxSprite data={boxerPink} flip style={{ width: 'clamp(110px, 15vw, 190px)', height: 'auto' }} />
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{
          position: 'relative',
          height: 56,
          boxSizing: 'border-box',
          background: '#C2245A',
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(27, 19, 64, 0.4) 0 4px, transparent 4px 56px)',
          borderTop: `4px solid ${INK}`,
        }}
      />
    </div>
  )
}
