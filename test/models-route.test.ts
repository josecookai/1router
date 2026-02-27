import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryApiKeyStore } from "../src/api-keys.js";
import { modelsListResponseSchema } from "../src/models-catalog.js";

describe("GET /v1/models", () => {
  const apiKeyStore = new InMemoryApiKeyStore();
  const { plaintext } = apiKeyStore.create({ provider: "router", label: "test" });
  const app = buildApp({ apiKeyStore });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns an OpenAI-compatible model list payload", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    const parsed = modelsListResponseSchema.parse(json);

    expect(parsed.object).toBe("list");
    expect(parsed.data.some((m) => m.x_router.capabilities.tools)).toBe(true);
  });
});
