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

const simulatedFailureCount = new Map<string, number>();

type SimulatedFailureDirective = {
  provider: string;
  mode: "once" | "always";
  kind: "timeout" | "429" | "500";
};

function parseSimulatedFailureDirective(input: string): SimulatedFailureDirective | null {
  const match = input.match(/\[fail:([a-z0-9_-]+):(once|always):(timeout|429|500)\]/i);
  if (!match) return null;
  return {
    provider: match[1]!.toLowerCase(),
    mode: match[2] as "once" | "always",
    kind: match[3] as "timeout" | "429" | "500"
  };
}

function maybeThrowSimulatedFailure(provider: string, model: string, userInput: string) {
  const directive = parseSimulatedFailureDirective(userInput);
  if (!directive || directive.provider !== provider) return;

  const key = `${provider}:${model}:${userInput}:${directive.mode}:${directive.kind}`;
  const count = simulatedFailureCount.get(key) ?? 0;
  if (directive.mode === "once" && count > 0) return;
  simulatedFailureCount.set(key, count + 1);

  if (directive.kind === "timeout") {
    const error = new Error(`Simulated timeout from ${provider}`);
    (error as Error & { code?: string }).code = "ETIMEDOUT";
    throw error;
  }

  const statusCode = directive.kind === "429" ? 429 : 500;
  const error = new Error(`Simulated upstream ${statusCode} from ${provider}`);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

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
    maybeThrowSimulatedFailure(this.provider, request.model, lastUserMessage);
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

export class AnthropicStubProviderAdapter implements ProviderAdapter {
  readonly provider = "anthropic";

  supportsEmbeddings(_model: string) {
    return false;
  }

  supportsChatCompletions(model: string) {
    return model.startsWith("anthropic/");
  }

  async createEmbeddings(): Promise<EmbeddingsProviderResult> {
    throw new Error("Embeddings not supported for anthropic stub");
  }

  async createChatCompletion(request: ChatCompletionInput): Promise<ChatCompletionProviderResult> {
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    maybeThrowSimulatedFailure(this.provider, request.model, lastUserMessage);
    const content = `Anthropic stub: ${lastUserMessage || "ok"}`;

    return {
      provider: this.provider,
      provider_model: request.model,
      model: request.model,
      content,
      usage: {
        prompt_tokens: Math.max(1, Math.ceil(lastUserMessage.length / 4)),
        completion_tokens: Math.max(1, Math.ceil(content.length / 4)),
        total_tokens: Math.max(2, Math.ceil((lastUserMessage.length + content.length) / 4))
      }
    };
  }
}

export class GoogleStubProviderAdapter implements ProviderAdapter {
  readonly provider = "google";

  supportsEmbeddings(_model: string) {
    return false;
  }

  supportsChatCompletions(model: string) {
    return model.startsWith("google/");
  }

  async createEmbeddings(): Promise<EmbeddingsProviderResult> {
    throw new Error("Embeddings not supported for google stub");
  }

  async createChatCompletion(request: ChatCompletionInput): Promise<ChatCompletionProviderResult> {
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    maybeThrowSimulatedFailure(this.provider, request.model, lastUserMessage);
    const content = `Google stub: ${lastUserMessage || "ok"}`;

    return {
      provider: this.provider,
      provider_model: request.model,
      model: request.model,
      content,
      usage: {
        prompt_tokens: Math.max(1, Math.ceil(lastUserMessage.length / 4)),
        completion_tokens: Math.max(1, Math.ceil(content.length / 4)),
        total_tokens: Math.max(2, Math.ceil((lastUserMessage.length + content.length) / 4))
      }
    };
  }
}

export function buildDefaultProviderAdapterRegistry() {
  const registry = new ProviderAdapterRegistry();
  registry.register(new OpenAIStubProviderAdapter());
  registry.register(new AnthropicStubProviderAdapter());
  registry.register(new GoogleStubProviderAdapter());
  return registry;
}
