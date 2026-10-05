// node --test scripts/solana/game-server/*.test.mjs
// The engine against an in-memory chain: stakes, refunds, the full race and
// arena lifecycle, payouts, and what happens when a payout is lost or the
// server restarts mid-payout.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { openDatabase } from './db.mjs'
import { createEngine } from './engine.mjs'
import { base58 } from './chain.mjs'
import { arenaMemo, raceMemo } from './rules.mjs'

const SOL = 1_000_000_000n
const GAME = 'GameWa11et1111111111111111111111111111111111'
const COLD = 'Co1dWa11et111111111111111111111111111111111'
const ASSETS = ['SOL', 'BTC', 'ETH'].map((symbol) => ({ symbol, category: 'crypto', priceSource: `pool-${symbol}`, priceDecimals: 8, enabled: true }))
const quiet = { log() {}, warn() {} }

function fakeChain() {
  let n = 0
  let height = 1_000
  let balance = 0n
  const txs = new Map()
  const order = []
  const landed = new Set()
  const record = (signature, tx) => {
    txs.set(signature, { slot: ++n, blockTime: 0, failed: false, inbound: [], outbound: [], memos: [], innerInbound: [], balanceDelta: 0n, ...tx })
    order.unshift({ signature })
  }
  const chain = {
    address: GAME,
    dropBroadcasts: false,
    paid: [],
    /** A player's transfer to the game wallet (optionally with a memo). */
    deposit(from, lamports, memo, blockTime) {
      const signature = `dep-${n + 1}`
      record(signature, { blockTime, inbound: [{ from, lamports, signed: true }], memos: memo ? [memo] : [], balanceDelta: lamports })
      balance += lamports
      return signature
    },
    /** One transaction carrying several inbound transfers (no memo). */
    depositRaw(inbound, blockTime = 1) {
      const signature = `dep-${n + 1}`
      const total = inbound.reduce((sum, t) => sum + t.lamports, 0n)
      record(signature, { blockTime, inbound, memos: [], balanceDelta: total })
      balance += total
      return signature
    },
    advanceBlocks(k) {
      height += k
    },
    balance: async () => balance,
    blockHeight: async () => height,
    readTransaction: async (signature) => txs.get(signature) ?? null,
    async signatures(before) {
      const from = before ? order.findIndex((x) => x.signature === before) + 1 : 0
      return order.slice(from, from + 1000)
    },
    async preparePayout({ to, lamports }) {
      const signature = `pay-${n + 1}-${to}`
      n++
      return { signature, lastValidBlockHeight: height + 150, serialized: JSON.stringify({ signature, to, lamports: lamports.toString() }) }
    },
    async broadcast(serialized) {
      if (chain.dropBroadcasts) throw new Error('dropped')
      const { signature, to, lamports } = JSON.parse(serialized)
      if (landed.has(signature)) return signature
      landed.add(signature)
      balance -= BigInt(lamports) + 5_000n
      chain.paid.push({ to, lamports: BigInt(lamports) })
      record(signature, { outbound: [{ to, lamports: BigInt(lamports) }] })
      return signature
    },
    /** Simulates a lagging / history-less RPC node: status lookups miss. */
    statusesBlind: false,
    /** Commitment the fake cluster reports for landed transactions. */
    commitment: 'finalized',
    statuses: async (signatures) => signatures.map((x) => (!chain.statusesBlind && landed.has(x) ? { confirmationStatus: chain.commitment, err: null } : null)),
    finalizedBlockHeight: async () => height,
    finalizedTransaction: async (signature) => (landed.has(signature) ? { err: null } : null),
  }
  return chain
}

function fakePrices(table) {
  return {
    async boundary(target, sources) {
      const prices = {}
      const decimals = {}
      for (const s of sources) {
        prices[s] = table[target][s]
        decimals[s] = 8
      }
      return { prevSlot: 7, prevBlockTime: target - 1, prices, decimals, attestation: { message: 'm', instruction: 'i' } }
    },
  }
}

