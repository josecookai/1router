import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { embeddingsResponseSchema } from "../src/embeddings.js";

describe("POST /v1/embeddings", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns an OpenAI-compatible embeddings stub response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "openai/text-embedding-3-small",
        input: ["hello", "world"]
      }
    });

    expect(res.statusCode).toBe(200);
    const parsed = embeddingsResponseSchema.parse(res.json());

    expect(parsed.object).toBe("list");
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0]?.object).toBe("embedding");
    expect(parsed.x_router).toEqual({ provider: "openai", stub: true });
  });

  it("returns 400 for invalid payloads", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "",
        input: []
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid embeddings request",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("returns 400 for unsupported model providers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "anthropic/text-embedding-foo",
        input: "hello"
      }
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
});
