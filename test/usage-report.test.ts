import { describe, expect, it } from "vitest";
import {
  FixtureUsageRepository,
  buildUsageReportResponse,
  runUsageFinalizationJob,
  usageQuerySchema,
  type UsageEvent
} from "../src/usage-report.js";

describe("usage report query validation", () => {
  it("accepts valid params and defaults group_by", () => {
    const parsed = usageQuerySchema.parse({
      from: "2026-02-26T10:00:00.000Z",
      to: "2026-02-26T12:00:00.000Z"
    });

    expect(parsed.group_by).toBe("hour");
  });

  it("rejects inverted range", () => {
    expect(() =>
      usageQuerySchema.parse({
        from: "2026-02-26T12:00:00.000Z",
        to: "2026-02-26T10:00:00.000Z",
        group_by: "hour"
      })
    ).toThrow();
  });
});

describe("usage report aggregation", () => {
  it("aggregates fixture events by model", () => {
    const repo = new FixtureUsageRepository();
    const result = buildUsageReportResponse(repo, {
      orgId: "org_demo",
      requestId: "req_usage_1",
      query: {
        from: "2026-02-26T10:00:00.000Z",
        to: "2026-02-26T12:00:00.000Z",
        group_by: "model"
      }
    });

    expect(result.data.group_by).toBe("model");
    expect(result.data.provisional).toBe(false);
    expect(result.data.finalized_at).toBe("2026-02-26T12:00:00.000Z");
    expect(result.data.buckets).toHaveLength(2);
    expect(result.data.totals.requests).toBe(28);
    expect(result.data.totals.total_tokens).toBe(3240);
    expect(result.data.totals.provisional).toBe(true);
    expect(result.data.totals.finalized_at).toBeNull();
    expect(result.data.summary.provisional).toBe(true);
    expect(result.data.summary.finalized_at).toBeNull();
    expect(result.data.summary.totals.total_tokens).toBe(3240);
  });

  it("marks future window as provisional", () => {
    const repo = new FixtureUsageRepository();
    const result = buildUsageReportResponse(repo, {
      orgId: "org_demo",
      requestId: "req_usage_2",
      query: {
        from: "2999-01-01T00:00:00.000Z",
        to: "2999-01-01T01:00:00.000Z",
        group_by: "hour"
      }
    });

    expect(result.data.provisional).toBe(true);
    expect(result.data.finalized_at).toBeNull();
  });
});

describe("usage finalization job", () => {
  const mixedEvents: UsageEvent[] = [
    {
      org_id: "org_demo",
      ts: "2026-02-26T10:00:00.000Z",
      model: "openai/gpt-4.1-mini",
      finalized_at: null,
      requests: 5,
      input_tokens: 500,
      output_tokens: 200,
      cost_usd: 0.05,
      platform_fee_usd: 0.01
    },
    {
      org_id: "org_demo",
      ts: "2026-02-26T11:30:00.000Z",
      model: "openai/gpt-4.1-mini",
      finalized_at: null,
      requests: 3,
      input_tokens: 300,
      output_tokens: 120,
      cost_usd: 0.03,
      platform_fee_usd: 0.006
    },
    {
      org_id: "org_demo",
      ts: "2026-02-26T09:00:00.000Z",
      model: "openai/text-embedding-3-small",
      finalized_at: "2026-02-26T09:30:00.000Z",
      requests: 4,
      input_tokens: 240,
      output_tokens: 0,
      cost_usd: 0.01,
      platform_fee_usd: 0.002
    }
  ];

  it("finalizes eligible provisional usage records", () => {
    const repo = new FixtureUsageRepository(structuredClone(mixedEvents));
    const result = runUsageFinalizationJob(repo, {
      nowIso: "2026-02-26T12:00:00.000Z",
      reconciliationDelayMinutes: 60
    });

    expect(result.cutoff_iso).toBe("2026-02-26T11:00:00.000Z");
    expect(result.finalized).toBe(1);

    const report = buildUsageReportResponse(repo, {
      orgId: "org_demo",
      requestId: "req_finalized_1",
      query: {
        from: "2026-02-26T09:00:00.000Z",
        to: "2026-02-26T12:00:00.000Z",
        group_by: "hour"
      }
    });
    const finalizedBucket = report.data.buckets.find((bucket) => bucket.bucket === "2026-02-26T10:00:00.000Z");
    expect(finalizedBucket?.provisional).toBe(false);
    expect(finalizedBucket?.finalized_at).toBe("2026-02-26T12:00:00.000Z");
  });

  it("is idempotent on rerun and makes no-op updates", () => {
    const repo = new FixtureUsageRepository(structuredClone(mixedEvents));
    const first = runUsageFinalizationJob(repo, {
      nowIso: "2026-02-26T12:00:00.000Z",
      reconciliationDelayMinutes: 60
    });
    const second = runUsageFinalizationJob(repo, {
      nowIso: "2026-02-26T12:05:00.000Z",
      reconciliationDelayMinutes: 60
    });

    expect(first.finalized).toBe(1);
    expect(second.finalized).toBe(0);
  });

  it("keeps mixed dataset semantics (new provisional remains provisional)", () => {
    const repo = new FixtureUsageRepository(structuredClone(mixedEvents));
    runUsageFinalizationJob(repo, {
      nowIso: "2026-02-26T12:00:00.000Z",
      reconciliationDelayMinutes: 60
    });

    const report = buildUsageReportResponse(repo, {
      orgId: "org_demo",
      requestId: "req_finalized_2",
      query: {
        from: "2026-02-26T09:00:00.000Z",
        to: "2026-02-26T12:00:00.000Z",
        group_by: "hour"
      }
    });

    const provisionalBucket = report.data.buckets.find((bucket) => bucket.bucket === "2026-02-26T11:00:00.000Z");
    expect(provisionalBucket?.provisional).toBe(true);
    expect(provisionalBucket?.finalized_at).toBeNull();
    expect(report.data.totals.provisional).toBe(true);
  });
});
