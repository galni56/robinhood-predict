import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RuleError } from './rules.mjs'
import { DUEL, backDuel, createDuel, duelSettlements, duelTimers, joinDuel, leaveDuel, payDuel, prepareDuel, readyDuel, resolveDuel, startDuel } from './duel.mjs'

const SOL = 1_000_000_000n
const coin = (symbol, category = 'meme') => ({ symbol, category, priceSource: `pool-${symbol}`, priceDecimals: 8, enabled: true })
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof RuleError && e.code === code)
const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0n)

function twoRacers(stake = SOL / 10n) {
  const duel = createDuel(0, 0)
  joinDuel(duel, { wallet: 'vasya', asset: coin('BONK'), stake, duration: 60 }, 1)
  joinDuel(duel, { wallet: 'petya', asset: coin('WIF') }, 2)
  return duel
}

test('duel: the first racer sets the lobby; others follow its category with a coin of their own', () => {
  const duel = twoRacers()
  assert.equal(duel.category, 'meme')
  assert.equal(duel.stake, SOL / 10n)
  assert.equal(duel.unit, 'price', 'catalog memes race by price')
  throwsCode(() => joinDuel(duel, { wallet: 'x', asset: coin('BONK') }, 3), 'CoinTaken')
  throwsCode(() => joinDuel(duel, { wallet: 'x', asset: coin('SOL', 'crypto') }, 3), 'WrongCategory')
  throwsCode(() => joinDuel(duel, { wallet: 'vasya', asset: coin('PEPE') }, 3), 'AlreadyInDuel')
  const crypto = createDuel(1, 0)
  throwsCode(() => joinDuel(crypto, { wallet: 'a', asset: coin('SOL', 'crypto'), stake: SOL / 10n, duration: 180 }, 1), 'UnsupportedDuration')
  leaveDuel(duel, 'petya')
  assert.equal(duel.racers.length, 1)
})

test('duel: paying opens the ready check; everyone ready starts it', () => {
  const duel = twoRacers()
  throwsCode(() => payDuel(duel, { wallet: 'vasya', amount: SOL, time: 3 }), 'WrongStakeAmount')
  payDuel(duel, { wallet: 'vasya', amount: SOL / 10n, time: 3 })
  assert.equal(duel.status, 'open')
  payDuel(duel, { wallet: 'petya', amount: SOL / 10n, time: 4 })
  assert.equal(duel.status, 'ready')
  readyDuel(duel, 'vasya', 10)
  assert.equal(duel.status, 'ready', 'waits for the other racer')
  readyDuel(duel, 'petya', 20)
  assert.equal(duel.status, 'starting')
  assert.equal(duel.startTime, 20)
})

test('duel: spectators back one racer, capped; racers cannot back', () => {
  const duel = twoRacers()
  payDuel(duel, { wallet: 'vasya', amount: SOL / 10n, time: 3 })
  throwsCode(() => backDuel(duel, { wallet: 'fan', seat: 2, amount: SOL, time: 4 }), 'NoSuchRacer')
  backDuel(duel, { wallet: 'fan', seat: 1, amount: SOL / 2n, time: 4, maxPerWallet: SOL })
  throwsCode(() => backDuel(duel, { wallet: 'fan', seat: 1, amount: SOL, time: 5, maxPerWallet: SOL }), 'BackLimit')
  payDuel(duel, { wallet: 'petya', amount: SOL / 10n, time: 5 })
  throwsCode(() => backDuel(duel, { wallet: 'fan', seat: 2, amount: SOL / 10n, time: 6 }), 'OneRacerPerBacker')
  throwsCode(() => backDuel(duel, { wallet: 'petya', seat: 1, amount: SOL / 10n, time: 6 }), 'RacersCannotBack')
  throwsCode(() => joinDuel(duel, { wallet: 'fan', asset: coin('PEPE') }, 6), 'BackersCannotRace')
})

