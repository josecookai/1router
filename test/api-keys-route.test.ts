import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryApiKeyStore, apiKeysListResponseSchema, createApiKeyResponseSchema } from "../src/api-keys.js";
import { buildApp } from "../src/app.js";

describe("/api/keys routes", () => {
  const store = new InMemoryApiKeyStore();
  const app = buildApp({ apiKeyStore: store });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a key and only returns plaintext at creation time", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/keys",
      payload: { provider: "openai", label: "prod-openai" }
    });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.headers["x-request-id"]).toBeTruthy();
    const created = createApiKeyResponseSchema.parse(createRes.json());

    expect(created.meta.request_id).toBe(createRes.headers["x-request-id"]);
    expect(created.data.key.startsWith("rk_live_")).toBe(true);
    expect(created.data.provider).toBe("openai");

    const listRes = await app.inject({ method: "GET", url: "/api/keys" });
    expect(listRes.statusCode).toBe(200);
    const listed = apiKeysListResponseSchema.parse(listRes.json());

    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toMatchObject({
      id: created.data.id,
      provider: "openai",
      label: "prod-openai",
      last4: created.data.last4,
      status: "active"
    });
    expect(JSON.stringify(listed)).not.toContain(created.data.key);
    expect(JSON.stringify(store.snapshotStoredRecords())).not.toContain(created.data.key);
  });

  it("returns 400 for invalid create payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/keys",
      payload: { provider: "", label: "" }
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid API key create request",
        request_id: res.headers["x-request-id"]
      }
    });
  });
});
