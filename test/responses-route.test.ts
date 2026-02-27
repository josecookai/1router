import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryApiKeyStore } from "../src/api-keys.js";
import { buildApp } from "../src/app.js";
import { responsesResponseSchema } from "../src/responses.js";

describe("POST /v1/responses", () => {
  const apiKeyStore = new InMemoryApiKeyStore();
  const { plaintext } = apiKeyStore.create({ provider: "router", label: "test" });
  const app = buildApp({ apiKeyStore });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns minimal non-streaming response payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "openai/gpt-4.1-mini",
        input: "Say hi",
        stream: false
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    const parsed = responsesResponseSchema.parse(res.json());
    expect(parsed.object).toBe("response");
    expect(parsed.output[0]?.type).toBe("message");
    expect(parsed.output[0]?.content[0]?.type).toBe("output_text");
    expect(parsed.router.request_id).toBe(res.headers["x-request-id"]);
  });

  it("returns shared error envelope for invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "",
        input: ""
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid responses request",
        request_id: res.headers["x-request-id"]
      }
    });
  });
});
