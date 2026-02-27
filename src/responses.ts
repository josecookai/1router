import { z } from "zod";
import { buildDefaultProviderAdapterRegistry } from "./provider-adapters.js";

export const responsesRequestSchema = z
  .object({
    model: z.string().min(1),
    input: z.string().min(1),
    stream: z.literal(false).optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_output_tokens: z.number().int().positive().optional()
  })
  .strict();

export const responsesResponseSchema = z.object({
  id: z.string(),
  object: z.literal("response"),
  created: z.number().int().nonnegative(),
  model: z.string(),
  output: z.array(
    z.object({
      type: z.literal("message"),
      role: z.literal("assistant"),
      content: z.array(
        z.object({
          type: z.literal("output_text"),
          text: z.string()
        })
      )
    })
  ),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative()
  }),
  router: z.object({
    provider: z.string(),
    provider_model: z.string(),
    request_id: z.string()
  })
});

export type ResponsesResponse = z.infer<typeof responsesResponseSchema>;

const defaultRegistry = buildDefaultProviderAdapterRegistry();

export async function buildResponsesStubResponse(body: unknown, requestId: string): Promise<ResponsesResponse> {
  const parsed = responsesRequestSchema.parse(body);
  const adapter = defaultRegistry.resolveChatAdapter(parsed.model);

  if (!adapter) {
    throw new Error(`No responses adapter available for model: ${parsed.model}`);
  }

  const completion = await adapter.createChatCompletion({
    model: parsed.model,
    messages: [{ role: "user", content: parsed.input }],
    stream: false,
    temperature: parsed.temperature,
    max_tokens: parsed.max_output_tokens
  });

  return responsesResponseSchema.parse({
    id: `resp_${requestId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    object: "response",
    created: Math.floor(Date.now() / 1000),
    model: completion.model,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: completion.content }]
      }
    ],
    usage: {
      input_tokens: completion.usage.prompt_tokens,
      output_tokens: completion.usage.completion_tokens,
      total_tokens: completion.usage.total_tokens
    },
    router: {
      provider: completion.provider,
      provider_model: completion.provider_model,
      request_id: requestId
    }
  });
}
