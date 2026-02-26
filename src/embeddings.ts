import { z } from "zod";
import { buildDefaultProviderAdapterRegistry } from "./provider-adapters.js";

export const embeddingsRequestSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])
});

export const embeddingsResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(
    z.object({
      object: z.literal("embedding"),
      embedding: z.array(z.number()),
      index: z.number().int().nonnegative()
    })
  ),
  model: z.string(),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative()
  }),
  x_router: z.object({
    provider: z.string(),
    stub: z.literal(true)
  })
});

export type EmbeddingsResponse = z.infer<typeof embeddingsResponseSchema>;

const defaultRegistry = buildDefaultProviderAdapterRegistry();

export async function buildEmbeddingsStubResponse(body: unknown): Promise<EmbeddingsResponse> {
  const parsed = embeddingsRequestSchema.parse(body);
  const adapter = defaultRegistry.resolveEmbeddingsAdapter(parsed.model);

  if (!adapter) {
    throw new Error(`No embeddings adapter available for model: ${parsed.model}`);
  }

  const result = await adapter.createEmbeddings(parsed);

  return embeddingsResponseSchema.parse({
    object: "list",
    data: result.data.map((item) => ({
      object: "embedding",
      embedding: item.embedding,
      index: item.index
    })),
    model: result.model,
    usage: result.usage,
    x_router: {
      provider: result.provider,
      stub: true
    }
  });
}
