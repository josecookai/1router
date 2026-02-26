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
    stream: z.literal(false).optional(),
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
