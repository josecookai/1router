import { z } from "zod";

export const usageQuerySchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    group_by: z.enum(["hour", "model"]).default("hour")
  })
  .refine((value) => new Date(value.from).getTime() < new Date(value.to).getTime(), {
    message: "`from` must be earlier than `to`",
    path: ["to"]
  });

const usageBucketSchema = z.object({
  bucket: z.string(),
  requests: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
  platform_fee_usd: z.number().nonnegative(),
  provisional: z.boolean(),
  finalized_at: z.string().datetime().nullable()
});

export const usageReportResponseSchema = z.object({
  data: z.object({
    org_id: z.string(),
    from: z.string().datetime(),
    to: z.string().datetime(),
    group_by: z.enum(["hour", "model"]),
    provisional: z.boolean(),
    finalized_at: z.string().datetime().nullable(),
    totals: usageBucketSchema,
    summary: z.object({
      provisional: z.boolean(),
      finalized_at: z.string().datetime().nullable(),
      totals: usageBucketSchema
    }),
    buckets: z.array(usageBucketSchema)
  }),
  meta: z.object({
    request_id: z.string()
  })
});

export type UsageEvent = {
  org_id: string;
  ts: string;
  model: string;
  finalized_at: string | null;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  platform_fee_usd: number;
};

const FIXTURE_USAGE_EVENTS: UsageEvent[] = [
  {
    org_id: "org_demo",
    ts: "2026-02-26T10:00:00.000Z",
    model: "openai/gpt-4.1-mini",
    finalized_at: "2026-02-26T10:30:00.000Z",
    requests: 10,
    input_tokens: 1000,
    output_tokens: 400,
    cost_usd: 0.12,
    platform_fee_usd: 0.02
  },
  {
    org_id: "org_demo",
    ts: "2026-02-26T11:00:00.000Z",
    model: "openai/gpt-4.1-mini",
    finalized_at: null,
    requests: 6,
    input_tokens: 700,
    output_tokens: 240,
    cost_usd: 0.08,
    platform_fee_usd: 0.015
  },
  {
    org_id: "org_demo",
    ts: "2026-02-26T11:00:00.000Z",
    model: "openai/text-embedding-3-small",
    finalized_at: null,
    requests: 12,
    input_tokens: 900,
    output_tokens: 0,
    cost_usd: 0.03,
    platform_fee_usd: 0.01
  }
];

function emptyBucket(bucket: string) {
  return {
    bucket,
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
    platform_fee_usd: 0,
    provisional: false,
    finalized_at: null
  };
}

function roundMoney(value: number) {
  return Number(value.toFixed(6));
}

export class FixtureUsageRepository {
  constructor(private readonly events: UsageEvent[] = FIXTURE_USAGE_EVENTS) {}

  listForOrg(orgId: string, fromIso: string, toIso: string) {
    const from = new Date(fromIso).getTime();
    const to = new Date(toIso).getTime();

    return this.events.filter((event) => {
      const ts = new Date(event.ts).getTime();
      return event.org_id === orgId && ts >= from && ts < to;
    });
  }

  finalizeEligible(params: { finalizeBeforeIso: string; finalizedAtIso: string }) {
    const cutoff = new Date(params.finalizeBeforeIso).getTime();
    let finalized = 0;

    for (const event of this.events) {
      const eventTs = new Date(event.ts).getTime();
      if (event.finalized_at !== null || eventTs >= cutoff) continue;
      event.finalized_at = params.finalizedAtIso;
      finalized += 1;
    }

    return {
      scanned: this.events.length,
      finalized,
      finalized_at: params.finalizedAtIso
    };
  }
}

export function runUsageFinalizationJob(
  repo: FixtureUsageRepository,
  params: { nowIso: string; reconciliationDelayMinutes: number }
) {
  const cutoffMs = new Date(params.nowIso).getTime() - params.reconciliationDelayMinutes * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  return {
    cutoff_iso: cutoffIso,
    ...repo.finalizeEligible({
      finalizeBeforeIso: cutoffIso,
      finalizedAtIso: params.nowIso
    })
  };
}

export function buildUsageReportResponse(
  repo: FixtureUsageRepository,
  params: { orgId: string; query: unknown; requestId: string }
) {
  const query = usageQuerySchema.parse(params.query);
  const toMs = new Date(query.to).getTime();
  const provisional = toMs > Date.now();
  const finalizedAt = provisional ? null : new Date(toMs).toISOString();
  const events = repo.listForOrg(params.orgId, query.from, query.to);
  const map = new Map<string, z.infer<typeof usageBucketSchema>>();

  for (const event of events) {
    const bucketKey = query.group_by === "hour" ? event.ts.slice(0, 13) + ":00:00.000Z" : event.model;
    const bucket = map.get(bucketKey) ?? emptyBucket(bucketKey);
    bucket.requests += event.requests;
    bucket.input_tokens += event.input_tokens;
    bucket.output_tokens += event.output_tokens;
    bucket.total_tokens += event.input_tokens + event.output_tokens;
    bucket.cost_usd = roundMoney(bucket.cost_usd + event.cost_usd);
    bucket.platform_fee_usd = roundMoney(bucket.platform_fee_usd + event.platform_fee_usd);
    if (event.finalized_at === null) {
      bucket.provisional = true;
      bucket.finalized_at = null;
    } else if (!bucket.provisional) {
      bucket.finalized_at =
        bucket.finalized_at === null || event.finalized_at > bucket.finalized_at ? event.finalized_at : bucket.finalized_at;
    }
    map.set(bucketKey, bucket);
  }

  const buckets = [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  const totals = buckets.reduce(
    (acc, bucket) => ({
      bucket: "total",
      requests: acc.requests + bucket.requests,
      input_tokens: acc.input_tokens + bucket.input_tokens,
      output_tokens: acc.output_tokens + bucket.output_tokens,
      total_tokens: acc.total_tokens + bucket.total_tokens,
      cost_usd: roundMoney(acc.cost_usd + bucket.cost_usd),
      platform_fee_usd: roundMoney(acc.platform_fee_usd + bucket.platform_fee_usd),
      provisional: acc.provisional || bucket.provisional,
      finalized_at:
        acc.provisional || bucket.provisional
          ? null
          : acc.finalized_at === null || (bucket.finalized_at !== null && bucket.finalized_at > acc.finalized_at)
            ? bucket.finalized_at
            : acc.finalized_at
    }),
    emptyBucket("total")
  );
  const summary = {
    provisional: totals.provisional,
    finalized_at: totals.finalized_at,
    totals
  };

  return usageReportResponseSchema.parse({
    data: {
      org_id: params.orgId,
      from: query.from,
      to: query.to,
      group_by: query.group_by,
      provisional,
      finalized_at: finalizedAt,
      totals,
      summary,
      buckets
    },
    meta: {
      request_id: params.requestId
    }
  });
}
