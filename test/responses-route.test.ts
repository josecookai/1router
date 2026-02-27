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

  it("returns shared error envelope for unsupported model", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "anthropic/claude-3-5-sonnet",
        input: "hello"
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "UNSUPPORTED_MODEL",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("replays same logical response for same idempotency key and payload", async () => {
    const payload = {
      model: "openai/gpt-4.1-mini",
      input: "Say hi",
      stream: false as const
    };

    const first = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload,
      headers: {
        authorization: `Bearer ${plaintext}`,
        "idempotency-key": "idem_001"
      }
    });
    const replay = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload,
      headers: {
        authorization: `Bearer ${plaintext}`,
        "idempotency-key": "idem_001"
      }
    });

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers["x-idempotent-replay"]).toBe("true");
    expect(replay.json()).toEqual(first.json());
  });

  it("returns conflict for same idempotency key with different payload", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "openai/gpt-4.1-mini",
        input: "First request"
      },
      headers: {
        authorization: `Bearer ${plaintext}`,
        "idempotency-key": "idem_002"
      }
    });
    const conflict = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "openai/gpt-4.1-mini",
        input: "Changed request"
      },
      headers: {
        authorization: `Bearer ${plaintext}`,
        "idempotency-key": "idem_002"
      }
    });

    expect(first.statusCode).toBe(200);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.headers["x-request-id"]).toBeTruthy();
    expect(conflict.json()).toMatchObject({
      error: {
        code: "IDEMPOTENCY_KEY_CONFLICT",
        request_id: conflict.headers["x-request-id"]
      }
    });
  });
});