function setup(priceTable, { clockStart = 10_000, dbPath = ':memory:', db, adoptWallet = false } = {}) {
  const clock = { t: clockStart }
  const chain = fakeChain()
  const database = db ?? openDatabase(dbPath)
  const engine = createEngine({ db: database, chain, prices: fakePrices(priceTable), assets: ASSETS, cluster: 'localnet', coldWallet: COLD, adoptWallet, clock: () => clock.t, log: quiet, options: { sweepEverySeconds: 0, sweepMin: SOL / 100n, settleDelay: 6 } })
  return { clock, chain, db: database, engine }
}

const paidTo = (chain, wallet) => chain.paid.filter((p) => p.to === wallet).reduce((sum, p) => sum + p.lamports, 0n)

test('race: stakes become bets, bad deposits are refunded, winners are paid once', async () => {
  const t0 = 10_000
  const { clock, chain, db, engine } = setup({
    [t0 + 120]: { 'pool-SOL': 100n, 'pool-BTC': 200n, 'pool-ETH': 300n },
    [t0 + 420]: { 'pool-SOL': 110n, 'pool-BTC': 200n, 'pool-ETH': 290n },
  })
  await engine.init()
  const race = engine.createPlatform({ title: 'Majors', category: 'crypto', symbols: ['SOL', 'BTC', 'ETH'], bettingStartTime: t0, bettingEndTime: t0 + 120, raceDuration: 300 })

  chain.deposit('alice', SOL / 10n, raceMemo(race.id, 0), t0 + 10)
  const bob = chain.deposit('bob', SOL / 5n, raceMemo(race.id, 1), t0 + 20)
  chain.deposit('carol', (3n * SOL) / 10n, raceMemo(race.id, 2), t0 + 30)
  chain.deposit('dave', SOL / 10n, raceMemo(race.id, 0), t0 + 125) // after the cutoff
  chain.deposit('erin', SOL / 10n, null, t0 + 40) // no memo
  chain.deposit('frank', 1_000n, null, t0 + 40) // dust
  chain.deposit(COLD, SOL / 20n, null, t0 + 41) // fee money from the owner

  // The fast path (the API) and the scanner see the same signature: applied once.
  const first = await engine.ingest(bob)
  assert.equal(first.status, 'accepted')
  await engine.tick()
  assert.equal((await engine.ingest(bob)).status, 'accepted')
  let state = db.getGame('race', race.id)
  assert.equal(state.totalPool, (6n * SOL) / 10n)
  assert.equal(state.positions.length, 3)
  // Refunds carry their own network fee (5000 lamports).
  assert.equal(paidTo(chain, 'dave'), SOL / 10n - 5_000n, 'late bet refunded')
  assert.equal(paidTo(chain, 'erin'), SOL / 10n - 5_000n, 'memo-less transfer refunded')
  assert.equal(paidTo(chain, 'frank'), 0n, 'dust is kept')
  assert.equal(paidTo(chain, COLD), 0n, 'funding is not refunded')

  clock.t = t0 + 120 + 3
  await engine.tick()
  assert.equal(db.getGame('race', race.id).status, 'betting', 'waits for late confirmations')
  clock.t = t0 + 130
  await engine.tick()
  state = db.getGame('race', race.id)
  assert.equal(state.status, 'running')
  assert.equal(state.assets[0].startPrice, 100n)

  clock.t = t0 + 425
  await engine.tick() // resolve and send
  await engine.tick() // confirm
  state = db.getGame('race', race.id)
  assert.equal(state.status, 'resolved')
  // losing pool 0.5 SOL, fee 2% -> alice gets 0.1 + 0.49
  assert.equal(paidTo(chain, 'alice'), (59n * SOL) / 100n)
  assert.equal(paidTo(chain, 'bob'), 0n)
  assert.equal(db.payouts('pending').length + db.payouts('sent').length, 0)

  // Nothing left owed; the fee is surplus and goes to the cold wallet.
  clock.t += 10
  await engine.tick()
  await engine.tick()
  assert.equal(engine.liabilities(), 0n)
  assert.ok(paidTo(chain, COLD) > 0n)
})

