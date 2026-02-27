import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /api/models", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns control-plane models with capability flags", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/models"
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json() as {
      data: Array<{ id: string; provider: string; status: string; capabilities: string[] }>;
      meta: { request_id: string };
    };
    expect(payload.meta.request_id).toBe(res.headers["x-request-id"]);
    expect(payload.data.length).toBeGreaterThan(0);
    expect(payload.data.some((item) => item.capabilities.includes("tools"))).toBe(true);
  });

  it("filters models by provider and status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/models?provider=openai&status=active"
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json() as { data: Array<{ provider: string; status: string }> };
    expect(payload.data.length).toBeGreaterThan(0);
    expect(payload.data.every((item) => item.provider === "openai")).toBe(true);
    expect(payload.data.every((item) => item.status === "active")).toBe(true);
  });

  it("returns 400 for invalid query value", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/models?provider=bad-provider"
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid models list query",
        request_id: res.headers["x-request-id"]
      }
    });
  });
});
