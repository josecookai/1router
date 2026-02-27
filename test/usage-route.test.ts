import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { usageReportResponseSchema } from "../src/usage-report.js";

describe("GET /api/orgs/:orgId/usage", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns aggregated usage buckets by hour", async () => {
    const res = await app.inject({
      method: "GET",
      url:
        "/api/orgs/org_demo/usage?from=2026-02-26T10:00:00.000Z&to=2026-02-26T12:00:00.000Z&group_by=hour"
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    const parsed = usageReportResponseSchema.parse(res.json());
    expect(parsed.meta.request_id).toBe(res.headers["x-request-id"]);
    expect(parsed.data.org_id).toBe("org_demo");
    expect(parsed.data.group_by).toBe("hour");
    expect(parsed.data.provisional).toBe(false);
    expect(parsed.data.finalized_at).toBe("2026-02-26T12:00:00.000Z");
    expect(parsed.data.buckets).toHaveLength(2);
    expect(parsed.data.totals.requests).toBe(28);
    expect(parsed.data.totals.provisional).toBe(true);
    expect(parsed.data.summary.provisional).toBe(true);
    expect(parsed.data.summary.finalized_at).toBeNull();
    expect(parsed.data.buckets.some((bucket) => bucket.provisional)).toBe(true);
  });

  it("returns 400 shared error envelope for invalid query params", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/orgs/org_demo/usage?from=bad&to=2026-02-26T12:00:00.000Z&group_by=day"
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid usage report request",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("returns 400 when from is later than to", async () => {
    const res = await app.inject({
      method: "GET",
      url:
        "/api/orgs/org_demo/usage?from=2026-02-26T12:00:00.000Z&to=2026-02-26T10:00:00.000Z&group_by=hour"
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("returns 400 for invalid date format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/orgs/org_demo/usage?from=not-a-date&to=2026-02-26T12:00:00.000Z&group_by=hour"
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("returns 400 for unsupported group_by", async () => {
    const res = await app.inject({
      method: "GET",
      url:
        "/api/orgs/org_demo/usage?from=2026-02-26T10:00:00.000Z&to=2026-02-26T12:00:00.000Z&group_by=day"
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("returns stable empty response for valid range without events", async () => {
    const res = await app.inject({
      method: "GET",
      url:
        "/api/orgs/org_demo/usage?from=2026-02-26T13:00:00.000Z&to=2026-02-26T14:00:00.000Z&group_by=hour"
    });

    expect(res.statusCode).toBe(200);
    const parsed = usageReportResponseSchema.parse(res.json());
    expect(parsed.data.buckets).toEqual([]);
    expect(parsed.data.totals.requests).toBe(0);
    expect(parsed.data.totals.total_tokens).toBe(0);
    expect(parsed.data.totals.cost_usd).toBe(0);
    expect(parsed.data.totals.platform_fee_usd).toBe(0);
  });
});