test('duel: payout example - winner racer 30% of the losing side, his backers 70%, 2% only from winnings', () => {
  const duel = twoRacers()
  payDuel(duel, { wallet: 'vasya', amount: SOL / 10n, time: 3 })
  payDuel(duel, { wallet: 'petya', amount: SOL / 10n, time: 4 })
  backDuel(duel, { wallet: 'a', seat: 1, amount: (2n * SOL) / 10n, time: 5 })
  backDuel(duel, { wallet: 'b', seat: 1, amount: SOL / 10n, time: 5 })
  backDuel(duel, { wallet: 'c', seat: 2, amount: (2n * SOL) / 10n, time: 5 })
  readyDuel(duel, 'vasya', 6)
  readyDuel(duel, 'petya', 7)
  startDuel(duel, { prices: { 'pool-BONK': 100n, 'pool-WIF': 100n }, prevSlot: 1 }, 9)
  assert.equal(duel.endTime, 67)
  resolveDuel(duel, { prices: { 'pool-BONK': 110n, 'pool-WIF': 105n }, prevSlot: 2 }, 70)
  assert.equal(duel.winnerSeat, 1)
  const out = duelSettlements(duel)
  const get = (w) => out.find((o) => o.wallet === w)?.amount ?? 0n
  // Vasya: 0.1 back + 0.1 from Petya + 30% of 0.2 = 0.26, fee 2% of 0.16 gain.
  assert.equal(get('vasya'), (26n * SOL) / 100n - (16n * SOL) / 100n / 50n)
  // a and b split 70% of 0.2 = 0.14 two to one, minus 2% of their gain.
  const gainA = ((14n * SOL) / 100n * 2n) / 3n
  assert.equal(get('a'), (2n * SOL) / 10n + gainA - (gainA * 200n) / 10_000n)
  assert.equal(get('c'), 0n)
  assert.ok(sum(out) <= (7n * SOL) / 10n, 'never pays more than the pot')
  assert.ok(sum(out) >= (7n * SOL) / 10n - (7n * SOL) / 1000n, 'only the fee and dust stay')
})

test('duel: with nobody behind the winner, the racer takes all the losing spectator money', () => {
  const duel = twoRacers()
  payDuel(duel, { wallet: 'vasya', amount: SOL / 10n, time: 3 })
  payDuel(duel, { wallet: 'petya', amount: SOL / 10n, time: 4 })
  backDuel(duel, { wallet: 'c', seat: 2, amount: SOL / 10n, time: 5 })
  readyDuel(duel, 'vasya', 6)
  readyDuel(duel, 'petya', 7)
  startDuel(duel, { prices: { 'pool-BONK': 100n, 'pool-WIF': 100n }, prevSlot: 1 }, 8)
  resolveDuel(duel, { prices: { 'pool-BONK': 120n, 'pool-WIF': 90n }, prevSlot: 2 }, 70)
  const [win] = duelSettlements(duel)
  const gain = SOL / 10n + SOL / 10n
  assert.equal(win.amount, SOL / 10n + gain - gain / 50n)
})

test('duel: a racer who is not ready in time is kicked with a tax shared with those who stayed', () => {
  const duel = twoRacers()
  joinDuel(duel, { wallet: 'kolya', asset: coin('PEPE') }, 3)
  for (const w of ['vasya', 'petya', 'kolya']) payDuel(duel, { wallet: w, amount: SOL / 10n, time: 4 })
  backDuel(duel, { wallet: 'fan', seat: 3, amount: SOL / 10n, time: 5 })
  // No timer until someone is ready: nobody can be kicked yet.
  assert.deepEqual(duelTimers(duel, 500).kicked, [])
  throwsCode(() => prepareDuel(duel, 'petya', 500), 'NoTimerYet')
  readyDuel(duel, 'vasya', 1000)
  prepareDuel(duel, 'petya', 1050)
  throwsCode(() => prepareDuel(duel, 'petya', 1051), 'AlreadyPrepared')
  readyDuel(duel, 'petya', 1000 + 60 + 15)
  const { transfers, kicked } = duelTimers(duel, 1000 + 61)
  assert.deepEqual(kicked, ['kolya'])
  const of = (w, reason) => transfers.find((t) => t.wallet === w && t.reason === reason)?.amount
  // Backed racer: 20% tax; half to the two who stayed.
  assert.equal(of('kolya', 'kick-refund'), (8n * SOL) / 100n)
  assert.equal(of('fan', 'refund'), SOL / 10n)
  assert.equal(of('vasya', 'tax-share'), SOL / 200n)
  assert.equal(duel.status, 'starting', 'the two left are both ready')
})

