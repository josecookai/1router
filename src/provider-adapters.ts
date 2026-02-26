import { z } from "zod";

export const embeddingsInputSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])
});

export type EmbeddingsInput = z.infer<typeof embeddingsInputSchema>;

export type EmbeddingVector = number[];

export type EmbeddingsProviderResult = {
  provider: string;
  model: string;
  data: Array<{
    embedding: EmbeddingVector;
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
};

export interface ProviderAdapter {
  readonly provider: string;
  supportsEmbeddings(model: string): boolean;
  createEmbeddings(request: EmbeddingsInput): Promise<EmbeddingsProviderResult>;
}

export class ProviderAdapterRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter) {
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: string) {
    return this.adapters.get(provider);
  }

  resolveEmbeddingsAdapter(model: string) {
    const provider = model.split("/", 1)[0] ?? "";
    const adapter = this.adapters.get(provider);

    if (!adapter || !adapter.supportsEmbeddings(model)) {
      return null;
    }

    return adapter;
  }
}

function estimateTokens(inputs: string[]) {
  const chars = inputs.reduce((sum, item) => sum + item.length, 0);
  return Math.max(1, Math.ceil(chars / 4));
}

function stubEmbeddingForText(text: string) {
  const bytes = Array.from(text).map((char) => char.charCodeAt(0));
  const sum = bytes.reduce((acc, n) => acc + n, 0);
  const len = Math.max(1, text.length);

  return [Number((sum / 1000).toFixed(6)), Number((len / 100).toFixed(6)), Number(((sum % 97) / 97).toFixed(6))];
}

export class OpenAIStubProviderAdapter implements ProviderAdapter {
  readonly provider = "openai";

  supportsEmbeddings(model: string) {
    return model.startsWith("openai/");
  }

  async createEmbeddings(request: EmbeddingsInput): Promise<EmbeddingsProviderResult> {
    const parsed = embeddingsInputSchema.parse(request);
    const inputs = Array.isArray(parsed.input) ? parsed.input : [parsed.input];

    return {
      provider: this.provider,
      model: parsed.model,
      data: inputs.map((value, index) => ({
        embedding: stubEmbeddingForText(value),
        index
      })),
      usage: {
        prompt_tokens: estimateTokens(inputs),
        total_tokens: estimateTokens(inputs)
      }
    };
  }
}

export function buildDefaultProviderAdapterRegistry() {
  const registry = new ProviderAdapterRegistry();
  registry.register(new OpenAIStubProviderAdapter());
  return registry;
}
