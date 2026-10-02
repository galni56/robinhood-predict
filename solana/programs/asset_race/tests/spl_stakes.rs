mod common;

use {
    anchor_lang::prelude::Pubkey,
    anchor_spl::{token::ID as TOKEN_PROGRAM, token_2022::ID as TOKEN_2022_PROGRAM},
    asset_race::{state::*, NATIVE_SOL},
    common::*,
    solana_signer::Signer,
};

const UNIT: u64 = 1_000_000; // one whole token at 6 decimals

/// Full lifecycle with token stakes under `program`; returns the fee charged.
fn token_race_lifecycle(program: Pubkey) {
    let mut h = Harness::new();
    let token = h.create_token(program);
    h.set_stake_mint(token.mint, true, UNIT, 1_000 * UNIT).unwrap();

    let mut input = h.default_platform_input();
    input.stake_mint = token.mint;
    input.min_stake = UNIT;
    input.max_stake_per_wallet = 1_000 * UNIT;
    let betting_end = input.betting_end_time;
    let race_id = h.create_platform_race(input, 2).unwrap();
    let race = race_pda(race_id);
    assert_eq!(h.race(race_id).stake_mint, token.mint);
    assert_eq!(h.token_balance(&token.ata(&race)), 0);

    let alice = h.user(1);
    let bob = h.user(1);
    h.fund_token(&token, &alice.pubkey(), 500 * UNIT);
    h.fund_token(&token, &bob.pubkey(), 500 * UNIT);
    let alice_sol = h.balance(&alice.pubkey());
    h.bet(race_id, &alice, 0, 100 * UNIT).unwrap();
    h.bet(race_id, &bob, 1, 300 * UNIT).unwrap();
    assert_eq!(h.token_balance(&token.ata(&race)), 400 * UNIT);
    assert_eq!(h.token_balance(&token.ata(&alice.pubkey())), 400 * UNIT);
    // Only the position rent and fee were paid in SOL; the stake moved as tokens.
    assert!(alice_sol - h.balance(&alice.pubkey()) < SOL / 100);

    let oracle = h.oracle.insecure_clone();
    h.set_time(betting_end + 1);
    h.start_with(race_id, &h.attestation(betting_end, &[(0, 100), (1, 100)]), &oracle).unwrap();
    let race_end = h.race(race_id).race_end_time;
    h.set_time(race_end + 1);
    h.resolve_with(race_id, &h.attestation(race_end, &[(0, 150), (1, 90)]), &oracle).unwrap();
    assert_eq!(h.race(race_id).winning_asset_index, 0);

    // Bob's 300 lost: 2% fee = 6 tokens, 3 to the creator vault, 3 to the treasury vault.
    let fee = 300 * UNIT * 200 / 10_000;
    let treasury = treasury_pda_for(&token.mint);
    let earnings = creator_pda_for(&token.mint, &h.admin.pubkey());
    assert_eq!(h.token_balance(&token.ata(&treasury)), fee / 2);
    assert_eq!(h.token_balance(&token.ata(&earnings)), fee / 2);

    h.claim(race_id, &alice).unwrap();
    assert_eq!(h.token_balance(&token.ata(&alice.pubkey())), 400 * UNIT + 100 * UNIT + (300 * UNIT - fee));
    assert_eq!(h.token_balance(&token.ata(&race)), 0);
    assert_err(h.claim(race_id, &bob), "NoWinningPosition");

    // Protocol and creator withdraw their token fees.
    let admin = h.admin.insecure_clone();
    h.fund_token(&token, &admin.pubkey(), 0);
    let withdraw = h.withdraw_fees_ix(token.mint, fee / 2, &admin.pubkey(), &admin.pubkey());
    h.send(&[withdraw], &admin, &[]).unwrap();
    let withdraw_creator = h.withdraw_creator_ix(token.mint, &admin.pubkey());
    h.send(&[withdraw_creator], &admin, &[]).unwrap();
    assert_eq!(h.token_balance(&token.ata(&admin.pubkey())), fee);
    assert_eq!(h.token_balance(&token.ata(&treasury)), 0);
    assert_eq!(h.token_balance(&token.ata(&earnings)), 0);

    // SOL accounting is untouched by the token race.
    let sol_treasury: Treasury = h.fetch(&treasury_pda());
    assert_eq!(sol_treasury.accumulated_fees, 0);
}

#[test]
fn spl_token_race_lifecycle() {
    token_race_lifecycle(TOKEN_PROGRAM);
}

#[test]
fn token_2022_race_lifecycle() {
    token_race_lifecycle(TOKEN_2022_PROGRAM);
}

