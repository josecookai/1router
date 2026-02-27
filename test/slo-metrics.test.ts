import { describe, expect, it } from "vitest";
import { InMemorySliMetricsStore, sliDashboardQuerySchema, sliDashboardResponseSchema } from "../src/slo-metrics.js";

describe("slo metrics store", () => {
  it("aggregates seeded metrics within the query window", () => {
    const store = new InMemorySliMetricsStore();
    const result = store.aggregateWindow({ windowMinutes: 60, filters: { service: "router-api", env: "prod" } });

    expect(result.request_count).toBeGreaterThan(0);
    expect(result.success_rate).toBeGreaterThanOrEqual(0);
    expect(result.success_rate).toBeLessThanOrEqual(1);
    expect(result.error_rate).toBeGreaterThanOrEqual(0);
    expect(result.p95_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("returns zero-safe aggregates for empty windows", () => {
    const store = new InMemorySliMetricsStore();
    const result = store.aggregateWindow({ windowMinutes: 1, filters: { service: "non-existent" } });

    expect(result).toMatchObject({
      request_count: 0,
      success_rate: 1,
      error_rate: 0,
      p95_latency_ms: 0
    });
  });

  it("rejects unsupported method filter", () => {
    const store = new InMemorySliMetricsStore();
    expect(() => store.aggregateWindow({ windowMinutes: 60, filters: { method: "TRACE" } })).toThrow(
      "unsupported method filter"
    );
  });

  it("validates dashboard query and response schemas", () => {
    const query = sliDashboardQuerySchema.parse({ window_minutes: 30, env: "prod", method: "POST" });
    expect(query.window_minutes).toBe(30);

    const response = sliDashboardResponseSchema.parse({
      data: {
        window_minutes: 30,
        request_count: 10,
        success_rate: 0.9,
        error_rate: 0.1,
        p95_latency_ms: 800
      },
      meta: { request_id: "req_test" }
    });

    expect(response.meta.request_id).toBe("req_test");
  });
});
