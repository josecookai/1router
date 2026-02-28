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
    expect(parsed.router.preset).toBe("balanced");
    expect(parsed.router.candidates.length).toBeGreaterThan(0);
    expect(parsed.router.candidates[0]?.rank).toBe(1);
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
        model: "mistral/mistral-large",
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

  it("returns selected routing preset metadata for auto model", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "router/auto",
        input: "Pick provider",
        routing_preset: "success"
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    const parsed = responsesResponseSchema.parse(res.json());
    expect(parsed.router.preset).toBe("success");
    expect(parsed.router.provider).toBe("anthropic");
    expect(parsed.router.candidates[0]?.provider).toBe("anthropic");
  });

  it("applies region preference when compliant candidates exist", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "router/auto",
        input: "Pick EU provider",
        routing_preset: "cost",
        region_preference: "EU"
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    const parsed = responsesResponseSchema.parse(res.json());
    expect(parsed.router.region.requested_region).toBe("EU");
    expect(parsed.router.region.fallback_used).toBe(false);
    expect(parsed.router.provider).toBe("openai");
    expect(parsed.router.candidates).toHaveLength(1);
    expect(parsed.router.region.excluded_candidates).toHaveLength(2);
  });

  it("falls back when no candidate matches region preference", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "anthropic/claude-3-5-sonnet",
        input: "Pick provider with fallback",
        routing_preset: "success",
        region_preference: "EU"
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    const parsed = responsesResponseSchema.parse(res.json());
    expect(parsed.router.region.requested_region).toBe("EU");
    expect(parsed.router.region.fallback_used).toBe(true);
    expect(parsed.router.provider).toBe("anthropic");
    expect(parsed.router.candidates[0]?.provider).toBe("anthropic");
    expect(parsed.router.region.excluded_candidates[0]?.reason).toBe("REGION_MISMATCH");
  });

  it("retries transient upstream failure and succeeds within bounded attempts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "openai/gpt-4.1-mini",
        input: "hello [fail:openai:once:429]"
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    const parsed = responsesResponseSchema.parse(res.json());
    expect(parsed.router.provider).toBe("openai");
    expect(parsed.router.retry.max_attempts_per_candidate).toBe(2);
    expect(parsed.router.retry.attempt_count).toBe(2);
    expect(parsed.router.retry.failover_count).toBe(0);
    expect(parsed.router.retry.stop_reason).toBe("success");
    expect(parsed.router.retry.attempts[0]?.outcome).toBe("retryable_error");
    expect(parsed.router.retry.attempts[1]?.outcome).toBe("success");
  });

  it("fails over to secondary candidate when primary exhausts retries", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: {
        model: "router/auto",
        input: "hello [fail:anthropic:always:500]",
        routing_preset: "success"
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    const parsed = responsesResponseSchema.parse(res.json());
    expect(parsed.router.provider).toBe("openai");
    expect(parsed.router.retry.failover_count).toBe(1);
    expect(parsed.router.retry.attempt_count).toBe(3);
    expect(parsed.router.retry.stop_reason).toBe("success");
    expect(parsed.router.retry.attempts[0]?.provider).toBe("anthropic");
    expect(parsed.router.retry.attempts[0]?.outcome).toBe("retryable_error");
    expect(parsed.router.retry.attempts[1]?.provider).toBe("anthropic");
    expect(parsed.router.retry.attempts[1]?.outcome).toBe("retryable_error");
    expect(parsed.router.retry.attempts[2]?.provider).toBe("openai");
    expect(parsed.router.retry.attempts[2]?.outcome).toBe("success");
  });
});
