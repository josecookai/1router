import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /api/orgs/:orgId/invoice", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns monthly line items grouped by provider/model", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/orgs/org_demo/invoice?month=2026-02"
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      data: {
        org_id: "org_demo",
        month: "2026-02",
        currency: "USD"
      },
      meta: {
        request_id: res.headers["x-request-id"]
      }
    });
    const payload = res.json() as {
      data: {
        line_items: Array<{ provider: string; model: string; quantity: number; subtotal: number; platform_fee: number }>;
        totals: { quantity: number; subtotal: number; platform_fee: number; grand_total: number };
      };
    };
    expect(payload.data.line_items.length).toBeGreaterThan(0);
    expect(payload.data.line_items[0]?.provider).toBeTruthy();
    const sumSubtotal = payload.data.line_items.reduce((sum, line) => sum + line.subtotal, 0);
    const sumFees = payload.data.line_items.reduce((sum, line) => sum + line.platform_fee, 0);
    expect(Number(sumSubtotal.toFixed(6))).toBe(payload.data.totals.subtotal);
    expect(Number(sumFees.toFixed(6))).toBe(payload.data.totals.platform_fee);
  });

  it("returns INVALID_REQUEST envelope for bad month query", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/orgs/org_demo/invoice?month=2026/02"
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid invoice request",
        request_id: res.headers["x-request-id"]
      }
    });
  });
});
