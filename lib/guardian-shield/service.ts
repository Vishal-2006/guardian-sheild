import { rpc } from "@stellar/stellar-sdk";

export type VaultLifecycleState = "active" | "inactive" | "claimed";
export type HealthStatus = "healthy" | "warning" | "critical";

export type BeneficiarySplit = {
  address: string;
  percentage: number;
};

export type ActivityType = "deposit" | "check_in" | "claim" | "config_update";

export type ActivityTimelineItem = {
  id: string;
  type: ActivityType;
  actor: string;
  amount?: string;
  timestamp: number;
};

export type VaultStatus = {
  owner: string;
  beneficiaries: BeneficiarySplit[];
  lastCheckIn: number;
  vaultBalance: string;
  thresholdSeconds: number;
  claimed: boolean;
  state: VaultLifecycleState;
};

export type TxReceipt = {
  hash: string;
  success: boolean;
};

type ServiceConfig = {
  rpcUrl?: string;
  contractId?: string;
  networkPassphrase?: string;
};

type MockVaultRecord = {
  owner: string;
  beneficiaries: BeneficiarySplit[];
  lastCheckIn: number;
  vaultBalance: string;
  claimed: boolean;
  thresholdSeconds: number;
  activityLogs: ActivityTimelineItem[];
};

const DEFAULT_THRESHOLD_SECONDS = 120;
const MOCK_STORAGE_KEY = "guardian-shield.mock.vault.v3";
const NETWORK_LATENCY_MS = 800;

const DEFAULT_OWNER = "GD2DEMOOWNERGUARDIANSHIELD0000000000000000000000000000000";
const DEFAULT_BENEFICIARY_A = "GD2DEMOBENEFICIARYA000000000000000000000000000000000000";
const DEFAULT_BENEFICIARY_B = "GD2DEMOBENEFICIARYB000000000000000000000000000000000000";

const DEFAULT_MOCK_RECORD: MockVaultRecord = {
  owner: DEFAULT_OWNER,
  beneficiaries: [
    {
      address: DEFAULT_BENEFICIARY_A,
      percentage: 70,
    },
    {
      address: DEFAULT_BENEFICIARY_B,
      percentage: 30,
    },
  ],
  lastCheckIn: Math.floor(Date.now() / 1000),
  vaultBalance: "1000",
  claimed: false,
  thresholdSeconds: DEFAULT_THRESHOLD_SECONDS,
  activityLogs: [
    {
      id: `seed-${Date.now() - 60_000}`,
      type: "deposit",
      actor: DEFAULT_OWNER,
      amount: "1000",
      timestamp: Math.floor((Date.now() - 60_000) / 1000),
    },
    {
      id: `seed-${Date.now() - 30_000}`,
      type: "check_in",
      actor: DEFAULT_OWNER,
      timestamp: Math.floor((Date.now() - 30_000) / 1000),
    },
  ],
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function resolveState(record: MockVaultRecord): VaultLifecycleState {
  if (record.claimed) {
    return "claimed";
  }

  const inactiveFor = nowSeconds() - record.lastCheckIn;
  return inactiveFor > record.thresholdSeconds ? "inactive" : "active";
}

function toStatus(record: MockVaultRecord): VaultStatus {
  return {
    owner: record.owner,
    beneficiaries: record.beneficiaries,
    lastCheckIn: record.lastCheckIn,
    vaultBalance: record.vaultBalance,
    thresholdSeconds: record.thresholdSeconds,
    claimed: record.claimed,
    state: resolveState(record),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDemoReceipt(): TxReceipt {
  return {
    hash: `demo-${Date.now().toString(16)}`,
    success: true,
  };
}

function normalizeBeneficiaries(beneficiaries: BeneficiarySplit[]): BeneficiarySplit[] {
  if (beneficiaries.length === 0 || beneficiaries.length > 16) {
    throw new Error("Use 1-16 beneficiaries.");
  }

  let total = 0;
  const seen = new Set<string>();

  const normalized = beneficiaries.map((entry) => {
    const address = entry.address.trim();
    const percentage = Number(entry.percentage);

    if (!address) {
      throw new Error("Beneficiary address is required.");
    }

    if (!Number.isFinite(percentage) || percentage <= 0) {
      throw new Error("Beneficiary percentage must be greater than zero.");
    }

    if (seen.has(address)) {
      throw new Error("Duplicate beneficiary addresses are not allowed.");
    }

    seen.add(address);
    total += percentage;

    return {
      address,
      percentage,
    };
  });

  if (total !== 100) {
    throw new Error("Beneficiary percentages must sum to 100.");
  }

  return normalized;
}

function validateThreshold(thresholdSeconds: number): number {
  const threshold = Number(thresholdSeconds);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error("Threshold must be a positive number of seconds.");
  }

  return Math.floor(threshold);
}

function appendActivity(
  record: MockVaultRecord,
  activity: Omit<ActivityTimelineItem, "id" | "timestamp">,
): MockVaultRecord {
  const entry: ActivityTimelineItem = {
    ...activity,
    id: `log-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 7)}`,
    timestamp: nowSeconds(),
  };

  const logs = [entry, ...record.activityLogs].slice(0, 30);
  return {
    ...record,
    activityLogs: logs,
  };
}

function readMockRecord(): MockVaultRecord {
  if (typeof window === "undefined") {
    return DEFAULT_MOCK_RECORD;
  }

  const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
  if (!raw) {
    writeMockRecord(DEFAULT_MOCK_RECORD);
    return DEFAULT_MOCK_RECORD;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MockVaultRecord> & { beneficiary?: string };
    const legacyBeneficiary = parsed.beneficiary?.trim();

    const beneficiaries = Array.isArray(parsed.beneficiaries)
      ? normalizeBeneficiaries(parsed.beneficiaries)
      : legacyBeneficiary
        ? normalizeBeneficiaries([{ address: legacyBeneficiary, percentage: 100 }])
        : DEFAULT_MOCK_RECORD.beneficiaries;

    return {
      owner: parsed.owner?.trim() || DEFAULT_MOCK_RECORD.owner,
      beneficiaries,
      lastCheckIn: parsed.lastCheckIn ?? DEFAULT_MOCK_RECORD.lastCheckIn,
      vaultBalance: parsed.vaultBalance ?? DEFAULT_MOCK_RECORD.vaultBalance,
      claimed: Boolean(parsed.claimed),
      thresholdSeconds: validateThreshold(parsed.thresholdSeconds ?? DEFAULT_THRESHOLD_SECONDS),
      activityLogs: Array.isArray(parsed.activityLogs)
        ? parsed.activityLogs
        : DEFAULT_MOCK_RECORD.activityLogs,
    };
  } catch {
    writeMockRecord(DEFAULT_MOCK_RECORD);
    return DEFAULT_MOCK_RECORD;
  }
}

function writeMockRecord(record: MockVaultRecord): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(record));
}

