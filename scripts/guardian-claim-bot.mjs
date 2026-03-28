import { createClaimBotRunner, readClaimBotConfig } from "../lib/claim-bot/run-once.mjs";

const config = readClaimBotConfig();
const { runOnce, sleep } = createClaimBotRunner(config);

function log(message, ...args) {
  console.log(`[claim-bot] ${new Date().toISOString()} ${message}`, ...args);
}

async function tick() {
  const result = await runOnce();
  if (result.action === "skip" && result.reason === "already_claimed") {
    log("Vault already claimed. Waiting...");
    return;
  }
  if (result.action === "skip" && result.reason === "still_active") {
    const status = result.status;
    log(
      `Vault still active (balance=${status.vaultBalance}, threshold=${status.thresholdSeconds}s).`,
    );
    return;
  }

  log(`Vault inactive. Triggering claim (balance=${result.status.vaultBalance})...`);
  log(`Claim succeeded. tx=${result.txHash}`);
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
