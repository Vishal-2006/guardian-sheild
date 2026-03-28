# Guardian Shield

A production-style Soroban inheritance vault mini-dApp.

Guardian Shield allows an owner to deposit funds and periodically check in. If inactivity exceeds the configured threshold, beneficiaries can claim the vault according to percentage splits.

## Demo

- Demo video (1 minute): https://youtu.be/UBJtXyQNLoU
- Live app: https://guardian-sheild.vercel.app/
- Test output screenshot: included in submission (shows `11 passed; 0 failed`)

## Table of Contents

- [What It Does](#what-it-does)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Smart Contract API](#smart-contract-api)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
- [Contract Build and Deploy](#contract-build-and-deploy)
- [Testing](#testing)
- [Bot Modes](#bot-modes)
- [Deployment](#deployment)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## What It Does

### Owner flow

1. Connect wallet.
2. Initialize vault config (owner, beneficiaries, threshold).
3. Deposit funds.
4. Check in periodically.
5. Update threshold/beneficiary config when needed.
6. Reset vault after claim to start a new cycle.

### Beneficiary flow

1. Connect wallet.
2. View vault status and timeline.
3. Claim once inactivity conditions are met.

### Production behavior

- Inactivity timer is armed only when vault balance is greater than zero.
- First deposit from zero sets check-in context.
- Claim is blocked if balance is zero or already claimed.

## Architecture

- `contract/` stores Soroban Rust smart contracts.
- `services/stellar.ts` handles read/write contract interaction from frontend.
- `app/` and `components/` provide wallet-gated landing + dashboard UX.
- `scripts/guardian-claim-bot.mjs` runs daemon-style off-chain auto-claim.
- `app/api/cron/claim/route.ts` runs single-execution claim checks for cron platforms.

## Tech Stack

- Frontend: Next.js 16, TypeScript, Tailwind CSS, React Query
- Blockchain: Stellar Soroban (`soroban-sdk` in Rust)
- Wallet + tx: `@stellar/freighter-api`, `@stellar/stellar-sdk`
- Automation: Node.js claim bot (daemon mode and cron mode)

## Smart Contract API

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

## Project Structure

```text
app/                            Next.js app router pages and API routes
components/                     Dashboard UI components
services/stellar.ts             Soroban service layer used by frontend
scripts/guardian-claim-bot.mjs  Long-running bot (polling mode)
lib/claim-bot/run-once.mjs      Reusable single-run bot logic
contract/contracts/guardian-shield/src/lib.rs   Main contract
contract/contracts/guardian-shield/src/test.rs  Contract tests
```

## Local Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure frontend env (`.env.local`)

```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_GUARDIAN_CONTRACT_ID=<DEPLOYED_CONTRACT_ID>
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_GUARDIAN_SOURCE_PUBLIC_KEY=<PUBLIC_G_ADDRESS_FOR_READS>
```

Important:

- Never place secret keys in any `NEXT_PUBLIC_*` variable.
- `NEXT_PUBLIC_GUARDIAN_SOURCE_PUBLIC_KEY` must be a `G...` address.

### 3) Run app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Contract Build and Deploy

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

## Testing

Run contract tests:

```bash
cd contract
cargo test -p guardian-shield --manifest-path Cargo.toml
```

Current suite: 11 passing tests.

## Bot Modes

### Mode A: Local daemon bot (polling)

Required env:

- `SOROBAN_RPC_URL`
- `GUARDIAN_CONTRACT_ID`
- `NETWORK_PASSPHRASE`
- `CLAIM_BOT_SECRET_KEY`
- optional: `CLAIM_BOT_POLL_MS`

Run:

```bash
npm run bot:claim
```

### Mode B: Cron single-run bot

Route:

- `GET /api/cron/claim`

Required env:

- `SOROBAN_RPC_URL`
- `GUARDIAN_CONTRACT_ID`
- `NETWORK_PASSPHRASE`
- `CLAIM_BOT_SECRET_KEY`
- optional: `CLAIM_BOT_FINALITY_TIMEOUT_MS`
- optional: `CRON_SECRET`

If `CRON_SECRET` is set, send:

```text
Authorization: Bearer <CRON_SECRET>
```

## Deployment

### Frontend on Vercel

Set Vercel env:

- `NEXT_PUBLIC_SOROBAN_RPC_URL`
- `NEXT_PUBLIC_GUARDIAN_CONTRACT_ID`
- `NEXT_PUBLIC_NETWORK_PASSPHRASE`
- `NEXT_PUBLIC_GUARDIAN_SOURCE_PUBLIC_KEY`

### Bot on Railway (recommended)

Set Railway env:

- `SOROBAN_RPC_URL`
- `GUARDIAN_CONTRACT_ID`
- `NETWORK_PASSPHRASE`
- `CLAIM_BOT_SECRET_KEY`
- `CLAIM_BOT_POLL_MS`

Start command:

```bash
node scripts/guardian-claim-bot.mjs
```

### Bot on Vercel Cron (Hobby limitations apply)

- Uses `vercel.json` schedule and `/api/cron/claim`.
- Hobby plan restricts cron frequency.

## Security

- Never commit `.env.local`.
- Never expose `S...` secrets to frontend/public env.
- Rotate keys immediately if leaked.
- Keep wallet signing in Freighter for user actions.

## Troubleshooting

- Dashboard stuck on loading:
  - Verify contract ID and RPC URL.
  - Verify `NEXT_PUBLIC_GUARDIAN_SOURCE_PUBLIC_KEY` exists and is valid.
  - Restart dev server after env changes.
- `Transaction rejected by RPC`:
  - Ensure connected wallet is contract owner for owner-only actions.
  - Ensure vault is initialized and not already claimed (for restricted actions).
- Beneficiary config fails:
  - Ensure percentages total exactly 100.
  - Avoid duplicate beneficiary addresses.

## Submission Checklist

- [x] Mini-dApp functional
- [x] 3+ tests passing (11 passing)
- [x] README complete
- [x] Live demo URL added
- [x] Test output screenshot added
- [x] 1-minute demo video added
- [ ] 3+ meaningful commits visible in Git history
