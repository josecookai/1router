import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryApiKeyStore } from "../src/api-keys.js";
import { buildApp } from "../src/app.js";

describe("POST /v1/routing/decision/explain", () => {
  const apiKeyStore = new InMemoryApiKeyStore();
  const { plaintext } = apiKeyStore.create({ provider: "router", label: "test" });
  const app = buildApp({ apiKeyStore });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns explain trace with weights and ranked candidates", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/routing/decision/explain",
      payload: {
        model: "router/auto",
        routing_preset: "success",
        region_preference: "EU"
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();

    const body = res.json();
    expect(body.request_id).toBe(res.headers["x-request-id"]);
    expect(body.preset).toBe("success");
    expect(body.weights).toEqual({ cost: 0.1, latency: 0.1, success: 0.8 });
    expect(body.selected.provider).toBe("openai");
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].rank).toBe(1);
    expect(body.region.requested_region).toBe("EU");
    expect(body.region.excluded_candidates).toHaveLength(2);
  });

  it("does not leak bearer token or credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/routing/decision/explain",
      payload: {
        model: "openai/gpt-4.1-mini"
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    const serialized = JSON.stringify(res.json());
    expect(serialized.includes(plaintext)).toBe(false);
    expect(serialized.includes("Bearer")).toBe(false);
    expect(serialized.includes("key_hash")).toBe(false);
  });

  it("returns shared invalid request envelope for malformed payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/routing/decision/explain",
      payload: {
        model: "",
        region_preference: "AFRICA"
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        request_id: res.headers["x-request-id"]
      }
    });
  });
});
