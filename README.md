# Guardian Shield

Guardian Shield is a Soroban-powered inheritance vault mini-dApp.

The vault owner deposits funds and periodically checks in. If the owner is inactive beyond a configured threshold, beneficiaries can claim the vault based on percentage split rules.

---

## Core Flow

1. Owner connects wallet on landing page.
2. Owner initializes vault config (owner + beneficiaries + threshold).
3. Owner deposits funds.
4. Owner performs periodic `check_in`.
5. If inactivity threshold is crossed, `claim_if_inactive` can be executed.
6. Owner can reset claimed vault (`reset_vault`) and continue with a new cycle.

> Current production-style behavior: inactivity protection is armed when vault has funds (first deposit from zero starts timer context).

---

## Tech Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4, React Query
- **Smart Contract:** Rust + `soroban-sdk`
- **Stellar Integration:** `@stellar/stellar-sdk`, `@stellar/freighter-api`
- **Automation:** Node-based off-chain claim bot script

---

## Features

### Contract

- Owner-authenticated actions:
  - `check_in`
  - `set_threshold`
  - `update_config`
  - `emergency_withdraw`
  - `reset_vault`
- Beneficiary split with percentages (must sum to 100)
- On-chain activity logs (`deposit`, `check-in`, `claim`, `reset`, config updates)
- Configurable inactivity threshold (default `120s`)
- Claim safety checks:
  - claim only after inactivity period
  - claim blocked if already claimed
  - claim blocked when vault balance is zero

### Frontend

- Wallet-gated landing page (`/`)
- Dashboard (`/dashboard`) with:
  - vault status cards
  - live inactivity countdown
  - health indicator
  - transaction state banner
  - on-chain activity timeline
- Owner vs beneficiary views:
  - owner sees controls
  - beneficiary gets read-only vault view
- Beneficiary config panel (single beneficiary address + 100% split UX)
- Threshold update UI
- Reset vault UI

### Off-chain Bot

- Polls contract status
- Auto-submits `claim_if_inactive` when eligible
- Useful for unattended/automatic claim trigger

---

## Project Structure

- `app/` - pages/layout/providers
- `components/` - dashboard and UI controls
- `services/stellar.ts` - on-chain service layer (tx build/sign/submit + reads)
- `scripts/guardian-claim-bot.mjs` - off-chain auto-claim bot
- `contract/contracts/guardian-shield/src/lib.rs` - contract logic
- `contract/contracts/guardian-shield/src/test.rs` - contract tests

---

## Smart Contract Functions

- `init(owner, beneficiaries, threshold_seconds)`
- `deposit(amount)`
- `check_in()`
- `claim_if_inactive()`
- `set_threshold(new_threshold)`
- `get_threshold()`
- `update_config(new_owner, beneficiaries, threshold_seconds)`
- `emergency_withdraw(amount)`
- `reset_vault()`
- `get_status()`
- `get_activity_logs()`

---

## Local Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Frontend env (`.env.local`)

```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_GUARDIAN_CONTRACT_ID=<DEPLOYED_CONTRACT_ID>
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_GUARDIAN_SOURCE_PUBLIC_KEY=<PUBLIC_G_ADDRESS_FOR_READS>
```

> Do **not** put secret keys in `NEXT_PUBLIC_*` variables.

### 3) Run app

```bash
npm run dev
```

Open: `http://localhost:3000`

---

## Build + Deploy Contract

From `contract/`:

```bash
stellar contract build
stellar contract deploy --wasm target/wasm32v1-none/release/guardian_shield.wasm --source <identity> --network testnet
```

Initialize:

```bash
stellar contract invoke --id <CONTRACT_ID> --source <owner_identity> --network testnet -- init --owner <OWNER_G_ADDRESS> --beneficiaries-file-path beneficiaries.json --threshold_seconds 120
```

Verify:

```bash
stellar contract invoke --id <CONTRACT_ID> --source <owner_identity> --network testnet -- get_status
```

---

## Run Tests

```bash
cd contract
cargo test -p guardian-shield --manifest-path Cargo.toml
```

Current suite includes 11 tests (threshold updates, inactivity checks, claim behavior, reset behavior, etc.).

---

## Run Off-chain Claim Bot

Set runtime env vars (shell):

- `SOROBAN_RPC_URL`
- `GUARDIAN_CONTRACT_ID`
- `NETWORK_PASSPHRASE`
- `CLAIM_BOT_SECRET_KEY`
- optional: `CLAIM_BOT_POLL_MS`

Run:

```bash
npm run bot:claim
```

---

## Security Notes

- Never commit or expose secret keys.
- Rotate any key that was exposed.
- Keep signing in wallet (Freighter) for user-triggered write transactions.

---

## Submission Checklist

- [x] Mini-dApp functional
- [x] 3+ tests passing (11 passing)
- [ ] README links completed:
  - [ ] live demo link
  - [ ] test output screenshot
  - [ ] 1-minute demo video link
