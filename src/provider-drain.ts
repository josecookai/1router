import type { FastifyBaseLogger } from "fastify";

export type ProviderHealthStatus = "healthy" | "drained" | "recovering";

export type ProviderHealthRecord = {
  provider: string;
  status: ProviderHealthStatus;
  incidentCount: number;
  lastIncidentAt: number | null;
  drainedAt: number | null;
  recoveryAttemptAt: number | null;
};

export type ProviderDrainConfig = {
  /** Number of incidents before draining a provider */
  incidentThreshold: number;
  /** Cooldown period in milliseconds before recovery attempt */
  cooldownMs: number;
  /** Minimum number of healthy providers required (prevents draining all providers) */
  minHealthyProviders: number;
};

export const DEFAULT_DRAIN_CONFIG: ProviderDrainConfig = {
  incidentThreshold: 3,
  cooldownMs: 60_000, // 1 minute
  minHealthyProviders: 1
};

export class ProviderDrainManager {
  private readonly healthRecords = new Map<string, ProviderHealthRecord>();
  private readonly config: ProviderDrainConfig;
  private readonly logger: FastifyBaseLogger | undefined;

  constructor(config: Partial<ProviderDrainConfig> = {}, logger?: FastifyBaseLogger) {
    this.config = { ...DEFAULT_DRAIN_CONFIG, ...config };
    this.logger = logger;
  }

  /** Get or create health record for a provider */
  private getOrCreateRecord(provider: string): ProviderHealthRecord {
    let record = this.healthRecords.get(provider);
    if (!record) {
      record = {
        provider,
        status: "healthy",
        incidentCount: 0,
        lastIncidentAt: null,
        drainedAt: null,
        recoveryAttemptAt: null
      };
      this.healthRecords.set(provider, record);
    }
    return record;
  }

  /** Report an incident for a provider */
  reportIncident(provider: string, timestamp = Date.now()): ProviderHealthRecord {
    const record = this.getOrCreateRecord(provider);
    record.incidentCount++;
    record.lastIncidentAt = timestamp;

    this.logger?.warn({ provider, incidentCount: record.incidentCount }, "provider incident reported");

    // Check if threshold crossed and we can drain
    if (record.status === "healthy" && record.incidentCount >= this.config.incidentThreshold) {
      const healthyCount = this.getHealthyProviderCount();
      // Allow drain if we have enough healthy providers (including this one) to meet minimum after draining
      if (healthyCount >= this.config.minHealthyProviders) {
        this.drainProvider(provider, timestamp);
      } else {
        this.logger?.warn(
          { provider, healthyCount, minRequired: this.config.minHealthyProviders },
          "cannot drain provider: minimum healthy provider floor reached"
        );
      }
    }

    return record;
  }

  /** Mark a provider as drained */
  private drainProvider(provider: string, timestamp: number): void {
    const record = this.getOrCreateRecord(provider);
    record.status = "drained";
    record.drainedAt = timestamp;
    this.logger?.error({ provider, incidentCount: record.incidentCount }, "provider drained due to incidents");
  }

  /** Check if a provider can be recovered */
  checkRecovery(provider: string, timestamp = Date.now()): boolean {
    const record = this.healthRecords.get(provider);
    if (!record || record.status !== "drained") {
      return false;
    }

    if (record.drainedAt === null) {
      return false;
    }

    const elapsed = timestamp - record.drainedAt;
    if (elapsed < this.config.cooldownMs) {
      return false;
    }

    // Mark as recovering and reset incident count
    record.status = "recovering";
    record.recoveryAttemptAt = timestamp;
    record.incidentCount = 0;
    this.logger?.info({ provider, cooldownMs: this.config.cooldownMs }, "provider marked for recovery");

    return true;
  }

  /** Confirm provider recovery (call this after a successful health check/request) */
  confirmRecovery(provider: string): void {
    const record = this.healthRecords.get(provider);
    if (!record || record.status !== "recovering") {
      return;
    }

    record.status = "healthy";
    record.drainedAt = null;
    record.recoveryAttemptAt = null;
    this.logger?.info({ provider }, "provider recovered and marked healthy");
  }

  /** Mark recovery as failed (re-drain the provider) */
  failRecovery(provider: string, timestamp = Date.now()): void {
    const record = this.healthRecords.get(provider);
    if (!record || record.status !== "recovering") {
      return;
    }

    record.status = "drained";
    record.drainedAt = timestamp;
    record.recoveryAttemptAt = null;
    record.incidentCount = this.config.incidentThreshold; // Reset to threshold so next incident drains again
    this.logger?.warn({ provider }, "provider recovery failed, re-drained");
  }

  /** Get health status for a provider */
  getStatus(provider: string): ProviderHealthStatus {
    return this.healthRecords.get(provider)?.status ?? "healthy";
  }

  /** Check if a provider is available for routing */
  isAvailable(provider: string): boolean {
    const status = this.getStatus(provider);
    return status === "healthy" || status === "recovering";
  }

  /** Get full health record for a provider */
  getRecord(provider: string): ProviderHealthRecord | null {
    return this.healthRecords.get(provider) ?? null;
  }

  /** Get all health records */
  getAllRecords(): ProviderHealthRecord[] {
    return Array.from(this.healthRecords.values());
  }

  /** Get count of healthy providers */
  private getHealthyProviderCount(): number {
    return Array.from(this.healthRecords.values()).filter((r) => r.status === "healthy").length;
  }

  /** Get list of drained providers */
  getDrainedProviders(): string[] {
    return Array.from(this.healthRecords.values())
      .filter((r) => r.status === "drained")
      .map((r) => r.provider);
  }

  /** Get list of available providers (healthy + recovering) */
  getAvailableProviders(): string[] {
    return Array.from(this.healthRecords.values())
      .filter((r) => r.status === "healthy" || r.status === "recovering")
      .map((r) => r.provider);
  }

  /** Reset all health records (useful for testing) */
  reset(): void {
    this.healthRecords.clear();
  }
}
