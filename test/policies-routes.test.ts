import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("ui control-plane endpoints", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/models returns control-plane catalog shape", async () => {
    const res = await app.inject({ method: "GET", url: "/api/models" });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(body.meta.request_id).toBe(res.headers["x-request-id"]);
    expect(body.data[0]).toMatchObject({
      id: expect.any(String),
      provider: expect.any(String),
      capabilities: expect.any(Array)
    });
  });

  it("POST /api/policies then GET /api/policies works with in-memory storage", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/policies",
      payload: {
        name: "ui-policy",
        route: "/v1/chat/completions",
        status: "active",
        weights: [
          { provider: "openai", value: 0.8 },
          { provider: "anthropic", value: 0.2 }
        ],
        fallback_chain: ["anthropic"],
        constraints: { max_latency_ms: 2500 }
      }
    });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.headers["x-request-id"]).toBeTruthy();
    expect(createRes.json()).toMatchObject({
      data: {
        id: expect.any(String),
        name: "ui-policy",
        route: "/v1/chat/completions",
        status: "active",
        weights: [
          { provider: "openai", value: 0.8 },
          { provider: "anthropic", value: 0.2 }
        ],
        fallback_chain: ["anthropic"],
        constraints: { max_latency_ms: 2500 }
      },
      meta: {
        request_id: createRes.headers["x-request-id"]
      }
    });

    const listRes = await app.inject({ method: "GET", url: "/api/policies" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.some((policy: { name: string }) => policy.name === "ui-policy")).toBe(true);
  });

  it("POST /api/policies returns shared validation error envelope", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/policies",
      payload: {
        name: "bad",
        route: "/v1/chat/completions",
        weights: [],
        fallback_chain: [""],
        constraints: {}
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid policy payload",
        request_id: res.headers["x-request-id"]
      }
    });
  });
});
