import { z } from "zod";

const routerCapabilitiesSchema = z.object({
  tools: z.boolean(),
  vision: z.boolean(),
  json_schema: z.boolean()
});

const routerExtensionSchema = z.object({
  provider: z.string(),
  capabilities: routerCapabilitiesSchema
});

export const modelSchema = z.object({
  id: z.string(),
  object: z.literal("model"),
  created: z.number().int().nonnegative(),
  owned_by: z.string(),
  x_router: routerExtensionSchema
});

export const modelsListResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(modelSchema).min(1)
});

export type ModelsListResponse = z.infer<typeof modelsListResponseSchema>;

type StaticCatalogEntry = {
  id: string;
  ownedBy: string;
  provider: string;
  capabilities: z.infer<typeof routerCapabilitiesSchema>;
};

const STATIC_MODEL_CATALOG: readonly StaticCatalogEntry[] = [
  {
    id: "openai/gpt-4.1-mini",
    ownedBy: "1router",
    provider: "openai",
    capabilities: { tools: true, vision: true, json_schema: true }
  },
  {
    id: "anthropic/claude-3-5-sonnet",
    ownedBy: "1router",
    provider: "anthropic",
    capabilities: { tools: true, vision: true, json_schema: false }
  },
  {
    id: "google/gemini-2.0-flash",
    ownedBy: "1router",
    provider: "google",
    capabilities: { tools: true, vision: true, json_schema: true }
  }
] as const;

export function buildModelsListResponse(createdUnix = Math.floor(Date.now() / 1000)): ModelsListResponse {
  return modelsListResponseSchema.parse({
    object: "list",
    data: STATIC_MODEL_CATALOG.map((entry) => ({
      id: entry.id,
      object: "model",
      created: createdUnix,
      owned_by: entry.ownedBy,
      x_router: {
        provider: entry.provider,
        capabilities: entry.capabilities
      }
    }))
  });
}
