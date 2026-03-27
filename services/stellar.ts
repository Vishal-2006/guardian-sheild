import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder as TxBuilder,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { getAddress, requestAccess, signTransaction } from "@stellar/freighter-api";

export type BeneficiaryShare = {
  beneficiary: string;
  percentage: number;
};
export type ConfigBeneficiaryInput = {
  beneficiary: string;
  percentage: number;
};

export type VaultStatus = {
  owner: string;
  beneficiaries: BeneficiaryShare[];
  lastCheckin: number;
  vaultBalance: string;
  thresholdSeconds: number;
  inactive: boolean;
  claimed: boolean;
};

export type SubmittedTx = {
  hash: string;
  status: "SUCCESS";
};

export type ThresholdValue = {
  thresholdSeconds: number;
};

export type ThresholdUpdateResult = SubmittedTx & ThresholdValue;
export type ContractActivityLog = {
  eventType: string;
  actor: string;
  amount: string;
  timestamp: number;
};

export const guardianShieldQueryKeys = {
  vaultStatus: ["guardian-shield", "vault-status"] as const,
  threshold: ["guardian-shield", "threshold"] as const,
};

type StellarServiceConfig = {
  rpcUrl: string;
  contractId: string;
  networkPassphrase?: string;
  sourceSecret?: string;
  sourcePublicKey?: string;
  timeoutMs?: number;
};

type TxMethod = "deposit" | "check_in" | "claim_if_inactive" | "set_threshold" | "reset_vault";
type ConfigTxMethod = TxMethod | "update_config";

const DEFAULT_TIMEOUT_MS = 45_000;
const POLL_MS = 1_000;

export class GuardianShieldStellarService {
  private readonly server: rpc.Server;
  private readonly contract: Contract;
  private readonly keypair?: Keypair;
  private readonly sourcePublicKey?: string;
  private readonly networkPassphrase: string;
  private readonly timeoutMs: number;