test('payouts: a lost send is rebuilt after expiry; a restart never pays twice', async () => {
  const t0 = 10_000
  const prices = {
    [t0 + 60]: { 'pool-SOL': 100n, 'pool-BTC': 100n },
    [t0 + 120]: { 'pool-SOL': 100n, 'pool-BTC': 120n },
  }
  const { clock, chain, db, engine } = setup(prices)
  await engine.init()
  const race = engine.createPlatform({ title: 'Duel', category: 'crypto', symbols: ['SOL', 'BTC'], bettingStartTime: t0, bettingEndTime: t0 + 60, raceDuration: 60 })
  chain.deposit('alice', SOL / 10n, raceMemo(race.id, 0), t0 + 1)
  chain.deposit('bob', SOL / 10n, raceMemo(race.id, 1), t0 + 2)
  await engine.tick()
  clock.t = t0 + 70
  await engine.tick()
  clock.t = t0 + 125

  chain.dropBroadcasts = true
  await engine.tick() // resolves, signs, the send is lost
  assert.equal(db.payouts('sent').length, 1)
  assert.equal(paidTo(chain, 'bob'), 0n)
  await engine.tick() // still within the blockhash lifetime: rebroadcast only
  assert.equal(db.payouts('sent').length, 1)

  chain.dropBroadcasts = false
  chain.advanceBlocks(151) // the lost transaction's blockhash expired
  await engine.tick() // back to pending, re-signed, sent
  await engine.tick() // confirmed
  assert.equal(paidTo(chain, 'bob'), SOL / 10n + SOL / 10n - (SOL / 10n) * 200n / 10_000n)
  assert.equal(db.payouts('done').length, 1)

  // A second engine on the same database (a restart) finds nothing to pay.
  const again = createEngine({ db, chain, prices: fakePrices(prices), assets: ASSETS, cluster: 'localnet', clock: () => clock.t, log: quiet })
  await again.tick()
  assert.equal(chain.paid.filter((p) => p.to === 'bob').length, 1)
})

test('payouts: a crash after the send but before the confirmation is recovered without a second transfer', async () => {
  const t0 = 10_000
  const prices = { [t0 + 60]: { 'pool-SOL': 1n, 'pool-BTC': 1n }, [t0 + 120]: { 'pool-SOL': 2n, 'pool-BTC': 1n } }
  const { clock, chain, db, engine } = setup(prices)
  await engine.init()
  const race = engine.createPlatform({ title: 'Duel', category: 'crypto', symbols: ['SOL', 'BTC'], bettingStartTime: t0, bettingEndTime: t0 + 60, raceDuration: 60 })
  chain.deposit('alice', SOL / 10n, raceMemo(race.id, 0), t0 + 1)
  chain.deposit('bob', SOL / 10n, raceMemo(race.id, 1), t0 + 2)
  await engine.tick()
  clock.t = t0 + 70
  await engine.tick()
  clock.t = t0 + 125
  await engine.tick() // the transfer lands, the process "dies" before checking it
  assert.equal(db.payouts('sent').length, 1)
  chain.advanceBlocks(500) // long after: the blockhash expired, but the transfer landed
  const restarted = createEngine({ db, chain, prices: fakePrices(prices), assets: ASSETS, cluster: 'localnet', clock: () => clock.t, log: quiet })
  await restarted.tick()
  await restarted.tick()
  assert.equal(chain.paid.filter((p) => p.to === 'alice').length, 1)
  assert.equal(db.payouts('done').length, 1)
})

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
  const address = base58(raw)
  return {
    address,
    signed(clock, fields) {
      const message = `Prophet\n${JSON.stringify({ ...fields, wallet: address, cluster: 'localnet', issuedAt: clock.t })}`
      return { message, signature: sign(null, Buffer.from(message), privateKey).toString('base64') }
    },
  }
}

