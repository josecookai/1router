import { z } from "zod";
import { buildDefaultProviderAdapterRegistry } from "./provider-adapters.js";

export const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1)
});

export const chatCompletionsRequestSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(chatMessageSchema).min(1),
    stream: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_tokens: z.number().int().positive().optional()
  })
  .strict();

export const chatCompletionsResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number().int().nonnegative(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      message: z.object({
        role: z.literal("assistant"),
        content: z.string()
      }),
      finish_reason: z.literal("stop")
    })
  ),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative()
  }),
  router: z.object({
    provider: z.string(),
    provider_model: z.string(),
    request_id: z.string()
  })
});

export type ChatCompletionsResponse = z.infer<typeof chatCompletionsResponseSchema>;
export type ChatCompletionStreamChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: "assistant"; content?: string };
    finish_reason: "stop" | null;
  }>;
};

const defaultRegistry = buildDefaultProviderAdapterRegistry();

export async function buildChatCompletionsStubResponse(body: unknown, requestId: string): Promise<ChatCompletionsResponse> {
  const parsed = chatCompletionsRequestSchema.parse(body);

  const adapter = defaultRegistry.resolveChatAdapter(parsed.model);
  if (!adapter) {
    throw new Error(`No chat adapter available for model: ${parsed.model}`);
  }

  const result = await adapter.createChatCompletion(parsed);
  const created = Math.floor(Date.now() / 1000);

  return chatCompletionsResponseSchema.parse({
    id: `chatcmpl_${requestId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    object: "chat.completion",
    created,
    model: result.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: result.content
        },
        finish_reason: "stop"
      }
    ],
    usage: result.usage,
    router: {
      provider: result.provider,
      provider_model: result.provider_model,
      request_id: requestId
    }
  });
}

export async function buildChatCompletionsStreamChunks(
  body: unknown,
  requestId: string,
  options?: { signal?: AbortSignal }
): Promise<{ chunks: ChatCompletionStreamChunk[]; done: boolean }> {
  const parsed = chatCompletionsRequestSchema.parse(body);
  const adapter = defaultRegistry.resolveChatAdapter(parsed.model);
  if (!adapter) {
    throw new Error(`No chat adapter available for model: ${parsed.model}`);
  }

  const result = await adapter.createChatCompletion(parsed);
  const created = Math.floor(Date.now() / 1000);
  const id = `chatcmpl_${requestId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const words = result.content.split(/\s+/).filter(Boolean);
  const chunks: ChatCompletionStreamChunk[] = [];

  chunks.push({
    id,
    object: "chat.completion.chunk",
    created,
    model: result.model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
  });

  for (const word of words) {
    if (options?.signal?.aborted) {
      return { chunks, done: false };
    }

    chunks.push({
      id,
      object: "chat.completion.chunk",
      created,
      model: result.model,
      choices: [{ index: 0, delta: { content: `${word} ` }, finish_reason: null }]
    });
  }

  if (options?.signal?.aborted) {
    return { chunks, done: false };
  }

  chunks.push({
    id,
    object: "chat.completion.chunk",
    created,
    model: result.model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
  });

  return { chunks, done: true };
}
