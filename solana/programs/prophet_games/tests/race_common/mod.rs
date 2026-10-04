#![allow(dead_code)]

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{
            bpf_loader_upgradeable,
            instruction::{AccountMeta, Instruction},
            program_pack::Pack,
            system_instruction, system_program,
        },
        AccountDeserialize, AnchorSerialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{
            get_associated_token_address_with_program_id, spl_associated_token_account::instruction as ata_ix,
        },
        token_2022::spl_token_2022::{instruction as token_ix, state::Mint as MintState},
        token_interface::TokenAccount,
    },
    prophet_games::{
        accounts as acc,
        attestation::{PoolAttestation, PriceEntry},
        constants::*,
        instruction as ix,
        state::*,
        PlatformRaceInput,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const SOL: u64 = 1_000_000_000;
pub const START_TIME: i64 = 1_800_000_000;
pub const DECIMALS: u8 = 9;
/// Default stake limits for every accepted currency in tests.
pub const MIN_STAKE: u64 = SOL / 100;
pub const MAX_STAKE: u64 = SOL;
pub const TOKEN_DECIMALS: u8 = 6;

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &prophet_games::ID).0
}

pub fn stake_mint_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[STAKE_MINT_SEED, mint.as_ref()], &prophet_games::ID).0
}

pub fn treasury_pda_for(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[TREASURY_SEED, mint.as_ref()], &prophet_games::ID).0
}

pub fn treasury_pda() -> Pubkey {
    treasury_pda_for(&NATIVE_SOL)
}

pub fn asset_pda(asset_id: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[ASSET_SEED, asset_id.as_ref()], &prophet_games::ID).0
}

pub fn race_pda(race_id: u64) -> Pubkey {
    Pubkey::find_program_address(&[RACE_SEED, race_id.to_le_bytes().as_ref()], &prophet_games::ID).0
}

pub fn position_pda(race: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[POSITION_SEED, race.as_ref(), owner.as_ref()], &prophet_games::ID).0
}

pub fn creator_pda_for(mint: &Pubkey, creator: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[CREATOR_SEED, mint.as_ref(), creator.as_ref()], &prophet_games::ID).0
}

pub fn creator_pda(creator: &Pubkey) -> Pubkey {
    creator_pda_for(&NATIVE_SOL, creator)
}

pub fn program_data_pda() -> Pubkey {
    Pubkey::find_program_address(&[prophet_games::ID.as_ref()], &bpf_loader_upgradeable::ID).0
}

#[derive(Clone)]
pub struct TestAsset {
    pub id: [u8; 32],
    pub source: Pubkey,
}

pub fn test_asset(n: u8) -> TestAsset {
    TestAsset { id: [n; 32], source: Pubkey::new_unique() }
}

/// An SPL mint created in the test VM.
#[derive(Clone, Copy)]
pub struct Token {
    pub mint: Pubkey,
    pub program: Pubkey,
}

impl Token {
    pub fn ata(&self, owner: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(owner, &self.mint, &self.program)
    }
}

pub struct Harness {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub oracle: Keypair,
    pub assets: Vec<TestAsset>,
    pub tokens: Vec<Token>,
}

impl Harness {
    /// Deploys the program with `admin` as upgrade authority. Does not initialize.
    pub fn deploy() -> Self {
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/prophet_games.so"));
        svm.add_program(prophet_games::ID, bytes).unwrap();

        let admin = Keypair::new();
        svm.airdrop(&admin.pubkey(), 1_000 * SOL).unwrap();

        // LiteSVM deploys with no upgrade authority. Patch the ProgramData
        // header (bincode: u32 tag, u64 slot, Option<Pubkey>) to name `admin`.
        let program_data = program_data_pda();
        let mut account = svm.get_account(&program_data).unwrap();
        account.data[12] = 1;
        account.data[13..45].copy_from_slice(admin.pubkey().as_ref());
        svm.set_account(program_data, account).unwrap();

        let mut harness = Harness {
            svm,
            admin,
            oracle: Keypair::new(),
            assets: (1..=4).map(test_asset).collect(),
            tokens: Vec::new(),
        };
        harness.set_time(START_TIME);
        harness
    }