#[test]
fn fees_cannot_be_diverted_to_another_token_account() {
    let mut h = Harness::new();
    let token = h.create_token(TOKEN_PROGRAM);
    h.set_stake_mint(token.mint, true, UNIT, 1_000 * UNIT).unwrap();
    let mut input = h.default_platform_input();
    input.stake_mint = token.mint;
    input.min_stake = UNIT;
    input.max_stake_per_wallet = 1_000 * UNIT;
    let betting_end = input.betting_end_time;
    let race_id = h.create_platform_race(input, 2).unwrap();
    let alice = h.user(1);
    let bob = h.user(1);
    h.fund_token(&token, &alice.pubkey(), 100 * UNIT);
    h.fund_token(&token, &bob.pubkey(), 100 * UNIT);
    h.bet(race_id, &alice, 0, 100 * UNIT).unwrap();
    h.bet(race_id, &bob, 1, 100 * UNIT).unwrap();

    let oracle = h.oracle.insecure_clone();
    h.set_time(betting_end + 1);
    h.start_with(race_id, &h.attestation(betting_end, &[(0, 100), (1, 100)]), &oracle).unwrap();
    let race_end = h.race(race_id).race_end_time;
    h.set_time(race_end + 1);

    let attestation = h.attestation(race_end, &[(0, 150), (1, 90)]);
    let thief = h.user(1);
    h.fund_token(&token, &thief.pubkey(), 0);
    let ixs = [
        ed25519_ix(&oracle, &encode(&attestation)),
        h.resolve_ix_with(race_id, Some(token.ata(&thief.pubkey()))),
    ];
    let admin = h.admin.insecure_clone();
    assert_err(h.send(&ixs, &admin, &[]), "WrongVault");
    assert_eq!(h.token_balance(&token.ata(&thief.pubkey())), 0);

    h.resolve_with(race_id, &attestation, &oracle).unwrap();
    assert_eq!(h.race(race_id).status, RaceStatus::Resolved);
}

#[test]
fn stake_mint_must_be_accepted_and_enabled() {
    let mut h = Harness::new();
    let token = h.create_token(TOKEN_PROGRAM);

    // Not accepted yet: its config account does not exist.
    let mut input = h.default_platform_input();
    input.stake_mint = token.mint;
    assert!(h.create_platform_race(input.clone(), 2).is_err());

    h.set_stake_mint(token.mint, true, UNIT, 10 * UNIT).unwrap();
    h.set_stake_mint(token.mint, false, UNIT, 10 * UNIT).unwrap();
    assert_err(h.create_platform_race(input.clone(), 2).map(|_| ()), "UnsupportedStakeMint");

    // Disabling SOL blocks new SOL races too.
    h.set_stake_mint(NATIVE_SOL, false, MIN_STAKE, MAX_STAKE).unwrap();
    let input = h.default_platform_input();
    assert_err(h.create_platform_race(input, 2).map(|_| ()), "UnsupportedStakeMint");

    // Limits are validated.
    assert_err(h.set_stake_mint(token.mint, true, 0, UNIT), "InvalidConfiguration");
    assert_err(h.set_stake_mint(token.mint, true, 2 * UNIT, UNIT), "InvalidConfiguration");
}

#[test]
fn token_race_needs_token_accounts() {
    let mut h = Harness::new();
    let token = h.create_token(TOKEN_PROGRAM);
    h.set_stake_mint(token.mint, true, UNIT, 1_000 * UNIT).unwrap();
    let mut input = h.default_platform_input();
    input.stake_mint = token.mint;
    input.min_stake = UNIT;
    input.max_stake_per_wallet = 1_000 * UNIT;
    let race_id = h.create_platform_race(input, 2).unwrap();

    // A bet that omits the token accounts must not fall back to SOL.
    let alice = h.user(10);
    h.tokens.clear();
    assert_err(h.bet(race_id, &alice, 0, 10 * UNIT), "MissingTokenAccounts");
    assert_eq!(h.race(race_id).total_pool, 0);
}

#[test]
fn community_token_race_uses_stake_mint_limits() {
    let mut h = Harness::new();
    let admin = h.admin.insecure_clone();
    let token = h.create_token(TOKEN_PROGRAM);
    h.set_stake_mint(token.mint, true, 5 * UNIT, 50 * UNIT).unwrap();
    let policy = asset_race::CommunityPolicy {
        lobby_duration: 300,
        betting_duration: 600,
        start_grace: 300,
        resolution_grace: 300,
        fee_bp: 200,
        min_active_contenders: 2,
    };
    h.send(&[h.admin_config_ix(asset_race::instruction::SetCommunityPolicy { policy }.data(), &admin.pubkey())], &admin, &[])
        .unwrap();
    h.send(
        &[h.admin_config_ix(
            asset_race::instruction::SetDurationPreset { duration: 3_600, enabled: true }.data(),
            &admin.pubkey(),
        )],
        &admin,
        &[],
    )
    .unwrap();
    let creator = h.user(10);
    let create = h.create_community_ix(0, &creator.pubkey(), 3_600, token.mint, &[0, 1]);
    h.send_as(&[create], &creator).unwrap();
    let race = h.race(0);
    assert_eq!((race.min_stake, race.max_stake_per_wallet), (5 * UNIT, 50 * UNIT));
    assert_eq!(h.token_balance(&token.ata(&race_pda(0))), 0);
}

use anchor_lang::InstructionData;
