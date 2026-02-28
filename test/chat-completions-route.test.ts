import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryApiKeyStore } from "../src/api-keys.js";
import { buildChatCompletionsStreamChunks, chatCompletionsResponseSchema } from "../src/chat-completions.js";

describe("POST /v1/chat/completions", () => {
  const apiKeyStore = new InMemoryApiKeyStore();
  const { plaintext } = apiKeyStore.create({ provider: "router", label: "test" });
  const app = buildApp({ apiKeyStore });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns an OpenAI-compatible non-streaming chat completion stub", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "openai/gpt-4.1-mini",
        messages: [{ role: "user", content: "Say hi" }],
        stream: false,
        temperature: 0.7
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    const parsed = chatCompletionsResponseSchema.parse(res.json());
    expect(parsed.object).toBe("chat.completion");
    expect(parsed.choices[0]?.message.role).toBe("assistant");
    expect(parsed.router.provider).toBe("openai");
    expect(parsed.router.provider_model).toBe("openai/gpt-4.1-mini");
    expect(parsed.router.request_id).toBe(res.headers["x-request-id"]);
  });

  it("returns shared error envelope for invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "",
        messages: [],
        stream: true
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid chat completions request",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("returns SSE chunks for stream=true in OpenAI chunk format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "openai/gpt-4.1-mini",
        messages: [{ role: "user", content: "Say hi" }],
        stream: true
      },
      headers: { authorization: `Bearer ${plaintext}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("data: ");
    expect(res.body).toContain("\"object\":\"chat.completion.chunk\"");
    expect(res.body).toContain("data: [DONE]");
  });

  it("stops emitting chunks after disconnect signal", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const result = await buildChatCompletionsStreamChunks(
      {
        model: "openai/gpt-4.1-mini",
        messages: [{ role: "user", content: "Say hi" }],
        stream: true
      },
      "req_abort_1",
      { signal: abortController.signal }
    );

    expect(result.done).toBe(false);
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0]?.choices[0]?.delta.role).toBe("assistant");
  });
});
