import { describe, expect, it } from "vitest";
import { FixtureUsageRepository, buildUsageReportResponse, usageQuerySchema } from "../src/usage-report.js";

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
    expect(result.data.buckets).toHaveLength(2);
    expect(result.data.totals.requests).toBe(28);
    expect(result.data.totals.total_tokens).toBe(3240);
  });
});
