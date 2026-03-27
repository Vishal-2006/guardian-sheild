#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env, Vec,
};

const DEFAULT_INACTIVITY_THRESHOLD_SECONDS: u64 = 120;
const MAX_BENEFICIARIES: u32 = 16;
const MAX_ACTIVITY_LOGS: u32 = 200;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Owner,
    LastCheckin,
    VaultBalance,
    Claimed,
    ThresholdSeconds,
    BeneficiaryCount,
    Beneficiary(u32),
    ActivityLogCount,
    ActivityLog(u32),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct BeneficiaryShare {
    pub beneficiary: Address,
    pub percentage: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct BeneficiaryPayout {
    pub beneficiary: Address,
    pub amount: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum ActivityType {
    Deposit,
    CheckIn,
    Claim,
    EmergencyWithdraw,
    Reset,
    ConfigUpdated,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct ActivityLog {
    pub event_type: ActivityType,
    pub actor: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct VaultStatus {
    pub owner: Address,
    pub beneficiaries: Vec<BeneficiaryShare>,
    pub last_checkin: u64,
    pub vault_balance: i128,
    pub threshold_seconds: u64,
    pub inactive: bool,
    pub claimed: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimEvent {
    #[topic]
    pub beneficiary: Address,
    pub amount: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GuardianShieldError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InvalidAmount = 3,
    InactivityPeriodNotElapsed = 4,
    AlreadyClaimed = 5,
    InvalidThreshold = 6,
    InvalidBeneficiaryConfig = 7,
    MathOverflow = 8,
    InsufficientBalance = 9,
    ActivityLogLimitReached = 10,
}

#[contract]
pub struct GuardianShieldContract;

#[contractimpl]
impl GuardianShieldContract {
    pub fn init(
        env: Env,
        owner: Address,
        beneficiaries: Vec<BeneficiaryShare>,
        threshold_seconds: u64,
    ) {
        if has_owner(&env) {
            panic_with_error!(&env, GuardianShieldError::AlreadyInitialized);
        }
        owner.require_auth();

        validate_threshold(&env, threshold_seconds);
        validate_beneficiaries(&env, &beneficiaries);

        let now = env.ledger().timestamp();
        let storage = env.storage().instance();
        storage.set(&DataKey::Owner, &owner);
        storage.set(&DataKey::LastCheckin, &now);
        storage.set(&DataKey::VaultBalance, &0i128);
        storage.set(&DataKey::Claimed, &false);
        storage.set(&DataKey::ThresholdSeconds, &threshold_seconds);

        write_beneficiaries(&env, &beneficiaries);
        append_activity(&env, ActivityType::ConfigUpdated, owner, 0);
    }

    pub fn update_config(
        env: Env,
        new_owner: Address,
        beneficiaries: Vec<BeneficiaryShare>,
        threshold_seconds: u64,
    ) {
        let owner = read_owner(&env);
        owner.require_auth();
        ensure_not_claimed(&env);

        validate_threshold(&env, threshold_seconds);
        validate_beneficiaries(&env, &beneficiaries);

        let storage = env.storage().instance();
        storage.set(&DataKey::Owner, &new_owner);
        storage.set(&DataKey::ThresholdSeconds, &threshold_seconds);
        write_beneficiaries(&env, &beneficiaries);

        append_activity(&env, ActivityType::ConfigUpdated, owner, 0);
    }

    pub fn deposit(env: Env, amount: i128) {
        if amount <= 0 {
            panic_with_error!(&env, GuardianShieldError::InvalidAmount);
        }

        let owner = read_owner(&env);
        owner.require_auth();
        ensure_not_claimed(&env);

        let balance = read_balance(&env);
        let next_balance = balance
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, GuardianShieldError::MathOverflow));

        let storage = env.storage().instance();
        storage.set(&DataKey::VaultBalance, &next_balance);
        if balance == 0 {
            // Arm inactivity protection only when funds exist in the vault.
            storage.set(&DataKey::LastCheckin, &env.ledger().timestamp());
        }

        append_activity(&env, ActivityType::Deposit, owner, amount);
    }

    pub fn check_in(env: Env) {
        let owner = read_owner(&env);
        owner.require_auth();
        ensure_not_claimed(&env);

        let now = env.ledger().timestamp();
        env.storage().instance().set(&DataKey::LastCheckin, &now);

        append_activity(&env, ActivityType::CheckIn, owner, 0);
    }

    pub fn set_threshold(env: Env, new_threshold: u64) {
        let owner = read_owner(&env);
        owner.require_auth();
        ensure_not_claimed(&env);

        validate_threshold(&env, new_threshold);
        env.storage()
            .instance()
            .set(&DataKey::ThresholdSeconds, &new_threshold);

        append_activity(&env, ActivityType::ConfigUpdated, owner, 0);
    }

    pub fn claim_if_inactive(env: Env) -> Vec<BeneficiaryPayout> {
        ensure_not_claimed(&env);

        let balance = read_balance(&env);
        if balance <= 0 {
            panic_with_error!(&env, GuardianShieldError::InsufficientBalance);
        }

        let last_checkin = read_last_checkin(&env);
        let threshold_seconds = read_threshold(&env);
        let now = env.ledger().timestamp();
        let inactive_for = now.saturating_sub(last_checkin);
        if inactive_for <= threshold_seconds {
            panic_with_error!(&env, GuardianShieldError::InactivityPeriodNotElapsed);
        }

        let beneficiaries = read_beneficiaries(&env);
        let payouts = compute_payouts(&env, balance, &beneficiaries);

        let storage = env.storage().instance();
        storage.set(&DataKey::VaultBalance, &0i128);
        storage.set(&DataKey::Claimed, &true);

        let owner = read_owner(&env);
        append_activity(&env, ActivityType::Claim, owner, balance);

        for payout in payouts.iter() {
            ClaimEvent {
                beneficiary: payout.beneficiary.clone(),
                amount: payout.amount,
            }
            .publish(&env);
        }

        payouts
    }

    pub fn emergency_withdraw(env: Env, amount: i128) -> i128 {
        if amount <= 0 {
            panic_with_error!(&env, GuardianShieldError::InvalidAmount);
        }

        let owner = read_owner(&env);
        owner.require_auth();
        ensure_not_claimed(&env);

        let balance = read_balance(&env);
        if amount > balance {
            panic_with_error!(&env, GuardianShieldError::InsufficientBalance);
        }

        let next_balance = balance - amount;
        env.storage()
            .instance()
            .set(&DataKey::VaultBalance, &next_balance);

        append_activity(&env, ActivityType::EmergencyWithdraw, owner, amount);

        next_balance
    }

    pub fn reset_vault(env: Env) {
        let owner = read_owner(&env);
        owner.require_auth();

        let now = env.ledger().timestamp();
        let storage = env.storage().instance();
        storage.set(&DataKey::VaultBalance, &0i128);
        storage.set(&DataKey::Claimed, &false);
        storage.set(&DataKey::LastCheckin, &now);

        append_activity(&env, ActivityType::Reset, owner, 0);
    }

    pub fn get_status(env: Env) -> VaultStatus {
        let owner = read_owner(&env);
        let last_checkin = read_last_checkin(&env);
        let vault_balance = read_balance(&env);
        let threshold_seconds = read_threshold(&env);
        let now = env.ledger().timestamp();
        let inactive = vault_balance > 0 && now.saturating_sub(last_checkin) > threshold_seconds;

        VaultStatus {
            owner,
            beneficiaries: read_beneficiaries(&env),
            last_checkin,
            vault_balance,
            threshold_seconds,
            inactive,
            claimed: is_claimed(&env),
        }
    }

    pub fn get_activity_logs(env: Env) -> Vec<ActivityLog> {
        read_activity_logs(&env)
    }

    pub fn get_threshold(env: Env) -> u64 {
        read_threshold(&env)
    }
}

fn has_owner(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Owner)
}

fn read_owner(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Owner)
        .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::NotInitialized))
}

