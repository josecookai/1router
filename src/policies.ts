import { z } from "zod";

const nonEmptyString = z.string().min(1);

export const policyWeightSchema = z.object({
  provider: nonEmptyString,
  value: z.number().positive()
});

export const policyConstraintSchema = z
  .object({
    max_latency_ms: z.number().int().positive().optional(),
    region: nonEmptyString.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "constraints must include at least one supported field");

export const createPolicySchema = z.object({
  name: nonEmptyString,
  route: nonEmptyString,
  status: z.enum(["active", "inactive"]).default("active"),
  weights: z.array(policyWeightSchema).min(1),
  fallback_chain: z.array(nonEmptyString).default([]),
  constraints: policyConstraintSchema.optional()
});

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;

export const policyRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  route: z.string(),
  status: z.enum(["active", "inactive"]),
  weights: z.array(policyWeightSchema).min(1),
  fallback_chain: z.array(z.string()),
  constraints: policyConstraintSchema.optional(),
  created_at: z.string().datetime()
});

export type PolicyRecord = z.infer<typeof policyRecordSchema>;

export class InMemoryPolicyStore {
  private readonly items: PolicyRecord[];
  private nextId: number;

  constructor(seed = buildSeedPolicies()) {
    this.items = [...seed];
    this.nextId = this.items.length + 1;
  }

  list() {
    return [...this.items];
  }

  create(input: CreatePolicyInput) {
    const created = policyRecordSchema.parse({
      id: `pol_${String(this.nextId).padStart(2, "0")}`,
      name: input.name,
      route: input.route,
      status: input.status,
      weights: input.weights,
      fallback_chain: input.fallback_chain,
      constraints: input.constraints,
      created_at: new Date().toISOString()
    });

    this.nextId += 1;
    this.items.push(created);
    return created;
  }
}

function buildSeedPolicies(): PolicyRecord[] {
  return [
    policyRecordSchema.parse({
      id: "pol_01",
      name: "default-chat",
      route: "/v1/chat/completions",
      status: "active",
      weights: [
        { provider: "openai", value: 0.7 },
        { provider: "anthropic", value: 0.3 }
      ],
      fallback_chain: ["anthropic", "openai"],
      constraints: { max_latency_ms: 3000 },
      created_at: new Date("2026-01-01T00:00:00.000Z").toISOString()
    })
  ];
}