export class GuardianShieldService {
  private readonly rpcClient?: rpc.Server;
  private readonly contractId?: string;
  private readonly mode: "mock" | "soroban";

  constructor(config: ServiceConfig = {}) {
    const rpcUrl = config.rpcUrl ?? process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
    const contractId = config.contractId ?? process.env.NEXT_PUBLIC_GUARDIAN_CONTRACT_ID;

    this.contractId = contractId;
    this.mode = rpcUrl && contractId ? "soroban" : "mock";
    this.rpcClient = rpcUrl ? new rpc.Server(rpcUrl) : undefined;
  }

  async getStatus(): Promise<VaultStatus> {
    if (this.mode === "mock") {
      await sleep(200);
      return toStatus(readMockRecord());
    }

    void this.rpcClient;
    void this.contractId;
    throw new Error("Soroban RPC mode is not configured for direct browser invocation yet.");
  }

  async getActivityTimeline(): Promise<ActivityTimelineItem[]> {
    if (this.mode === "mock") {
      await sleep(150);
      return readMockRecord().activityLogs;
    }

    throw new Error("Activity timeline wiring is pending Soroban wallet integration.");
  }

  async updateVaultConfig(input: {
    owner: string;
    beneficiaries: BeneficiarySplit[];
    thresholdSeconds: number;
  }): Promise<TxReceipt> {
    const owner = input.owner.trim();
    if (!owner) {
      throw new Error("Owner address is required.");
    }

    const thresholdSeconds = validateThreshold(input.thresholdSeconds);
    const beneficiaries = normalizeBeneficiaries(input.beneficiaries);

    if (this.mode === "mock") {
      await sleep(NETWORK_LATENCY_MS);
      const record = readMockRecord();

      const nextRecord = appendActivity(
        {
          ...record,
          owner,
          beneficiaries,
          thresholdSeconds,
        },
        {
          type: "config_update",
          actor: owner,
        },
      );

      writeMockRecord(nextRecord);
      return buildDemoReceipt();
    }

    throw new Error("Config update wiring is pending Soroban wallet integration.");
  }

  async deposit(amount: bigint): Promise<TxReceipt> {
    if (amount <= BigInt(0)) {
      throw new Error("Deposit amount must be greater than zero.");
    }

    if (this.mode === "mock") {
      await sleep(NETWORK_LATENCY_MS);
      const record = readMockRecord();
      const nextBalance = BigInt(record.vaultBalance) + amount;

      const nextRecord = appendActivity(
        {
          ...record,
          vaultBalance: nextBalance.toString(),
        },
        {
          type: "deposit",
          actor: record.owner,
          amount: amount.toString(),
        },
      );

      writeMockRecord(nextRecord);
      return buildDemoReceipt();
    }

    throw new Error("Deposit transaction wiring is pending Soroban wallet integration.");
  }

  async checkIn(): Promise<TxReceipt> {
    if (this.mode === "mock") {
      await sleep(NETWORK_LATENCY_MS);
      const record = readMockRecord();
      if (record.claimed) {
        throw new Error("Vault was already claimed.");
      }

      const nextRecord = appendActivity(
        {
          ...record,
          lastCheckIn: nowSeconds(),
        },
        {
          type: "check_in",
          actor: record.owner,
        },
      );

      writeMockRecord(nextRecord);
      return buildDemoReceipt();
    }

    throw new Error("Check-in transaction wiring is pending Soroban wallet integration.");
  }

  async claimIfInactive(): Promise<TxReceipt> {
    if (this.mode === "mock") {
      await sleep(NETWORK_LATENCY_MS);
      const record = readMockRecord();
      const inactiveFor = nowSeconds() - record.lastCheckIn;

      if (record.claimed) {
        throw new Error("Vault was already claimed.");
      }

      if (inactiveFor <= record.thresholdSeconds) {
        throw new Error("Claim is blocked until inactivity threshold is reached.");
      }

      const nextRecord = appendActivity(
        {
          ...record,
          claimed: true,
          vaultBalance: "0",
        },
        {
          type: "claim",
          actor: record.beneficiaries[0]?.address || record.owner,
          amount: record.vaultBalance,
        },
      );

      writeMockRecord(nextRecord);
      return buildDemoReceipt();
    }

    throw new Error("Claim transaction wiring is pending Soroban wallet integration.");
  }
}

export const guardianShieldService = new GuardianShieldService();
