mod common;

use {
    anchor_lang::prelude::Pubkey,
    anchor_spl::{token::ID as TOKEN_PROGRAM, token_2022::ID as TOKEN_2022_PROGRAM},
    common::*,
    price_arena::{instruction as ix, state::*},
    anchor_lang::InstructionData,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const UNIT: u64 = 1_000_000; // one whole token at 6 decimals

fn token_arena_lifecycle(program: Pubkey) {
    let mut h = Harness::new();
    let token = h.create_token(program);
    h.set_stake_mint(token.mint, true, UNIT, 100 * UNIT).unwrap();
    let creator = h.user(10);
    let asset_id = h.asset_id;
    let arena_id = h.create_arena_in(&creator, asset_id, 60, token.mint).unwrap();
    let arena = arena_pda(arena_id);
    assert_eq!((h.arena(arena_id).min_stake, h.arena(arena_id).max_stake), (UNIT, 100 * UNIT));

    let players: Vec<Keypair> = (0..3).map(|_| h.user(1)).collect();
    for player in &players {
        h.fund_token(&token, &player.pubkey(), 100 * UNIT);
    }
    h.enter(arena_id, &players[0], 1_000, 10 * UNIT).unwrap();
    h.enter(arena_id, &players[1], 1_200, 20 * UNIT).unwrap();
    h.enter(arena_id, &players[2], 1_500, 30 * UNIT).unwrap();
    h.update(arena_id, &players[0], 0, 5 * UNIT).unwrap();
    assert_eq!(h.token_balance(&token.ata(&arena)), 65 * UNIT);
    let late = h.user(1);
    h.fund_token(&token, &late.pubkey(), UNIT);
    assert_err(h.enter(arena_id, &late, 1_000, UNIT / 2), "InvalidStake");

    let deadline = h.arena(arena_id).deadline;
    h.set_time(deadline);
    let oracle = h.oracle.insecure_clone();
    h.resolve_with(arena_id, &h.attestation(deadline, 1_000), &oracle).unwrap();
    let state = h.arena(arena_id);
    assert_eq!(state.winner_count, 1);

    // One winner takes the 50 losing tokens minus 2%.
    let losing = 50 * UNIT;
    let fee = losing * 200 / 10_000;
    let winner = h.entry_of(arena_id, &players[0].pubkey());
    assert_eq!(winner.payout, 15 * UNIT + losing - fee);
    h.settle(ix::Claim {}.data(), arena_id, &players[0]).unwrap();
    assert_eq!(h.token_balance(&token.ata(&players[0].pubkey())), 85 * UNIT + winner.payout);
    assert_eq!(h.token_balance(&token.ata(&arena)), 0);

    let treasury = treasury_pda_for(&token.mint);
    let earnings = creator_pda_for(&token.mint, &creator.pubkey());
    assert_eq!(h.token_balance(&token.ata(&treasury)), fee - fee / 2);
    assert_eq!(h.token_balance(&token.ata(&earnings)), fee / 2);

    let admin = h.admin.insecure_clone();
    h.fund_token(&token, &admin.pubkey(), 0);
    let withdraw = h.withdraw_fees_ix(token.mint, fee - fee / 2, &admin.pubkey());
    h.send(&[withdraw], &admin, &[]).unwrap();
    h.fund_token(&token, &creator.pubkey(), 0);
    let withdraw_creator = h.withdraw_creator_ix(token.mint, &creator.pubkey());
    h.send_as(&[withdraw_creator], &creator).unwrap();
    assert_eq!(h.token_balance(&token.ata(&creator.pubkey())), fee / 2);
    assert_eq!(h.token_balance(&token.ata(&admin.pubkey())), fee - fee / 2);
}

#[test]
fn spl_token_arena_lifecycle() {
    token_arena_lifecycle(TOKEN_PROGRAM);
}

#[test]
fn token_2022_arena_lifecycle() {
    token_arena_lifecycle(TOKEN_2022_PROGRAM);
}

#[test]
fn cancelled_token_arena_refunds_tokens() {
    let mut h = Harness::new();
    let token = h.create_token(TOKEN_PROGRAM);
    h.set_stake_mint(token.mint, true, UNIT, 100 * UNIT).unwrap();
    let admin = h.admin.insecure_clone();
    let asset_id = h.asset_id;
    let arena_id = h.create_arena_in(&admin, asset_id, 60, token.mint).unwrap();
    let alice = h.user(1);
    h.fund_token(&token, &alice.pubkey(), 10 * UNIT);
    h.enter(arena_id, &alice, 1_000, 10 * UNIT).unwrap();
    h.set_time(h.arena(arena_id).starts_at);
    h.timeout(ix::CancelIfInsufficient {}.data(), arena_id).unwrap();
    h.settle(ix::Refund {}.data(), arena_id, &alice).unwrap();
    assert_eq!(h.token_balance(&token.ata(&alice.pubkey())), 10 * UNIT);
}

#[test]
fn arena_fees_cannot_be_diverted() {
    let mut h = Harness::new();
    let token = h.create_token(TOKEN_PROGRAM);
    h.set_stake_mint(token.mint, true, UNIT, 100 * UNIT).unwrap();
    let admin = h.admin.insecure_clone();
    let asset_id = h.asset_id;
    let arena_id = h.create_arena_in(&admin, asset_id, 60, token.mint).unwrap();
    let alice = h.user(1);
    let bob = h.user(1);
    h.fund_token(&token, &alice.pubkey(), 10 * UNIT);
    h.fund_token(&token, &bob.pubkey(), 10 * UNIT);
    h.enter(arena_id, &alice, 1_000, 10 * UNIT).unwrap();
    h.enter(arena_id, &bob, 2_000, 10 * UNIT).unwrap();
    let deadline = h.arena(arena_id).deadline;
    h.set_time(deadline);
    let oracle = h.oracle.insecure_clone();
    let thief = h.user(1);
    h.fund_token(&token, &thief.pubkey(), 0);
    let attestation = h.attestation(deadline, 1_000);
    let ixs = [ed25519_ix(&oracle, &encode(&attestation)), h.resolve_ix_with(arena_id, Some(token.ata(&thief.pubkey())))];
    assert_err(h.send(&ixs, &admin, &[]), "WrongVault");
    h.resolve_with(arena_id, &attestation, &oracle).unwrap();
    assert_eq!(h.arena(arena_id).status, ArenaStatus::Resolved);
}
