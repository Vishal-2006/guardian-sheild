import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";

const config = {
  rpcUrl: process.env.SOROBAN_RPC_URL || process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
  contractId:
    process.env.GUARDIAN_CONTRACT_ID || process.env.NEXT_PUBLIC_GUARDIAN_CONTRACT_ID,
  networkPassphrase:
    process.env.NETWORK_PASSPHRASE ||
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ||
    Networks.TESTNET,
  botSecret: process.env.CLAIM_BOT_SECRET_KEY,
  pollMs: Number(process.env.CLAIM_BOT_POLL_MS || "15000"),
  finalityTimeoutMs: Number(process.env.CLAIM_BOT_FINALITY_TIMEOUT_MS || "60000"),
};

for (const [key, value] of Object.entries({
  SOROBAN_RPC_URL: config.rpcUrl,
  GUARDIAN_CONTRACT_ID: config.contractId,
  CLAIM_BOT_SECRET_KEY: config.botSecret,
})) {
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
}

const server = new rpc.Server(config.rpcUrl);
const contract = new Contract(config.contractId);
const botKeypair = Keypair.fromSecret(config.botSecret);
const botPublicKey = botKeypair.publicKey();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message, ...args) {
  console.log(`[claim-bot] ${new Date().toISOString()} ${message}`, ...args);
}

async function getVaultStatus() {
  const source = await server.getAccount(botPublicKey);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call("get_status"))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!("result" in sim) || !sim.result) {
    throw new Error("Simulation failed for get_status");
  }

  const raw = scValToNative(sim.result.retval);
  const data = raw ?? {};
  return {
    inactive: Boolean(data.inactive),
    claimed: Boolean(data.claimed),
    vaultBalance: String(data.vault_balance ?? data.vaultBalance ?? "0"),
    thresholdSeconds: Number(data.threshold_seconds ?? data.thresholdSeconds ?? 0),
    lastCheckin: Number(data.last_checkin ?? data.lastCheckin ?? 0),
  };
}

async function waitForFinality(hash) {
  const started = Date.now();
  while (Date.now() - started < config.finalityTimeoutMs) {
    const tx = await server.getTransaction(hash);
    if (tx.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
      await sleep(1000);
      continue;
    }
    return tx;
  }
  throw new Error(`Timeout waiting for transaction ${hash}`);
}

async function submitClaim() {
  const source = await server.getAccount(botPublicKey);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call("claim_if_inactive"))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(botKeypair);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error("RPC rejected claim transaction");
  }

  const final = await waitForFinality(sent.hash);
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Claim transaction failed with status ${final.status}`);
  }

  return sent.hash;
}

async function tick() {
  const status = await getVaultStatus();

  if (status.claimed) {
    log("Vault already claimed. Waiting...");
    return;
  }

  if (!status.inactive) {
    log(
      `Vault still active (balance=${status.vaultBalance}, threshold=${status.thresholdSeconds}s).`,
    );
    return;
  }

  log(`Vault inactive. Triggering claim (balance=${status.vaultBalance})...`);
  const hash = await submitClaim();
  log(`Claim succeeded. tx=${hash}`);
}

async function main() {
  log(`Bot started for contract ${config.contractId}. Poll every ${config.pollMs}ms.`);

  while (true) {
    try {
      await tick();
    } catch (error) {
      log(error instanceof Error ? error.message : "Unknown bot error");
    }
    await sleep(config.pollMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

