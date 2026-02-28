import type { RouterAuthContext } from "./auth.js";

type Limits = {
  rpm: number;
  tpm: number;
  concurrency: number;
};

type ScopeType = "api_key" | "project" | "org";
type MetricType = "rpm" | "tpm" | "concurrency";

type ScopeDescriptor = {
  scope_type: ScopeType;
  scope_id: string;
};

type CounterWindow = {
  minuteBucket: number;
  requests: number;
  tokens: number;
  inFlight: number;
};

type CheckResult =
  | { allowed: true; release: () => void; limits: Limits; scope: ScopeDescriptor }
  | {
      allowed: false;
      reason: MetricType;
      current: number;
      limit: number;
      retry_after_seconds: number;
      limits: Limits;
      scope: ScopeDescriptor;
    };

const defaultLimits: Limits = {
  rpm: 120,
  tpm: 12_000,
  concurrency: 20
};

function estimateTokens(payload: unknown): number {
  if (!payload) return 1;
  const serialized = JSON.stringify(payload);
  return Math.max(1, Math.ceil(serialized.length / 4));
}

function minuteBucket(tsMs: number) {
  return Math.floor(tsMs / 60_000);
}

function retryAfterSeconds(tsMs: number) {
  return Math.max(1, Math.ceil((60_000 - (tsMs % 60_000)) / 1000));
}

export class InMemoryMultiScopeRateLimiter {
  private readonly windows = new Map<string, CounterWindow>();
  private readonly orgPolicy = new Map<string, Partial<Limits>>();
  private readonly projectPolicy = new Map<string, Partial<Limits>>();

  setOrgPolicy(orgId: string, limits: Partial<Limits>) {
    this.orgPolicy.set(orgId, limits);
  }

  setProjectPolicy(projectId: string, limits: Partial<Limits>) {
    this.projectPolicy.set(projectId, limits);
  }

  private resolveEffectiveLimits(ctx: RouterAuthContext): { limits: Limits; scope: ScopeDescriptor } {
    const keyLimits = ctx.limits ?? {};
    const projectLimits = this.projectPolicy.get(ctx.project_id) ?? {};
    const orgLimits = this.orgPolicy.get(ctx.org_id) ?? {};

    const limits: Limits = {
      rpm: keyLimits.rpm ?? projectLimits.rpm ?? orgLimits.rpm ?? defaultLimits.rpm,
      tpm: keyLimits.tpm ?? projectLimits.tpm ?? orgLimits.tpm ?? defaultLimits.tpm,
      concurrency:
        keyLimits.concurrency ?? projectLimits.concurrency ?? orgLimits.concurrency ?? defaultLimits.concurrency
    };

    const scope: ScopeDescriptor =
      keyLimits.rpm !== undefined || keyLimits.tpm !== undefined || keyLimits.concurrency !== undefined
        ? { scope_type: "api_key", scope_id: ctx.api_key_id }
        : projectLimits.rpm !== undefined || projectLimits.tpm !== undefined || projectLimits.concurrency !== undefined
          ? { scope_type: "project", scope_id: ctx.project_id }
          : { scope_type: "org", scope_id: ctx.org_id };

    return { limits, scope };
  }

  checkAndReserve(ctx: RouterAuthContext, payload: unknown, nowMs = Date.now()): CheckResult {
    const { limits, scope } = this.resolveEffectiveLimits(ctx);
    const tokens = estimateTokens(payload);
    const key = `${scope.scope_type}:${scope.scope_id}`;
    const bucket = minuteBucket(nowMs);
    const prev = this.windows.get(key);
    const window: CounterWindow =
      prev && prev.minuteBucket === bucket
        ? prev
        : {
            minuteBucket: bucket,
            requests: 0,
            tokens: 0,
            inFlight: prev?.inFlight ?? 0
          };

    if (window.inFlight >= limits.concurrency) {
      return {
        allowed: false,
        reason: "concurrency",
        current: window.inFlight,
        limit: limits.concurrency,
        retry_after_seconds: 1,
        limits,
        scope
      };
    }
    if (window.tokens + tokens > limits.tpm) {
      return {
        allowed: false,
        reason: "tpm",
        current: window.tokens + tokens,
        limit: limits.tpm,
        retry_after_seconds: retryAfterSeconds(nowMs),
        limits,
        scope
      };
    }
    if (window.requests + 1 > limits.rpm) {
      return {
        allowed: false,
        reason: "rpm",
        current: window.requests + 1,
        limit: limits.rpm,
        retry_after_seconds: retryAfterSeconds(nowMs),
        limits,
        scope
      };
    }

    window.requests += 1;
    window.tokens += tokens;
    window.inFlight += 1;
    this.windows.set(key, window);

    return {
      allowed: true,
      limits,
      scope,
      release: () => {
        const latest = this.windows.get(key);
        if (!latest) return;
        latest.inFlight = Math.max(0, latest.inFlight - 1);
        this.windows.set(key, latest);
      }
    };
  }

  snapshot(scopeType: ScopeType, scopeId: string) {
    const entry = this.windows.get(`${scopeType}:${scopeId}`);
    return entry ? { ...entry } : null;
  }
}
