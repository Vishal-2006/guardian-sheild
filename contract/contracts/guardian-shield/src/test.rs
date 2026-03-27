#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, EnvTestConfig, Ledger, MockAuth, MockAuthInvoke},
    vec, Address, Env, IntoVal,
};

fn test_env() -> Env {
    Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
        ..Default::default()
    })
}

fn set_ledger_time(env: &Env, timestamp: u64) {
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = timestamp;
    });
}

fn beneficiaries(env: &Env, first: Address, second: Address) -> Vec<BeneficiaryShare> {
    vec![
        env,
        BeneficiaryShare {
            beneficiary: first,
            percentage: 70,
        },
        BeneficiaryShare {
            beneficiary: second,
            percentage: 30,
        }
    ]
}

#[test]
fn check_in_updates_timestamp() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 100);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &120);

    set_ledger_time(&env, 140);
    client.check_in();

    let status = client.get_status();
    assert_eq!(status.last_checkin, 140);
}

#[test]
fn claim_fails_before_inactivity_threshold() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 1_000);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &180);
    client.deposit(&500);
    client.check_in();

    set_ledger_time(&env, 1_100);
    assert!(client.try_claim_if_inactive().is_err());
}

#[test]
fn claim_succeeds_with_percentage_split() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 10_000);
    client.init(
        &owner,
        &beneficiaries(&env, beneficiary_a.clone(), beneficiary_b.clone()),
        &120,
    );
    client.deposit(&2_000);
    client.check_in();

    set_ledger_time(&env, 10_121);
    let payouts = client.claim_if_inactive();

    assert_eq!(payouts.len(), 2);
    assert_eq!(
        payouts.get(0).unwrap(),
        BeneficiaryPayout {
            beneficiary: beneficiary_a,
            amount: 1_400,
        }
    );
    assert_eq!(
        payouts.get(1).unwrap(),
        BeneficiaryPayout {
            beneficiary: beneficiary_b,
            amount: 600,
        }
    );

    let status = client.get_status();
    assert_eq!(status.vault_balance, 0);
    assert!(status.claimed);
}

#[test]
fn emergency_withdraw_reduces_balance() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 2_000);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &120);
    client.deposit(&1_000);

    let balance_after_withdraw = client.emergency_withdraw(&250);
    assert_eq!(balance_after_withdraw, 750);

    let status = client.get_status();
    assert_eq!(status.vault_balance, 750);
}

#[test]
fn update_config_changes_owner_threshold_and_beneficiaries() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let beneficiary_c = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 3_000);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &120);

    let updated_beneficiaries = vec![
        &env,
        BeneficiaryShare {
            beneficiary: beneficiary_c.clone(),
            percentage: 100,
        }
    ];

    client.update_config(&new_owner, &updated_beneficiaries, &300);

    let status = client.get_status();
    assert_eq!(status.owner, new_owner);
    assert_eq!(status.threshold_seconds, 300);
    assert_eq!(status.beneficiaries.len(), 1);
    assert_eq!(status.beneficiaries.get(0).unwrap().beneficiary, beneficiary_c);

    let logs = client.get_activity_logs();
    assert!(logs.len() >= 2);
}


#[test]
fn owner_can_update_threshold() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 500);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &120);

    client.set_threshold(&300);

    assert_eq!(client.get_threshold(), 300);
    assert_eq!(client.get_status().threshold_seconds, 300);
}

#[test]
fn non_owner_cannot_update_threshold() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 600);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &120);

    let attacker = Address::generate(&env);
    let spoof_invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "set_threshold",
        args: vec![&env, 300_u64.into_val(&env)],
        sub_invokes: &[],
    };
    let spoof_auth = [MockAuth {
        address: &attacker,
        invoke: &spoof_invoke,
    }];
    let spoofed = client.mock_auths(&spoof_auth);

    assert!(spoofed.try_set_threshold(&300).is_err());
    assert_eq!(client.get_threshold(), 120);
}

#[test]
fn claim_logic_respects_updated_threshold() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 1_000);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &120);
    client.deposit(&1_000);
    client.check_in();
    client.set_threshold(&300);

    set_ledger_time(&env, 1_121);
    assert!(client.try_claim_if_inactive().is_err());

    set_ledger_time(&env, 1_301);
    let payouts = client.claim_if_inactive();
    assert_eq!(payouts.len(), 2);
}


#[test]
fn owner_can_reset_claimed_vault_and_deposit_again() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 20_000);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &120);
    client.deposit(&1_000);
    client.check_in();

    set_ledger_time(&env, 20_121);
    let _ = client.claim_if_inactive();
    assert!(client.try_deposit(&500).is_err());

    set_ledger_time(&env, 20_200);
    client.reset_vault();

    let status_after_reset = client.get_status();
    assert!(!status_after_reset.claimed);
    assert_eq!(status_after_reset.vault_balance, 0);

    client.deposit(&500);
    let status_after_deposit = client.get_status();
    assert_eq!(status_after_deposit.vault_balance, 500);
}


#[test]
fn vault_is_not_inactive_without_funds() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 1_000);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &120);

    set_ledger_time(&env, 2_000);
    let status = client.get_status();
    assert!(!status.inactive);
    assert_eq!(status.vault_balance, 0);
    assert!(client.try_claim_if_inactive().is_err());
}

#[test]
fn first_deposit_starts_timer_from_deposit_time() {
    let env = test_env();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let beneficiary_a = Address::generate(&env);
    let beneficiary_b = Address::generate(&env);
    let contract_id = env.register(GuardianShieldContract, ());
    let client = GuardianShieldContractClient::new(&env, &contract_id);

    set_ledger_time(&env, 100);
    client.init(&owner, &beneficiaries(&env, beneficiary_a, beneficiary_b), &120);

    set_ledger_time(&env, 500);
    client.deposit(&1000);

    let status_after_deposit = client.get_status();
    assert_eq!(status_after_deposit.last_checkin, 500);

    set_ledger_time(&env, 619);
    assert!(client.try_claim_if_inactive().is_err());

    set_ledger_time(&env, 621);
    assert!(client.try_claim_if_inactive().is_ok());
}