  constructor(config: StellarServiceConfig) {
    this.server = new rpc.Server(config.rpcUrl);
    this.contract = new Contract(config.contractId);
    if (config.sourceSecret) {
      this.keypair = Keypair.fromSecret(config.sourceSecret);
      this.sourcePublicKey = this.keypair.publicKey();
    } else if (config.sourcePublicKey) {
      this.sourcePublicKey = config.sourcePublicKey;
    }
    this.networkPassphrase = config.networkPassphrase ?? Networks.TESTNET;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async deposit(amount: bigint): Promise<SubmittedTx> {
    if (amount <= BigInt(0)) {
      throw new Error("deposit amount must be positive");
    }

    return this.invokeAndSubmitWithFreighter("deposit", [nativeToScVal(amount, { type: "i128" })]);
  }

  async checkIn(): Promise<SubmittedTx> {
    return this.invokeAndSubmitWithFreighter("check_in", []);
  }

  async claimIfInactive(): Promise<SubmittedTx> {
    return this.invokeAndSubmitWithFreighter("claim_if_inactive", []);
  }

  async resetVault(): Promise<SubmittedTx> {
    return this.invokeAndSubmitWithFreighter("reset_vault", []);
  }

  async setThreshold(newThreshold: number): Promise<ThresholdUpdateResult> {
    if (!Number.isFinite(newThreshold) || newThreshold <= 0) {
      throw new Error("threshold must be a positive number");
    }

    const tx = await this.invokeAndSubmitWithFreighter("set_threshold", [
      nativeToScVal(Math.floor(newThreshold), { type: "u64" }),
    ]);
    const thresholdSeconds = await this.getThreshold();
    return { ...tx, thresholdSeconds };
  }

  async updateConfig(input: {
    newOwner: string;
    beneficiaries: ConfigBeneficiaryInput[];
    thresholdSeconds: number;
  }): Promise<SubmittedTx> {
    const newOwner = input.newOwner.trim();
    if (!newOwner) {
      throw new Error("owner address is required");
    }
    if (!Number.isFinite(input.thresholdSeconds) || input.thresholdSeconds <= 0) {
      throw new Error("thresholdSeconds must be positive");
    }
    if (input.beneficiaries.length === 0) {
      throw new Error("at least one beneficiary is required");
    }

    let total = 0;
    const beneficiaries = input.beneficiaries.map((entry) => {
      const beneficiary = entry.beneficiary.trim();
      const percentage = Math.floor(entry.percentage);
      if (!beneficiary || !Number.isFinite(percentage) || percentage <= 0) {
        throw new Error("invalid beneficiary entry");
      }
      total += percentage;
      return { beneficiary, percentage };
    });
    if (total !== 100) {
      throw new Error("beneficiary percentages must add up to 100");
    }

    return this.invokeAndSubmitWithFreighter("update_config", [
      nativeToScVal(newOwner, { type: "address" }),
      beneficiariesToScVal(beneficiaries),
      nativeToScVal(Math.floor(input.thresholdSeconds), { type: "u64" }),
    ]);
  }

  async getThreshold(): Promise<number> {
    try {
      const account = await this.getSourceAccountForRead();
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(this.contract.call("get_threshold"))
        .setTimeout(30)
        .build();

      const sim = await this.server.simulateTransaction(tx);
      if (!("result" in sim) || !sim.result) {
        throw new Error("Simulation did not return threshold.");
      }

      return Number(scValToNative(sim.result.retval));
    } catch (error) {
      throw wrapError("getThreshold", error);
    }
  }

  async getVaultStatus(): Promise<VaultStatus> {
    try {
      const account = await this.getSourceAccountForRead();
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(this.contract.call("get_status"))
        .setTimeout(30)
        .build();

      const sim = await this.server.simulateTransaction(tx);
      if (!("result" in sim) || !sim.result) {
        throw new Error("Simulation did not return vault status.");
      }

      const native = scValToNative(sim.result.retval);
      return parseVaultStatus(native);
    } catch (error) {
      throw wrapError("getVaultStatus", error);
    }
  }

  async getActivityLogs(): Promise<ContractActivityLog[]> {
    try {
      const account = await this.getSourceAccountForRead();
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(this.contract.call("get_activity_logs"))
        .setTimeout(30)
        .build();

      const sim = await this.server.simulateTransaction(tx);
      if (!("result" in sim) || !sim.result) {
        throw new Error("Simulation did not return activity logs.");
      }

      return parseActivityLogs(scValToNative(sim.result.retval));
    } catch (error) {
      throw wrapError("getActivityLogs", error);
    }
  }

  private async invokeAndSubmitWithFreighter(method: ConfigTxMethod, args: xdr.ScVal[]): Promise<SubmittedTx> {
    try {
      const access = await requestAccess();
      if (access.error) {
        throw new Error(access.error.message || "Freighter access denied.");
      }

      const addressResult = await getAddress();
      const sourceAddress = access.address || (!addressResult.error ? addressResult.address : "");
      if (!sourceAddress) {
        throw new Error("Freighter did not provide a wallet address.");
      }

      const account = await this.server.getAccount(sourceAddress);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(this.contract.call(method, ...args))
        .setTimeout(30)
        .build();

      const prepared = await this.server.prepareTransaction(tx);
      const signed = await signTransaction(prepared.toXDR(), {
        networkPassphrase: this.networkPassphrase,
        address: sourceAddress,
      });

      if (signed.error || !signed.signedTxXdr) {
        throw new Error(signed.error?.message || "Freighter failed to sign transaction.");
      }

      const signedTx = TxBuilder.fromXDR(signed.signedTxXdr, this.networkPassphrase);
      const sent = await this.server.sendTransaction(signedTx);
      if (sent.status === "ERROR") {
        throw new Error("Transaction rejected by RPC.");
      }

      const final = await this.pollForFinality(sent.hash);
      if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Transaction failed: ${final.status}`);
      }

      return { hash: sent.hash, status: "SUCCESS" };
    } catch (error) {
      throw wrapError(method, error);
    }
  }

  private async getSourceAccountForRead() {
    const source = this.sourcePublicKey;
    if (!source) {
      throw new Error("Missing source account for read operations.");
    }

    return this.server.getAccount(source);
  }

  private async pollForFinality(hash: string): Promise<rpc.Api.GetTransactionResponse> {
    const started = Date.now();

    while (Date.now() - started < this.timeoutMs) {
      const result = await this.server.getTransaction(hash);
      if (result.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
        return result;
      }

      await delay(POLL_MS);
    }

    throw new Error(`Timeout waiting for transaction ${hash}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapError(method: string, error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`GuardianShield ${method} failed: ${error.message}`);
  }

  return new Error(`GuardianShield ${method} failed with unknown error`);
}

function parseVaultStatus(raw: unknown): VaultStatus {
  const data = raw as Record<string, unknown>;

  const beneficiariesRaw = (pick(data, ["beneficiaries"]) as unknown[]) ?? [];
  const beneficiaries = beneficiariesRaw.map((item) => {
    const share = item as Record<string, unknown>;
    return {
      beneficiary: stringifyAddress(pick(share, ["beneficiary", "address"])),
      percentage: Number(pick(share, ["percentage"])),
    };
  });

  return {
    owner: stringifyAddress(pick(data, ["owner"])),
    beneficiaries,
    lastCheckin: Number(pick(data, ["last_checkin", "lastCheckin"])),
    vaultBalance: String(pick(data, ["vault_balance", "vaultBalance"])),
    thresholdSeconds: Number(pick(data, ["threshold_seconds", "thresholdSeconds"])),
    inactive: Boolean(pick(data, ["inactive"])),
    claimed: Boolean(pick(data, ["claimed"])),
  };
}

function parseActivityLogs(raw: unknown): ContractActivityLog[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => {
    const data = (item ?? {}) as Record<string, unknown>;
    return {
      eventType: stringifyActivityType(pick(data, ["event_type", "eventType"])),
      actor: stringifyAddress(pick(data, ["actor"])),
      amount: String(pick(data, ["amount"]) ?? "0"),
      timestamp: Number(pick(data, ["timestamp"]) ?? 0),
    };
  });
}

function stringifyActivityType(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.tag === "string") {
      return record.tag;
    }
    const keys = Object.keys(record);
    if (keys.length > 0) {
      return keys[0];
    }
  }

  return "ConfigUpdated";
}