test('arena: signed creation, entries by transfer, prediction change, creator paid', async () => {
  const t0 = 10_000
  const { clock, chain, db, engine } = setup({ [t0 + 600 + 60]: { 'pool-SOL': 1_050n } })
  await engine.init()
  const creator = wallet()
  const created = engine.act(creator.signed(clock, { action: 'create-arena', title: 'SOL close', asset: 'SOL', duration: 60 }))
  const replay = creator.signed(clock, { action: 'create-arena', title: 'Again', asset: 'SOL', duration: 60 })
  engine.act(replay)
  assert.throws(() => engine.act(replay), /MessageReused/)
  // The same signature in a different base64 spelling is still a replay.
  const bytes = Buffer.from(replay.signature, 'base64')
  for (const respelled of [bytes.toString('base64url'), bytes.toString('base64').replace(/=+$/, ''), ` ${replay.signature}`]) {
    assert.throws(() => engine.act({ ...replay, signature: respelled }), /MessageReused|BadSignature/)
  }
  assert.throws(() => engine.act({ ...creator.signed(clock, { action: 'create-arena', title: 'x', asset: 'SOL', duration: 60 }), signature: replay.signature }), /BadSignature/)

  const players = ['p1', 'p2', 'p3', 'p4']
  const predictions = [1_000n, 1_200n, 900n, 1_500n]
  players.forEach((p, i) => chain.deposit(p, SOL / 10n, arenaMemo(created.id, predictions[i]), t0 + 10 + i))
  await engine.tick()
  assert.equal(db.getGame('arena', created.id).entries.length, 4)

  const mover = wallet()
  chain.deposit(mover.address, SOL / 10n, arenaMemo(created.id, 2_000n), t0 + 20)
  await engine.tick()
  engine.act(mover.signed(clock, { action: 'change-prediction', arena: created.id, prediction: '1060' }))
  assert.equal(db.getGame('arena', created.id).entries[4].prediction, 1_060n)

  clock.t = t0 + 600 + 60 + 7
  await engine.tick()
  await engine.tick()
  const arena = db.getGame('arena', created.id)
  assert.equal(arena.status, 'resolved')
  assert.equal(arena.winnerCount, 2)
  const winners = arena.entries.filter((e) => e.payout > 0n).map((e) => e.player).sort()
  assert.deepEqual(winners, [mover.address, 'p1'].sort())
  assert.equal(paidTo(chain, mover.address) + paidTo(chain, 'p1'), arena.entries.reduce((s, e) => s + e.payout, 0n))
  assert.equal(paidTo(chain, creator.address), arena.creatorFee, 'creator fee paid')
  // The second arena got no players and was cancelled at its lobby end with nothing to pay.
  assert.equal(db.getGame('arena', 1).status, 'cancelled')
})

test('first start records the wallet history instead of refunding it', async () => {
  const { chain, db, engine } = setup({}, { adoptWallet: true })
  chain.deposit('someone', SOL, null, 1)
  await engine.init()
  await engine.tick()
  assert.equal(chain.paid.length, 0)
  assert.equal(db.getDeposit('dep-1').status, 'preexisting')
})

test('a new database next to a wallet with history refuses to start unless adopted', async () => {
  const { chain, engine } = setup({})
  chain.deposit('someone', SOL, null, 1)
  await assert.rejects(engine.init(), /ADOPT_WALLET=1/)
  assert.equal(chain.paid.length, 0)
})

