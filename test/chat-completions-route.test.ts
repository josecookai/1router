import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { chatCompletionsResponseSchema } from "../src/chat-completions.js";

describe("POST /v1/chat/completions", () => {
  const app = buildApp();

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
      }
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
      }
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
});
