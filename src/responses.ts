import { z } from "zod";
import { buildDefaultProviderAdapterRegistry } from "./provider-adapters.js";
import {
  getRoutingPresetWeights,
  selectRoutingCandidate,
  type RoutingCandidateMetrics,
  type RoutingPreset,
  type RoutingRegion
} from "./routing-presets.js";

export const responsesRequestSchema = z
  .object({
    model: z.string().trim().min(1),
    input: z.string().trim().min(1),
    routing_preset: z.enum(["cost", "latency", "success", "balanced"]).optional(),
    region_preference: z.enum(["US", "EU", "APAC"]).optional(),
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
    request_id: z.string(),
    preset: z.enum(["cost", "latency", "success", "balanced"]),
    candidates: z.array(
      z.object({
        provider: z.string(),
        provider_model: z.string(),
        score: z.number(),
        rank: z.number().int().positive()
      })
    ),
    region: z.object({
      requested_region: z.enum(["US", "EU", "APAC"]).nullable(),
      fallback_used: z.boolean(),
      excluded_candidates: z.array(
        z.object({
          provider: z.string(),
          provider_model: z.string(),
          reason: z.literal("REGION_MISMATCH")
        })
      )
    })
  })
});

export type ResponsesResponse = z.infer<typeof responsesResponseSchema>;

export const routingExplainRequestSchema = z
  .object({
    model: z.string().trim().min(1),
    routing_preset: z.enum(["cost", "latency", "success", "balanced"]).optional(),
    region_preference: z.enum(["US", "EU", "APAC"]).optional()
  })
  .strict();

export const routingExplainResponseSchema = z.object({
  request_id: z.string(),
  model: z.string(),
  preset: z.enum(["cost", "latency", "success", "balanced"]),
  weights: z.object({
    cost: z.number(),
    latency: z.number(),
    success: z.number()
  }),
  selected: z.object({
    provider: z.string(),
    provider_model: z.string()
  }),
  region: z.object({
    requested_region: z.enum(["US", "EU", "APAC"]).nullable(),
    fallback_used: z.boolean(),
    excluded_candidates: z.array(
      z.object({
        provider: z.string(),
        provider_model: z.string(),
        reason: z.literal("REGION_MISMATCH")
      })
    )
  }),
  candidates: z.array(
    z.object({
      provider: z.string(),
      provider_model: z.string(),
      regions: z.array(z.enum(["US", "EU", "APAC"])),
      cost_per_1k_usd: z.number(),
      latency_ms: z.number(),
      success_rate: z.number(),
      score: z.number(),
      rank: z.number().int().positive()
    })
  )
});

export type RoutingExplainResponse = z.infer<typeof routingExplainResponseSchema>;

const defaultRegistry = buildDefaultProviderAdapterRegistry();

function buildCandidatePool(model: string): RoutingCandidateMetrics[] {
  const modelProvider = model.split("/", 1)[0] ?? "";
  const singleModelRegions: Record<string, RoutingRegion[]> = {
    openai: ["US", "EU"],
    anthropic: ["US"],
    google: ["APAC"]
  };

  if (model === "router/auto") {
    return [
      {
        provider: "openai",
        provider_model: "openai/gpt-4.1-mini",
        regions: ["US", "EU"],
        cost_per_1k_usd: 0.6,
        latency_ms: 320,
        success_rate: 0.985
      },
      {
        provider: "anthropic",
        provider_model: "anthropic/claude-3-5-sonnet",
        regions: ["US"],
        cost_per_1k_usd: 0.9,
        latency_ms: 410,
        success_rate: 0.994
      },
      {
        provider: "google",
        provider_model: "google/gemini-2.0-flash",
        regions: ["APAC"],
        cost_per_1k_usd: 0.4,
        latency_ms: 240,
        success_rate: 0.965
      }
    ];
  }

  return [
    {
      provider: modelProvider,
      provider_model: model,
      regions: singleModelRegions[modelProvider] ?? ["US", "EU", "APAC"],
      cost_per_1k_usd: 0.5,
      latency_ms: 300,
      success_rate: 0.98
    }
  ];
}

export async function buildResponsesStubResponse(body: unknown, requestId: string): Promise<ResponsesResponse> {
  const parsed = responsesRequestSchema.parse(body);
  const preset: RoutingPreset = parsed.routing_preset ?? "balanced";
  const regionPreference: RoutingRegion | undefined = parsed.region_preference;
  const candidatePool = buildCandidatePool(parsed.model);

  const decision = selectRoutingCandidate(candidatePool, preset, regionPreference);
  const adapter = defaultRegistry.resolveChatAdapter(decision.selected_provider_model);

  if (!adapter) {
    throw new Error(`No responses adapter available for model: ${decision.selected_provider_model}`);
  }

  const completion = await adapter.createChatCompletion({
    model: decision.selected_provider_model,
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
      request_id: requestId,
      preset: decision.preset,
      candidates: decision.candidates.map((candidate) => ({
        provider: candidate.provider,
        provider_model: candidate.provider_model,
        score: candidate.score,
        rank: candidate.rank
      })),
      region: decision.region
    }
  });
}

export function buildRoutingExplainResponse(body: unknown, requestId: string): RoutingExplainResponse {
  const parsed = routingExplainRequestSchema.parse(body);
  const preset: RoutingPreset = parsed.routing_preset ?? "balanced";
  const candidatePool = buildCandidatePool(parsed.model);
  const decision = selectRoutingCandidate(candidatePool, preset, parsed.region_preference);

  return routingExplainResponseSchema.parse({
    request_id: requestId,
    model: parsed.model,
    preset: decision.preset,
    weights: getRoutingPresetWeights(preset),
    selected: {
      provider: decision.selected_provider,
      provider_model: decision.selected_provider_model
    },
    region: decision.region,
    candidates: decision.candidates
  });
}