test('duel: empty lobbies, signed joins, stakes and backing by transfer, ready, payouts', async () => {
  const { clock, chain, db, engine } = setup({})
  const prices = {}
  engine._setPrices?.(prices)
  await engine.init()
  await engine.tick()
  const lobbies = db.games('duel')
  assert.equal(lobbies.length, 10, 'ten empty lobbies wait for racers')
  const id = lobbies[0].id
  const vasya = wallet()
  const petya = wallet()
  engine.act(vasya.signed(clock, { action: 'duel-join', duel: id, asset: 'SOL', stake: String(SOL / 10n), duration: 300, unit: 'price' }))
  engine.act(petya.signed(clock, { action: 'duel-join', duel: id, asset: 'BTC' }))
  chain.deposit(vasya.address, SOL / 10n, `prophet:duel:${id}:0`, clock.t + 1)
  chain.deposit(petya.address, SOL / 10n, `prophet:duel:${id}:0`, clock.t + 1)
  chain.deposit('fan', SOL / 5n, `prophet:duel:${id}:2`, clock.t + 2)
  chain.deposit('late', SOL / 10n, `prophet:duel:${id}:9`, clock.t + 2) // no such seat: refunded
  await engine.tick()
  let duel = db.getGame('duel', id)
  assert.equal(duel.status, 'ready')
  assert.equal(duel.backers.length, 1)
  assert.equal(db.games('duel').filter((d) => d.racers.length === 0).length, 10, 'a used lobby is replaced')
  clock.t += 5
  engine.act(vasya.signed(clock, { action: 'duel-ready', duel: id }))
  engine.act(petya.signed(clock, { action: 'duel-ready', duel: id }))
  duel = db.getGame('duel', id)
  assert.equal(duel.status, 'starting')
  assert.equal(engine.cheer(id, 1), 1)
  return { clock, chain, db, engine, id, duel }
})

test('duel: start and finish on boundary prices, the winner and his backers are paid', async () => {
  const table = {}
  const { clock, chain, db, engine } = setup(table)
  await engine.init()
  await engine.tick()
  const id = db.games('duel')[0].id
  const vasya = wallet()
  const petya = wallet()
  engine.act(vasya.signed(clock, { action: 'duel-join', duel: id, asset: 'SOL', stake: String(SOL / 10n), duration: 300 }))
  engine.act(petya.signed(clock, { action: 'duel-join', duel: id, asset: 'BTC' }))
  chain.deposit(vasya.address, SOL / 10n, `prophet:duel:${id}:0`, clock.t + 1)
  chain.deposit(petya.address, SOL / 10n, `prophet:duel:${id}:0`, clock.t + 1)
  chain.deposit('fan', SOL / 5n, `prophet:duel:${id}:2`, clock.t + 2)
  chain.deposit('other', SOL / 10n, `prophet:duel:${id}:1`, clock.t + 2)
  await engine.tick()
  clock.t += 5
  engine.act(vasya.signed(clock, { action: 'duel-ready', duel: id }))
  engine.act(petya.signed(clock, { action: 'duel-ready', duel: id }))
  const start = db.getGame('duel', id).startTime
  table[start] = { 'pool-SOL': 100n, 'pool-BTC': 100n }
  table[start + 300] = { 'pool-SOL': 101n, 'pool-BTC': 105n }
  clock.t = start + 3
  await engine.tick()
  assert.equal(db.getGame('duel', id).status, 'running')
  clock.t = start + 307
  await engine.tick()
  await engine.tick()
  const duel = db.getGame('duel', id)
  assert.equal(duel.status, 'resolved')
  assert.equal(duel.winnerSeat, 2)
  // Petya: 0.1 + 0.1 + 30% of 0.1 = 0.23, minus 2% of the 0.13 gain.
  assert.equal(paidTo(chain, petya.address), (23n * SOL) / 100n - ((13n * SOL) / 100n) / 50n)
  // fan: 0.2 + 70% of 0.1, minus 2% of the 0.07 gain.
  assert.equal(paidTo(chain, 'fan'), (27n * SOL) / 100n - ((7n * SOL) / 100n) / 50n)
  assert.equal(paidTo(chain, vasya.address) + paidTo(chain, 'other'), 0n)
  assert.equal(db.payouts('pending').length + db.payouts('sent').length, 0)
})

