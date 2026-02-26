import { describe, expect, it } from "vitest";
import {
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
});
