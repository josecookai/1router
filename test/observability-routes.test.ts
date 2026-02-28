import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("observability control-plane routes", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/infra/slo returns provider SLI snapshot schema", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/infra/slo?window_minutes=60&env=prod&method=POST"
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { request_count: number; success_rate: number; error_rate: number; p95_latency_ms: number };
      meta: { request_id: string };
    };
    expect(body.meta.request_id).toBe(res.headers["x-request-id"]);
    expect(body.data.request_count).toBeGreaterThanOrEqual(0);
    expect(body.data.success_rate).toBeGreaterThanOrEqual(0);
    expect(body.data.success_rate).toBeLessThanOrEqual(1);
    expect(body.data.error_rate).toBeGreaterThanOrEqual(0);
    expect(body.data.error_rate).toBeLessThanOrEqual(1);
    expect(body.data.p95_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("GET /api/infra/traces redacts sensitive prompt payload by default", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/infra/traces?limit=2"
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: Array<{ prompt_preview: string }>;
      meta: { request_id: string };
    };
    expect(body.meta.request_id).toBe(res.headers["x-request-id"]);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((item) => item.prompt_preview === "[REDACTED]")).toBe(true);
  });

  it("GET /api/infra/traces supports provider filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/infra/traces?provider=anthropic&redact=false"
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ provider: string; prompt_preview: string }> };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((item) => item.provider === "anthropic")).toBe(true);
    expect(body.data.some((item) => item.prompt_preview !== "[REDACTED]")).toBe(true);
  });
});