fn read_last_checkin(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get::<DataKey, u64>(&DataKey::LastCheckin)
        .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::NotInitialized))
}

fn read_balance(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<DataKey, i128>(&DataKey::VaultBalance)
        .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::NotInitialized))
}

fn read_threshold(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get::<DataKey, u64>(&DataKey::ThresholdSeconds)
        .unwrap_or(DEFAULT_INACTIVITY_THRESHOLD_SECONDS)
}

fn is_claimed(env: &Env) -> bool {
    env.storage()
        .instance()
        .get::<DataKey, bool>(&DataKey::Claimed)
        .unwrap_or(false)
}

fn ensure_not_claimed(env: &Env) {
    if is_claimed(env) {
        panic_with_error!(env, GuardianShieldError::AlreadyClaimed);
    }
}

fn validate_threshold(env: &Env, threshold_seconds: u64) {
    if threshold_seconds == 0 {
        panic_with_error!(env, GuardianShieldError::InvalidThreshold);
    }
}

fn validate_beneficiaries(env: &Env, beneficiaries: &Vec<BeneficiaryShare>) {
    let count = beneficiaries.len();
    if count == 0 || count > MAX_BENEFICIARIES {
        panic_with_error!(env, GuardianShieldError::InvalidBeneficiaryConfig);
    }

    let mut total_percentage: u32 = 0;
    for i in 0..count {
        let share = beneficiaries
            .get(i)
            .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::InvalidBeneficiaryConfig));

        if share.percentage == 0 {
            panic_with_error!(env, GuardianShieldError::InvalidBeneficiaryConfig);
        }

        total_percentage = total_percentage
            .checked_add(share.percentage)
            .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::MathOverflow));

        for j in (i + 1)..count {
            let other = beneficiaries
                .get(j)
                .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::InvalidBeneficiaryConfig));
            if other.beneficiary == share.beneficiary {
                panic_with_error!(env, GuardianShieldError::InvalidBeneficiaryConfig);
            }
        }
    }

    if total_percentage != 100 {
        panic_with_error!(env, GuardianShieldError::InvalidBeneficiaryConfig);
    }
}