test('payouts: a landed payout the status lookup misses is never sent twice', async () => {
  const t0 = 10_000
  const prices = { [t0 + 60]: { 'pool-SOL': 100n, 'pool-BTC': 100n }, [t0 + 120]: { 'pool-SOL': 100n, 'pool-BTC': 120n } }
  const { clock, chain, db, engine } = setup(prices)
  await engine.init()
  const race = engine.createPlatform({ title: 'Duel', category: 'crypto', symbols: ['SOL', 'BTC'], bettingStartTime: t0, bettingEndTime: t0 + 60, raceDuration: 60 })
  chain.deposit('alice', SOL / 10n, raceMemo(race.id, 0), t0 + 1)
  chain.deposit('bob', SOL / 10n, raceMemo(race.id, 1), t0 + 2)
  await engine.tick()
  clock.t = t0 + 70
  await engine.tick()
  clock.t = t0 + 125

  // The payout lands, but this RPC node never reports it (lagging replica,
  // or a restart after the status cache rolled over).
  chain.statusesBlind = true
  await engine.tick() // resolves and sends; the transfer lands
  assert.equal(paidTo(chain, 'bob') > 0n, true)
  chain.advanceBlocks(151) // blockhash expired, status still "unseen"
  await engine.tick()
  await engine.tick()
  assert.equal(chain.paid.filter((p) => p.to === 'bob').length, 1, 'bob must be paid exactly once')
  assert.equal(db.payouts('done').length, 1)
})

test('payouts: a confirmed-but-not-final payout is not marked done', async () => {
  const t0 = 10_000
  const prices = { [t0 + 60]: { 'pool-SOL': 100n, 'pool-BTC': 100n }, [t0 + 120]: { 'pool-SOL': 100n, 'pool-BTC': 120n } }
  const { clock, chain, db, engine } = setup(prices)
  await engine.init()
  const race = engine.createPlatform({ title: 'Duel', category: 'crypto', symbols: ['SOL', 'BTC'], bettingStartTime: t0, bettingEndTime: t0 + 60, raceDuration: 60 })
  chain.deposit('alice', SOL / 10n, raceMemo(race.id, 0), t0 + 1)
  chain.deposit('bob', SOL / 10n, raceMemo(race.id, 1), t0 + 2)
  await engine.tick()
  clock.t = t0 + 80
  await engine.tick()
  clock.t = t0 + 140
  chain.commitment = 'confirmed'
  await engine.tick()
  await engine.tick()
  assert.equal(db.payouts('done').length, 0, 'confirmed is not final')
  assert.equal(db.payouts('sent').length, 1)
  chain.commitment = 'finalized'
  await engine.tick()
  assert.equal(db.payouts('done').length, 1)
  assert.equal(chain.paid.filter((p) => p.to === 'bob').length, 1)
})

test('refunds: many transfers in one transaction cost one refund, fee included', async () => {
  const { chain, engine } = setup({})
  await engine.init()
  chain.deposit(COLD, SOL, null, 1) // owner funding: rent and fee reserve
  // One tx, ten 0.002 SOL transfers from the same sender, no memo.
  const inbound = Array.from({ length: 10 }, () => ({ from: 'spammer', lamports: SOL / 500n, signed: true }))
  chain.depositRaw(inbound)
  await engine.tick()
  await engine.tick()
  const refunds = chain.paid.filter((p) => p.to === 'spammer')
  assert.equal(refunds.length, 1, 'one refund for the whole transaction')
  assert.equal(refunds[0].lamports, (SOL / 500n) * 10n - 5_000n)
})