test('duel: repeat leavers pay double; a kick below two racers reopens the lobby', () => {
  const duel = twoRacers()
  payDuel(duel, { wallet: 'vasya', amount: SOL / 10n, time: 3 })
  payDuel(duel, { wallet: 'petya', amount: SOL / 10n, time: 3 })
  readyDuel(duel, 'vasya', 10)
  const { transfers } = duelTimers(duel, 10 + 61, (w) => (w === 'petya' ? DUEL.tax.repeatThreshold : 0))
  assert.equal(transfers.find((t) => t.wallet === 'petya').amount, (8n * SOL) / 100n, '10% doubled to 20%')
  assert.equal(duel.status, 'open')
  assert.equal(duel.racers.length, 1)
})

test('duel: before anyone is ready a paid racer may leave with the full stake', () => {
  const duel = twoRacers()
  payDuel(duel, { wallet: 'vasya', amount: SOL / 10n, time: 3 })
  payDuel(duel, { wallet: 'petya', amount: SOL / 10n, time: 3 })
  backDuel(duel, { wallet: 'fan', seat: 2, amount: SOL / 10n, time: 4 })
  const back = leaveDuel(duel, 'petya')
  assert.deepEqual(back.map((t) => [t.wallet, t.amount]), [['petya', SOL / 10n], ['fan', SOL / 10n]])
  assert.equal(duel.status, 'open')
  joinDuel(duel, { wallet: 'kolya', asset: coin('PEPE') }, 5)
  payDuel(duel, { wallet: 'kolya', amount: SOL / 10n, time: 6 })
  readyDuel(duel, 'kolya', 7)
  throwsCode(() => leaveDuel(duel, 'vasya'), 'ReadyCheckRunning')
})

test('duel: unpaid racers leave after the pay window; a top tie refunds everyone', () => {
  const duel = twoRacers()
  duelTimers(duel, 2 + DUEL.payWindow + 1)
  assert.equal(duel.racers.length, 0)
  assert.equal(duel.stake, 0n, 'an empty lobby resets')

  const tie = twoRacers()
  payDuel(tie, { wallet: 'vasya', amount: SOL / 10n, time: 3 })
  payDuel(tie, { wallet: 'petya', amount: SOL / 10n, time: 3 })
  backDuel(tie, { wallet: 'fan', seat: 1, amount: SOL / 10n, time: 4 })
  readyDuel(tie, 'vasya', 5)
  readyDuel(tie, 'petya', 5)
  startDuel(tie, { prices: { 'pool-BONK': 100n, 'pool-WIF': 200n }, prevSlot: 1 }, 6)
  resolveDuel(tie, { prices: { 'pool-BONK': 110n, 'pool-WIF': 220n }, prevSlot: 2 }, 70)
  assert.equal(tie.status, 'void')
  assert.equal(sum(duelSettlements(tie)), (3n * SOL) / 10n)
})

test('duel: crypto, catalog memes, PumpSwap coins and Prophet launches never mix in one lobby', () => {
  const pumpswap = (symbol) => ({ ...coin(symbol), source: 'pumpswap' })
  const ours = (symbol) => ({ ...coin(symbol), source: 'pumpswap', launchedOnProphet: true })
  const lobby = (asset) => {
    const duel = createDuel(0, 0)
    joinDuel(duel, { wallet: 'first', asset, stake: SOL / 10n, duration: 60, unit: 'price' }, 1)
    return duel
  }
  const fresh = lobby(pumpswap('CATE'))
  assert.equal(fresh.category, 'pumpswap')
  assert.equal(fresh.unit, 'cap', 'PumpSwap coins race by market cap, whatever the client asks')
  throwsCode(() => joinDuel(fresh, { wallet: 'b', asset: coin('WIF') }, 2), 'WrongCategory')
  throwsCode(() => joinDuel(fresh, { wallet: 'c', asset: ours('MINE') }, 2), 'WrongCategory')
  joinDuel(fresh, { wallet: 'd', asset: pumpswap('UDR') }, 2)
  const prophet = lobby(ours('MINE'))
  assert.equal(prophet.category, 'prophet')
  assert.equal(prophet.unit, 'cap')
  assert.equal(lobby(coin('SOL', 'crypto')).unit, 'price')
  throwsCode(() => joinDuel(prophet, { wallet: 'e', asset: pumpswap('UDR') }, 2), 'WrongCategory')
  throwsCode(() => joinDuel(lobby(coin('WIF')), { wallet: 'f', asset: pumpswap('UDR') }, 2), 'WrongCategory')
})
