import { describe, expect, it } from "vitest";
import {
  AnthropicStubProviderAdapter,
  GoogleStubProviderAdapter,
  OpenAIStubProviderAdapter,
  ProviderAdapterRegistry,
  buildDefaultProviderAdapterRegistry
} from "../src/provider-adapters.js";

describe("provider adapter registry", () => {
  it("resolves an embeddings adapter by model provider prefix", () => {
    const registry = buildDefaultProviderAdapterRegistry();
    const adapter = registry.resolveEmbeddingsAdapter("openai/text-embedding-3-small");

    expect(adapter?.provider).toBe("openai");
  });

  it("returns null when no adapter supports the model", () => {
    const registry = new ProviderAdapterRegistry();
    registry.register(new OpenAIStubProviderAdapter());

    expect(registry.resolveEmbeddingsAdapter("anthropic/claude-3-5-sonnet")).toBeNull();
  });

  it("registers chat-capable stub adapters for multiple providers", () => {
    const registry = buildDefaultProviderAdapterRegistry();
    expect(registry.resolveChatAdapter("openai/gpt-4.1-mini")?.provider).toBe("openai");
    expect(registry.resolveChatAdapter("anthropic/claude-3-5-sonnet")?.provider).toBe("anthropic");
    expect(registry.resolveChatAdapter("google/gemini-2.0-flash")?.provider).toBe("google");
  });
});

describe("openai stub embeddings adapter", () => {
  it("creates deterministic embedding rows for string and array input", async () => {
    const adapter = new OpenAIStubProviderAdapter();

    const single = await adapter.createEmbeddings({
      model: "openai/text-embedding-3-small",
      input: "hello"
    });
    const batch = await adapter.createEmbeddings({
      model: "openai/text-embedding-3-small",
      input: ["hello", "world"]
    });

    expect(single.data).toHaveLength(1);
    expect(single.data[0]?.embedding).toHaveLength(3);
    expect(batch.data.map((row) => row.index)).toEqual([0, 1]);
    expect(batch.usage.total_tokens).toBeGreaterThan(0);
  });

  it("creates a non-streaming chat completion stub", async () => {
    const adapter = new OpenAIStubProviderAdapter();

    const result = await adapter.createChatCompletion({
      model: "openai/gpt-4.1-mini",
      messages: [{ role: "user", content: "Hello there" }],
      stream: false
    });

    expect(result.provider).toBe("openai");
    expect(result.provider_model).toBe("openai/gpt-4.1-mini");
    expect(result.content).toContain("Hello there");
    expect(result.usage.total_tokens).toBeGreaterThan(0);
  });
});

describe("non-openai chat stub adapters", () => {
  it("returns anthropic and google chat stub payloads", async () => {
    const anthropic = new AnthropicStubProviderAdapter();
    const google = new GoogleStubProviderAdapter();

    const a = await anthropic.createChatCompletion({
      model: "anthropic/claude-3-5-sonnet",
      messages: [{ role: "user", content: "hello" }]
    });
    const g = await google.createChatCompletion({
      model: "google/gemini-2.0-flash",
      messages: [{ role: "user", content: "hello" }]
    });

    expect(a.provider).toBe("anthropic");
    expect(g.provider).toBe("google");
  });
});