fn write_beneficiaries(env: &Env, beneficiaries: &Vec<BeneficiaryShare>) {
    let storage = env.storage().instance();
    let existing_count = storage
        .get::<DataKey, u32>(&DataKey::BeneficiaryCount)
        .unwrap_or(0);

    for index in 0..existing_count {
        storage.remove(&DataKey::Beneficiary(index));
    }

    let count = beneficiaries.len();
    for index in 0..count {
        let share = beneficiaries
            .get(index)
            .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::InvalidBeneficiaryConfig));
        storage.set(&DataKey::Beneficiary(index), &share);
    }

    storage.set(&DataKey::BeneficiaryCount, &count);
}

fn read_beneficiaries(env: &Env) -> Vec<BeneficiaryShare> {
    let storage = env.storage().instance();
    let count = storage
        .get::<DataKey, u32>(&DataKey::BeneficiaryCount)
        .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::NotInitialized));

    let mut beneficiaries = Vec::new(env);
    for index in 0..count {
        let share = storage
            .get::<DataKey, BeneficiaryShare>(&DataKey::Beneficiary(index))
            .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::NotInitialized));
        beneficiaries.push_back(share);
    }

    beneficiaries
}

fn compute_payouts(
    env: &Env,
    balance: i128,
    beneficiaries: &Vec<BeneficiaryShare>,
) -> Vec<BeneficiaryPayout> {
    let mut payouts = Vec::new(env);
    let count = beneficiaries.len();
    let mut distributed: i128 = 0;

    for index in 0..count {
        let share = beneficiaries
            .get(index)
            .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::InvalidBeneficiaryConfig));

        let amount = if index == count - 1 {
            balance - distributed
        } else {
            balance
                .checked_mul(share.percentage as i128)
                .and_then(|v| v.checked_div(100))
                .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::MathOverflow))
        };

        distributed = distributed
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::MathOverflow));

        payouts.push_back(BeneficiaryPayout {
            beneficiary: share.beneficiary,
            amount,
        });
    }

    payouts
}

fn append_activity(env: &Env, event_type: ActivityType, actor: Address, amount: i128) {
    let storage = env.storage().instance();
    let log_count = storage.get::<DataKey, u32>(&DataKey::ActivityLogCount).unwrap_or(0);

    if log_count >= MAX_ACTIVITY_LOGS {
        panic_with_error!(env, GuardianShieldError::ActivityLogLimitReached);
    }

    let entry = ActivityLog {
        event_type,
        actor,
        amount,
        timestamp: env.ledger().timestamp(),
    };

    storage.set(&DataKey::ActivityLog(log_count), &entry);
    storage.set(&DataKey::ActivityLogCount, &(log_count + 1));
}

fn read_activity_logs(env: &Env) -> Vec<ActivityLog> {
    let storage = env.storage().instance();
    let log_count = storage.get::<DataKey, u32>(&DataKey::ActivityLogCount).unwrap_or(0);

    let mut logs = Vec::new(env);
    for index in 0..log_count {
        let entry = storage
            .get::<DataKey, ActivityLog>(&DataKey::ActivityLog(index))
            .unwrap_or_else(|| panic_with_error!(env, GuardianShieldError::NotInitialized));
        logs.push_back(entry);
    }

    logs
}

mod test;