function pick(target: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in target) {
      return target[key];
    }
  }

  return undefined;
}

function stringifyAddress(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }

  return "";
}

function beneficiariesToScVal(beneficiaries: ConfigBeneficiaryInput[]): xdr.ScVal {
  const entries = beneficiaries.map((entry) =>
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("beneficiary"),
        val: nativeToScVal(entry.beneficiary, { type: "address" }),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("percentage"),
        val: nativeToScVal(Math.floor(entry.percentage), { type: "u32" }),
      }),
    ]),
  );

  return xdr.ScVal.scvVec(entries);
}

export function createGuardianShieldService(): GuardianShieldStellarService {
  const rpcUrl = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
  const contractId = process.env.NEXT_PUBLIC_GUARDIAN_CONTRACT_ID;
  const sourceSecret = process.env.NEXT_PUBLIC_GUARDIAN_SOURCE_SECRET;
  const sourcePublicKey = process.env.NEXT_PUBLIC_GUARDIAN_SOURCE_PUBLIC_KEY;
  const networkPassphrase = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE;

  if (!rpcUrl || !contractId || (!sourceSecret && !sourcePublicKey)) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SOROBAN_RPC_URL, NEXT_PUBLIC_GUARDIAN_CONTRACT_ID, and one of NEXT_PUBLIC_GUARDIAN_SOURCE_SECRET or NEXT_PUBLIC_GUARDIAN_SOURCE_PUBLIC_KEY",
    );
  }

  return new GuardianShieldStellarService({
    rpcUrl,
    contractId,
    sourceSecret,
    sourcePublicKey,
    networkPassphrase,
  });
}
