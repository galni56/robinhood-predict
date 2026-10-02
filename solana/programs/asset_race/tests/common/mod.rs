#![allow(dead_code)]

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{
            bpf_loader_upgradeable,
            instruction::{AccountMeta, Instruction},
            system_program,
        },
        AccountDeserialize, AnchorSerialize, InstructionData, ToAccountMetas,
    },
    asset_race::{
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

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &asset_race::ID).0
}

pub fn treasury_pda() -> Pubkey {
    Pubkey::find_program_address(&[TREASURY_SEED, NATIVE_SOL.as_ref()], &asset_race::ID).0
}

pub fn asset_pda(asset_id: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[ASSET_SEED, asset_id.as_ref()], &asset_race::ID).0
}

pub fn race_pda(race_id: u64) -> Pubkey {
    Pubkey::find_program_address(&[RACE_SEED, race_id.to_le_bytes().as_ref()], &asset_race::ID).0
}

pub fn position_pda(race: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[POSITION_SEED, race.as_ref(), owner.as_ref()], &asset_race::ID).0
}

pub fn creator_pda(creator: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[CREATOR_SEED, NATIVE_SOL.as_ref(), creator.as_ref()], &asset_race::ID).0
}

pub fn program_data_pda() -> Pubkey {
    Pubkey::find_program_address(&[asset_race::ID.as_ref()], &bpf_loader_upgradeable::ID).0
}

#[derive(Clone)]
pub struct TestAsset {
    pub id: [u8; 32],
    pub source: Pubkey,
}

pub fn test_asset(n: u8) -> TestAsset {
    TestAsset { id: [n; 32], source: Pubkey::new_unique() }
}

pub struct Harness {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub oracle: Keypair,
    pub assets: Vec<TestAsset>,
}

impl Harness {
    /// Deploys the program with `admin` as upgrade authority. Does not initialize.
    pub fn deploy() -> Self {
        let mut svm = LiteSVM::new().with_precompiles();
        let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/asset_race.so"));
        svm.add_program(asset_race::ID, bytes).unwrap();

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
        };
        harness.set_time(START_TIME);
        harness
    }

    /// Deploys, initializes and approves four Stock assets.
    pub fn new() -> Self {
        let mut h = Self::deploy();
        let admin = h.admin.insecure_clone();
        h.send(&[h.initialize_ix(&admin.pubkey())], &admin, &[]).unwrap();
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

    pub fn initialize_ix(&self, admin: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            asset_race::ID,
            &ix::Initialize { oracle_signer: self.oracle.pubkey() }.data(),
            acc::Initialize {
                admin: *admin,
                config: config_pda(),
                treasury: treasury_pda(),
                program: asset_race::ID,
                program_data: program_data_pda(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn admin_config_ix(&self, data: Vec<u8>, admin: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            asset_race::ID,
            &data,
            acc::AdminConfig { admin: *admin, config: config_pda() }.to_account_metas(None),
        )
    }

    pub fn approve_asset(&mut self, asset: &TestAsset, category: Category, enabled: bool) -> Result<(), String> {
        let admin = self.admin.insecure_clone();
        let instruction = Instruction::new_with_bytes(
            asset_race::ID,
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
            betting_start_time: now,
            betting_end_time: now + 600,
            race_duration: 3_600,
            start_grace: 300,
            resolution_grace: 300,
            fee_bp: 200,
            min_active_contenders: 2,
            min_stake: SOL / 100,
            max_stake_per_wallet: SOL,
        }
    }

    /// Creates a platform race over the first `asset_count` assets; returns its id.
    pub fn create_platform_race(&mut self, input: PlatformRaceInput, asset_count: usize) -> Result<u64, String> {
        let admin = self.admin.insecure_clone();
        let race_id = self.config().race_count;
        let mut metas = acc::CreatePlatformRace {
            admin: admin.pubkey(),
            config: config_pda(),
            race: race_pda(race_id),
            creator_earnings: creator_pda(&admin.pubkey()),
            system_program: system_program::ID,
        }
        .to_account_metas(None);
        for asset in self.assets.iter().take(asset_count) {
            metas.push(AccountMeta::new_readonly(asset_pda(&asset.id), false));
        }
        let instruction = Instruction::new_with_bytes(
            asset_race::ID,
            &ix::CreatePlatformRace { title: "Test race".to_string(), input }.data(),
            metas,
        );
        self.send(&[instruction], &admin, &[])?;
        Ok(race_id)
    }

    pub fn bet_ix(&self, race_id: u64, bettor: &Pubkey, asset_index: u8, amount: u64) -> Instruction {
        let race = race_pda(race_id);
        Instruction::new_with_bytes(
            asset_race::ID,
            &ix::Bet { asset_index, amount }.data(),
            acc::PlaceBet {
                bettor: *bettor,
                config: config_pda(),
                race,
                position: position_pda(&race, bettor),
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
            program_id: asset_race::ID,
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
            asset_race::ID,
            &ix::StartRace {}.data(),
            acc::StartRace {
                race: race_pda(race_id),
                instructions: solana_sdk_ids::sysvar::instructions::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn resolve_ix(&self, race_id: u64) -> Instruction {
        let race: Race = self.race(race_id);
        Instruction::new_with_bytes(
            asset_race::ID,
            &ix::ResolveRace {}.data(),
            acc::ResolveRace {
                race: race_pda(race_id),
                treasury: treasury_pda(),
                creator_earnings: creator_pda(&race.creator),
                instructions: solana_sdk_ids::sysvar::instructions::ID,
            }
            .to_account_metas(None),
        )
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
        Instruction::new_with_bytes(
            asset_race::ID,
            &data,
            acc::SettlePosition { owner: *owner, race, position: position_pda(&race, owner) }
                .to_account_metas(None),
        )
    }

    pub fn claim(&mut self, race_id: u64, owner: &Keypair) -> Result<(), String> {
        let instruction = self.settle_ix(ix::Claim {}.data(), race_id, &owner.pubkey());
        self.send_as(&[instruction], owner)
    }

    pub fn refund(&mut self, race_id: u64, owner: &Keypair) -> Result<(), String> {
        let instruction = self.settle_ix(ix::Refund {}.data(), race_id, &owner.pubkey());
        self.send_as(&[instruction], owner)
    }

    pub fn timeout_ix(&self, data: Vec<u8>, race_id: u64) -> Instruction {
        Instruction::new_with_bytes(
            asset_race::ID,
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