    /// Deploys, initializes, accepts native SOL and approves four Stock assets.
    pub fn new() -> Self {
        let mut h = Self::deploy();
        let admin = h.admin.insecure_clone();
        h.send(&[h.initialize_ix(&admin.pubkey())], &admin, &[]).unwrap();
        h.set_stake_mint(NATIVE_SOL, true, MIN_STAKE, MAX_STAKE).unwrap();
        for asset in h.assets.clone() {
            h.approve_asset(&asset, Category::Stock, true).unwrap();
        }
        h
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn set_time(&mut self, unix_timestamp: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = unix_timestamp;
        clock.slot += 1;
        self.svm.set_sysvar(&clock);
    }

    pub fn user(&mut self, sol: u64) -> Keypair {
        let user = Keypair::new();
        self.svm.airdrop(&user.pubkey(), sol * SOL).unwrap();
        user
    }

    pub fn balance(&self, key: &Pubkey) -> u64 {
        self.svm.get_account(key).map(|a| a.lamports).unwrap_or(0)
    }

    pub fn send(&mut self, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> Result<(), String> {
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let message = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend(extra.iter().copied());
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &signers)
            .map_err(|e| e.to_string())?;
        self.svm
            .send_transaction(tx)
            .map(|_| ())
            .map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")))
    }

    /// Sends with the admin paying fees, so `signer` balances move only by
    /// program transfers.
    pub fn send_as(&mut self, ixs: &[Instruction], signer: &Keypair) -> Result<(), String> {
        let admin = self.admin.insecure_clone();
        if signer.pubkey() == admin.pubkey() {
            self.send(ixs, &admin, &[])
        } else {
            self.send(ixs, &admin, &[signer])
        }
    }

    // ---------------------------------------------------------------- tokens

    /// Creates a mint (admin is mint authority) under `program`.
    pub fn create_token(&mut self, program: Pubkey) -> Token {
        let admin = self.admin.insecure_clone();
        let mint = Keypair::new();
        let rent = self.svm.minimum_balance_for_rent_exemption(MintState::LEN);
        let create =
            system_instruction::create_account(&admin.pubkey(), &mint.pubkey(), rent, MintState::LEN as u64, &program);
        let init = token_ix::initialize_mint2(&program, &mint.pubkey(), &admin.pubkey(), None, TOKEN_DECIMALS).unwrap();
        self.send(&[create, init], &admin, &[&mint]).unwrap();
        let token = Token { mint: mint.pubkey(), program };
        self.tokens.push(token);
        token
    }

    /// Creates `owner`'s associated token account if needed and mints to it.
    pub fn fund_token(&mut self, token: &Token, owner: &Pubkey, amount: u64) {
        let admin = self.admin.insecure_clone();
        let create =
            ata_ix::create_associated_token_account_idempotent(&admin.pubkey(), owner, &token.mint, &token.program);
        let mint_to =
            token_ix::mint_to(&token.program, &token.mint, &token.ata(owner), &admin.pubkey(), &[], amount).unwrap();
        self.send(&[create, mint_to], &admin, &[]).unwrap();
    }

    pub fn token_balance(&self, account: &Pubkey) -> u64 {
        let data = self.svm.get_account(account).expect("token account exists").data;
        TokenAccount::try_deserialize(&mut &data[..]).unwrap().amount
    }

    pub fn token_of(&self, mint: &Pubkey) -> Option<Token> {
        self.tokens.iter().copied().find(|t| t.mint == *mint)
    }

    // ------------------------------------------------------------- admin ixs

    pub fn initialize_ix(&self, admin: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::Initialize { oracle_signer: self.oracle.pubkey() }.data(),
            acc::Initialize {
                admin: *admin,
                config: config_pda(),
                program: prophet_games::ID,
                program_data: program_data_pda(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn set_stake_mint(&mut self, stake_mint: Pubkey, enabled: bool, min_stake: u64, max_stake: u64) -> Result<(), String> {
        let admin = self.admin.insecure_clone();
        let token = self.token_of(&stake_mint);
        let treasury = treasury_pda_for(&stake_mint);
        let instruction = Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::SetStakeMint { stake_mint, enabled, min_stake, max_stake }.data(),
            acc::SetStakeMint {
                admin: admin.pubkey(),
                config: config_pda(),
                stake_mint_config: stake_mint_pda(&stake_mint),
                treasury,
                token_mint: token.map(|t| t.mint),
                treasury_vault: token.map(|t| t.ata(&treasury)),
                token_program: token.map(|t| t.program),
                associated_token_program: token.map(|_| anchor_spl::associated_token::ID),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[instruction], &admin, &[])
    }

    pub fn admin_config_ix(&self, data: Vec<u8>, admin: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            prophet_games::ID,
            &data,
            acc::AdminConfig { admin: *admin, config: config_pda() }.to_account_metas(None),
        )
    }

    pub fn approve_asset(&mut self, asset: &TestAsset, category: Category, enabled: bool) -> Result<(), String> {
        let admin = self.admin.insecure_clone();
        let instruction = Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::SetApprovedAsset {
                asset_id: asset.id,
                category,
                price_source: asset.source,
                price_decimals: DECIMALS,
                enabled,
            }
            .data(),
            acc::SetApprovedAsset {
                admin: admin.pubkey(),
                config: config_pda(),
                approved_asset: asset_pda(&asset.id),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[instruction], &admin, &[])
    }

    pub fn withdraw_fees_ix(&self, stake_mint: Pubkey, amount: u64, admin: &Pubkey, recipient: &Pubkey) -> Instruction {
        let token = self.token_of(&stake_mint);
        let treasury = treasury_pda_for(&stake_mint);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::WithdrawFees { stake_mint, amount }.data(),
            acc::WithdrawFees {
                admin: *admin,
                config: config_pda(),
                treasury,
                recipient: *recipient,
                token_mint: token.map(|t| t.mint),
                treasury_vault: token.map(|t| t.ata(&treasury)),
                recipient_token: token.map(|t| t.ata(recipient)),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        )
    }

    pub fn withdraw_creator_ix(&self, stake_mint: Pubkey, creator: &Pubkey) -> Instruction {
        let token = self.token_of(&stake_mint);
        let earnings = creator_pda_for(&stake_mint, creator);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::WithdrawCreatorFees { stake_mint }.data(),
            acc::WithdrawCreatorFees {
                creator: *creator,
                creator_earnings: earnings,
                token_mint: token.map(|t| t.mint),
                creator_vault: token.map(|t| t.ata(&earnings)),
                creator_token: token.map(|t| t.ata(creator)),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        )
    }

    pub fn config(&self) -> Config {
        self.fetch(&config_pda())
    }

    pub fn race(&self, race_id: u64) -> Race {
        self.fetch(&race_pda(race_id))
    }

    pub fn fetch<T: AccountDeserialize>(&self, key: &Pubkey) -> T {
        let account = self.svm.get_account(key).expect("account exists");
        T::try_deserialize(&mut &account.data[..]).unwrap()
    }

    pub fn default_platform_input(&self) -> PlatformRaceInput {
        let now = self.now();
        PlatformRaceInput {
            category: Category::Stock,
            stake_mint: NATIVE_SOL,
            betting_start_time: now,
            betting_end_time: now + 600,
            race_duration: 3_600,
            start_grace: 300,
            resolution_grace: 300,
            fee_bp: 200,
            min_active_contenders: 2,
            min_stake: MIN_STAKE,
            max_stake_per_wallet: MAX_STAKE,
        }
    }

    /// Creates a platform race over the first `asset_count` assets; returns its id.
    pub fn create_platform_race(&mut self, input: PlatformRaceInput, asset_count: usize) -> Result<u64, String> {
        let admin = self.admin.insecure_clone();
        self.create_platform_race_as(input, asset_count, &admin)
    }

    /// Same, signed by `authority` (the admin or the race operator).
    pub fn create_platform_race_as(&mut self, input: PlatformRaceInput, asset_count: usize, authority: &Keypair) -> Result<u64, String> {
        let admin = self.admin.insecure_clone();
        let race_id = self.config().race_count;
        let race = race_pda(race_id);
        let token = self.token_of(&input.stake_mint);
        // Platform races credit the admin's earnings whoever signs.
        let earnings = creator_pda_for(&input.stake_mint, &admin.pubkey());
        let mut metas = acc::CreatePlatformRace {
            authority: authority.pubkey(),
            config: config_pda(),
            stake_mint_config: stake_mint_pda(&input.stake_mint),
            race,
            creator_earnings: earnings,
            token_mint: token.map(|t| t.mint),
            race_vault: token.map(|t| t.ata(&race)),
            creator_vault: token.map(|t| t.ata(&earnings)),
            token_program: token.map(|t| t.program),
            associated_token_program: token.map(|_| anchor_spl::associated_token::ID),
            system_program: system_program::ID,
        }
        .to_account_metas(None);
        for asset in self.assets.iter().take(asset_count) {
            metas.push(AccountMeta::new_readonly(asset_pda(&asset.id), false));
        }
        let instruction = Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::CreatePlatformRace { title: "Test race".to_string(), input }.data(),
            metas,
        );
        self.send(&[instruction], authority, &[])?;
        Ok(race_id)
    }

    pub fn create_community_ix(
        &self,
        race_id: u64,
        creator: &Pubkey,
        duration: i64,
        stake_mint: Pubkey,
        assets: &[usize],
    ) -> Instruction {
        let race = race_pda(race_id);
        let token = self.token_of(&stake_mint);
        let earnings = creator_pda_for(&stake_mint, creator);
        let mut metas = acc::CreateCommunityRace {
            creator: *creator,
            config: config_pda(),
            stake_mint_config: stake_mint_pda(&stake_mint),
            race,
            creator_earnings: earnings,
            token_mint: token.map(|t| t.mint),
            race_vault: token.map(|t| t.ata(&race)),
            creator_vault: token.map(|t| t.ata(&earnings)),
            token_program: token.map(|t| t.program),
            associated_token_program: token.map(|_| anchor_spl::associated_token::ID),
            system_program: system_program::ID,
        }
        .to_account_metas(None);
        for index in assets {
            metas.push(AccountMeta::new_readonly(asset_pda(&self.assets[*index].id), false));
        }
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::CreateCommunityRace {
                title: "Community".into(),
                category: Category::Stock,
                race_duration: duration,
                stake_mint,
            }
            .data(),
            metas,
        )
    }

    pub fn bet_ix(&self, race_id: u64, bettor: &Pubkey, asset_index: u8, amount: u64) -> Instruction {
        let race = race_pda(race_id);
        let token = self.token_of(&self.race(race_id).stake_mint);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::Bet { asset_index, amount }.data(),
            acc::PlaceBet {
                bettor: *bettor,
                config: config_pda(),
                race,
                position: position_pda(&race, bettor),
                token_mint: token.map(|t| t.mint),
                bettor_token: token.map(|t| t.ata(bettor)),
                race_vault: token.map(|t| t.ata(&race)),
                token_program: token.map(|t| t.program),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn bet(&mut self, race_id: u64, bettor: &Keypair, asset_index: u8, amount: u64) -> Result<(), String> {
        let instruction = self.bet_ix(race_id, &bettor.pubkey(), asset_index, amount);
        self.send(&[instruction], bettor, &[])
    }

    pub fn attestation(&self, target: i64, prices: &[(usize, u64)]) -> PoolAttestation {
        PoolAttestation {
            domain: ATTESTATION_DOMAIN,
            version: ATTESTATION_VERSION,
            program_id: prophet_games::ID,
            target_timestamp: target,
            prev_slot: 1_000,
            prev_blockhash: [7u8; 32],
            prev_block_time: target - 1,
            next_slot: 1_001,
            next_parent_slot: 1_000,
            next_parent_blockhash: [7u8; 32],
            next_block_time: target,
            entries: prices
                .iter()
                .map(|(index, price)| PriceEntry {
                    price_source: self.assets[*index].source,
                    price: *price,
                    decimals: DECIMALS,
                })
                .collect(),
        }
    }

    pub fn start_ix(&self, race_id: u64) -> Instruction {
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::StartRace {}.data(),
            acc::StartRace {
                race: race_pda(race_id),
                instructions: solana_sdk_ids::sysvar::instructions::ID,
            }
            .to_account_metas(None),
        )
    }

    /// Resolve instruction; `treasury_vault_override` lets tests try to divert fees.
    pub fn resolve_ix_with(&self, race_id: u64, treasury_vault_override: Option<Pubkey>) -> Instruction {
        let race_state: Race = self.race(race_id);
        let race = race_pda(race_id);
        let mint = race_state.stake_mint;
        let token = self.token_of(&mint);
        let treasury = treasury_pda_for(&mint);
        let earnings = creator_pda_for(&mint, &race_state.creator);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::ResolveRace {}.data(),
            acc::ResolveRace {
                race,
                treasury,
                creator_earnings: earnings,
                instructions: solana_sdk_ids::sysvar::instructions::ID,
                token_mint: token.map(|t| t.mint),
                race_vault: token.map(|t| t.ata(&race)),
                treasury_vault: token.map(|t| treasury_vault_override.unwrap_or(t.ata(&treasury))),
                creator_vault: token.map(|t| t.ata(&earnings)),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        )
    }

    pub fn resolve_ix(&self, race_id: u64) -> Instruction {
        self.resolve_ix_with(race_id, None)
    }

    pub fn start_with(&mut self, race_id: u64, attestation: &PoolAttestation, signer: &Keypair) -> Result<(), String> {
        let ixs = [ed25519_ix(signer, &encode(attestation)), self.start_ix(race_id)];
        let admin = self.admin.insecure_clone();
        self.send(&ixs, &admin, &[])
    }

    pub fn resolve_with(&mut self, race_id: u64, attestation: &PoolAttestation, signer: &Keypair) -> Result<(), String> {
        let ixs = [ed25519_ix(signer, &encode(attestation)), self.resolve_ix(race_id)];
        let admin = self.admin.insecure_clone();
        self.send(&ixs, &admin, &[])
    }

    pub fn settle_ix(&self, data: Vec<u8>, race_id: u64, owner: &Pubkey) -> Instruction {
        let race = race_pda(race_id);
        let token = self.token_of(&self.race(race_id).stake_mint);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &data,
            acc::SettlePosition {
                owner: *owner,
                race,
                position: position_pda(&race, owner),
                token_mint: token.map(|t| t.mint),
                race_vault: token.map(|t| t.ata(&race)),
                owner_token: token.map(|t| t.ata(owner)),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        )
    }

    /// Keeper payout of `owner`'s position, signed by `cranker`; `owner_token`
    /// overrides the token account (to test redirection).
    pub fn settle_for_ix(&self, race_id: u64, owner: &Pubkey, cranker: &Pubkey, owner_token: Option<Pubkey>) -> Instruction {
        let race = race_pda(race_id);
        let token = self.token_of(&self.race(race_id).stake_mint);
        Instruction::new_with_bytes(
            prophet_games::ID,
            &ix::SettleRacePosition {}.data(),
            acc::SettlePositionFor {
                cranker: *cranker,
                race,
                position: position_pda(&race, owner),
                owner: *owner,
                token_mint: token.map(|t| t.mint),
                race_vault: token.map(|t| t.ata(&race)),
                owner_token: owner_token.or(token.map(|t| t.ata(owner))),
                token_program: token.map(|t| t.program),
            }
            .to_account_metas(None),
        )
    }

    pub fn claim(&mut self, race_id: u64, owner: &Keypair) -> Result<(), String> {
        let instruction = self.settle_ix(ix::ClaimRace {}.data(), race_id, &owner.pubkey());
        self.send_as(&[instruction], owner)
    }

    pub fn refund(&mut self, race_id: u64, owner: &Keypair) -> Result<(), String> {
        let instruction = self.settle_ix(ix::RefundRace {}.data(), race_id, &owner.pubkey());
        self.send_as(&[instruction], owner)
    }

    pub fn timeout_ix(&self, data: Vec<u8>, race_id: u64) -> Instruction {
        Instruction::new_with_bytes(
            prophet_games::ID,
            &data,
            acc::RaceTimeout { race: race_pda(race_id) }.to_account_metas(None),
        )
    }
}

pub fn encode(attestation: &PoolAttestation) -> Vec<u8> {
    let mut bytes = Vec::new();
    attestation.serialize(&mut bytes).unwrap();
    bytes
}

/// Builds an Ed25519 precompile instruction with all data inline, the layout
/// the program requires.
pub fn ed25519_ix(signer: &Keypair, message: &[u8]) -> Instruction {
    let signature = signer.sign_message(message);
    let pubkey_offset: u16 = 16;
    let signature_offset: u16 = pubkey_offset + 32;
    let message_offset: u16 = signature_offset + 64;
    let mut data = vec![1u8, 0u8];
    for value in [
        signature_offset,
        u16::MAX,
        pubkey_offset,
        u16::MAX,
        message_offset,
        message.len() as u16,
        u16::MAX,
    ] {
        data.extend_from_slice(&value.to_le_bytes());
    }
    data.extend_from_slice(signer.pubkey().as_ref());
    data.extend_from_slice(signature.as_ref());
    data.extend_from_slice(message);
    Instruction { program_id: solana_sdk_ids::ed25519_program::ID, accounts: vec![], data }
}

pub fn assert_err(result: Result<(), String>, expected: &str) {
    match result {
        Ok(()) => panic!("expected error {expected}, transaction succeeded"),
        Err(e) => assert!(e.contains(expected), "expected {expected}, got:\n{e}"),
    }
}
