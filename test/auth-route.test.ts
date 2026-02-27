import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryApiKeyStore } from "../src/api-keys.js";
import { buildApp } from "../src/app.js";

describe("router bearer auth middleware", () => {
  const apiKeyStore = new InMemoryApiKeyStore();
  const { plaintext } = apiKeyStore.create({ provider: "router", label: "auth-test" });
  const app = buildApp({ apiKeyStore });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 when bearer header is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/models" });
    expect(res.statusCode).toBe(401);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "UNAUTHORIZED",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("returns 401 when bearer header is malformed", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when bearer token is invalid", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer rk_live_invalid" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 when bearer token is valid", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: `Bearer ${plaintext}` }
    });
    expect(res.statusCode).toBe(200);
  });
});
