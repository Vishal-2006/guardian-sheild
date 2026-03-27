# Guardian Shield

Guardian Shield is a decentralized inheritance vault demo built with Next.js and a Soroban smart contract.

The owner deposits funds and must periodically check in. If inactivity exceeds the configured threshold (2 minutes for demo), the vault can be claimed by the beneficiary.

## Tech Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- React Query (TanStack Query)
- Rust + `soroban-sdk`
- Stellar JavaScript SDK (`@stellar/stellar-sdk`)

## Project Structure

- `app/` - Next.js App Router pages, layout, and providers
- `components/guardian-shield-dashboard.tsx` - main dashboard UI
- `lib/guardian-shield/service.ts` - contract interaction service (mock mode + Soroban RPC stub)
- `contract/contracts/guardian-shield/src/lib.rs` - Soroban contract logic
- `contract/contracts/guardian-shield/src/test.rs` - contract tests

## Smart Contract Overview

Contract stores:
- owner address
- beneficiary address
- last check-in timestamp
- vault balance
- claimed flag

Main functions:
- `init(owner, beneficiary)`
- `deposit(amount)`
- `check_in()`
- `claim_if_inactive()`
- `get_status()`

Demo inactivity threshold is hardcoded to `120` seconds.

## Frontend Features

- Dashboard cards: vault balance, last check-in, countdown, beneficiary
- Live countdown timer (updates every second)
- Status badge: `Active` / `Inactive` / `Claimed`
- React Query caching and background refetching
- Loading skeletons for initial status fetch
- Transaction status surface (`pending -> success/error`)
- Optimistic UI update for `Check In`
- Buttons disabled while transactions are in flight

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Run frontend

```bash
npm run dev
```

Open `http://localhost:3000`.

## Run Tests

### Soroban contract tests

```bash
cd contract
cargo test -p guardian-shield
```

## Optional Soroban RPC Environment

The service layer currently runs in mock mode by default for local UX/demo behavior.

To enable real RPC mode wiring later, configure:

- `NEXT_PUBLIC_SOROBAN_RPC_URL`
- `NEXT_PUBLIC_GUARDIAN_CONTRACT_ID`
- `NEXT_PUBLIC_NETWORK_PASSPHRASE`

## Architecture Notes

- Contract enforces owner-authenticated check-ins and inactivity-based claim rule.
- Frontend reads/writes through a dedicated service abstraction (`GuardianShieldService`).
- React Query owns cache lifecycle and optimistic updates.
- UI state for transaction phase is isolated from query cache to keep rendering predictable.
