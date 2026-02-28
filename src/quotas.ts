export type QuotaScope = "org" | "project" | "api_key";

export type ScopeLimits = {
  rpm?: number;
  tpm?: number;
  concurrency?: number;
};

export type QuotaConfig = {
  org: ScopeLimits;
  project: ScopeLimits;
  api_key: ScopeLimits;
};

type ScopeContext = {
  orgId: string;
  projectId: string;
  apiKeyId: string;
};

type AcquireParams = {
  method: string;
  path: string;
  body: unknown;
  nowMs?: number;
  scope: ScopeContext;
};

export type QuotaViolation = {
  code: "RPM_EXCEEDED" | "TPM_EXCEEDED" | "CONCURRENCY_EXCEEDED";
  scope: QuotaScope;
  limit: number;
};

const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
  org: { rpm: 600, tpm: 1_000_000, concurrency: 200 },
  project: { rpm: 300, tpm: 300_000, concurrency: 100 },
  api_key: { rpm: 120, tpm: 120_000, concurrency: 30 }
};

function minuteWindow(nowMs: number) {
  return Math.floor(nowMs / 60_000);
}

function estimateTokens(body: unknown) {
  if (body === undefined || body === null) return 0;
  return Math.max(1, Math.ceil(JSON.stringify(body).length / 4));
}

export class InMemoryQuotaLimiter {
  private readonly rpm = new Map<string, { window: number; count: number }>();
  private readonly tpm = new Map<string, { window: number; tokens: number }>();
  private readonly active = new Map<string, number>();
  private readonly config: QuotaConfig;

  constructor(config: Partial<QuotaConfig> = {}) {
    this.config = {
      org: { ...DEFAULT_QUOTA_CONFIG.org, ...(config.org ?? {}) },
      project: { ...DEFAULT_QUOTA_CONFIG.project, ...(config.project ?? {}) },
      api_key: { ...DEFAULT_QUOTA_CONFIG.api_key, ...(config.api_key ?? {}) }
    };
  }

  acquire(params: AcquireParams) {
    if (!params.path.startsWith("/v1/")) return { ok: true as const, release: () => {} };
    const nowMs = params.nowMs ?? Date.now();
    const window = minuteWindow(nowMs);
    const tokens = estimateTokens(params.body);

    const order: Array<{ scope: QuotaScope; id: string }> = [
      { scope: "api_key", id: params.scope.apiKeyId },
      { scope: "project", id: params.scope.projectId },
      { scope: "org", id: params.scope.orgId }
    ];

    for (const item of order) {
      const limits = this.config[item.scope];
      const key = `${item.scope}:${item.id}`;

      if (limits.rpm !== undefined) {
        const entry = this.rpm.get(key);
        const current = entry && entry.window === window ? entry.count : 0;
        if (current + 1 > limits.rpm) {
          return { ok: false as const, violation: { code: "RPM_EXCEEDED", scope: item.scope, limit: limits.rpm } };
        }
      }

      if (limits.tpm !== undefined) {
        const entry = this.tpm.get(key);
        const current = entry && entry.window === window ? entry.tokens : 0;
        if (current + tokens > limits.tpm) {
          return { ok: false as const, violation: { code: "TPM_EXCEEDED", scope: item.scope, limit: limits.tpm } };
        }
      }

      if (limits.concurrency !== undefined) {
        const current = this.active.get(key) ?? 0;
        if (current + 1 > limits.concurrency) {
          return {
            ok: false as const,
            violation: { code: "CONCURRENCY_EXCEEDED", scope: item.scope, limit: limits.concurrency }
          };
        }
      }
    }

    for (const item of order) {
      const limits = this.config[item.scope];
      const key = `${item.scope}:${item.id}`;

      if (limits.rpm !== undefined) {
        const entry = this.rpm.get(key);
        const current = entry && entry.window === window ? entry.count : 0;
        this.rpm.set(key, { window, count: current + 1 });
      }
      if (limits.tpm !== undefined) {
        const entry = this.tpm.get(key);
        const current = entry && entry.window === window ? entry.tokens : 0;
        this.tpm.set(key, { window, tokens: current + tokens });
      }
      if (limits.concurrency !== undefined) {
        const current = this.active.get(key) ?? 0;
        this.active.set(key, current + 1);
      }
    }

    let released = false;
    return {
      ok: true as const,
      release: () => {
        if (released) return;
        released = true;
        for (const item of order) {
          const key = `${item.scope}:${item.id}`;
          const current = this.active.get(key) ?? 0;
          if (current <= 1) this.active.delete(key);
          else this.active.set(key, current - 1);
        }
      }
    };
  }
}

export function quotaErrorDetails(violation: QuotaViolation | { code: string; scope: QuotaScope; limit: number }) {
  return {
    scope: violation.scope,
    limit_type: violation.code,
    limit: violation.limit
  };
}
