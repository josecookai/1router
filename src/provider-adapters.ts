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

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionInput = {
  model: string;
  messages: ChatCompletionMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
};

export type ChatCompletionProviderResult = {
  provider: string;
  provider_model: string;
  model: string;
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export interface ProviderAdapter {
  readonly provider: string;
  supportsEmbeddings(model: string): boolean;
  createEmbeddings(request: EmbeddingsInput): Promise<EmbeddingsProviderResult>;
  supportsChatCompletions(model: string): boolean;
  createChatCompletion(request: ChatCompletionInput): Promise<ChatCompletionProviderResult>;
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

  resolveChatAdapter(model: string) {
    const provider = model.split("/", 1)[0] ?? "";
    const adapter = this.adapters.get(provider);

    if (!adapter || !adapter.supportsChatCompletions(model)) {
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

  supportsChatCompletions(model: string) {
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

  async createChatCompletion(request: ChatCompletionInput): Promise<ChatCompletionProviderResult> {
    const prompt = request.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const content = `Stub response: ${lastUserMessage || "ok"}`;
    const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
    const completionTokens = Math.max(1, Math.ceil(content.length / 4));

    return {
      provider: this.provider,
      provider_model: request.model,
      model: request.model,
      content,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    };
  }
}

export function buildDefaultProviderAdapterRegistry() {
  const registry = new ProviderAdapterRegistry();
  registry.register(new OpenAIStubProviderAdapter());
  return registry;
}
