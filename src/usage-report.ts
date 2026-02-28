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

export const monthlyInvoiceQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/)
});

export const usageListQuerySchema = z.object({
  org_id: z.string().min(1).default("org_demo"),
  project_id: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional()
});

export const billingListQuerySchema = usageListQuerySchema;

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

const invoiceLineItemSchema = z.object({
  provider: z.string(),
  model: z.string(),
  quantity: z.number().int().nonnegative(),
  unit_price: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  platform_fee: z.number().nonnegative()
});

export const monthlyInvoiceResponseSchema = z.object({
  data: z.object({
    org_id: z.string(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    currency: z.literal("USD"),
    line_items: z.array(invoiceLineItemSchema),
    totals: z.object({
      quantity: z.number().int().nonnegative(),
      subtotal: z.number().nonnegative(),
      platform_fee: z.number().nonnegative(),
      grand_total: z.number().nonnegative()
    })
  }),
  meta: z.object({
    request_id: z.string()
  })
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

const usageListItemSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string(),
  provider: z.string(),
  model: z.string(),
  ts: z.string().datetime(),
  requests: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
  platform_fee_usd: z.number().nonnegative(),
  provisional: z.boolean(),
  finalized_at: z.string().datetime().nullable()
});

const billingListItemSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string(),
  provider: z.string(),
  model: z.string(),
  usage_ts: z.string().datetime(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  quantity: z.number().int().nonnegative(),
  subtotal_usd: z.number().nonnegative(),
  platform_fee_usd: z.number().nonnegative(),
  total_usd: z.number().nonnegative(),
  provisional: z.boolean(),
  finalized_at: z.string().datetime().nullable()
});

export const usageListResponseSchema = z.object({
  data: z.array(usageListItemSchema),
  meta: z.object({
    request_id: z.string(),
    page: z.object({
      limit: z.number().int().positive(),
      next_cursor: z.string().nullable()
    })
  })
});

export const billingListResponseSchema = z.object({
  data: z.array(billingListItemSchema),
  meta: z.object({
    request_id: z.string(),
    page: z.object({
      limit: z.number().int().positive(),
      next_cursor: z.string().nullable()
    })
  })
});

export type UsageEvent = {
  org_id: string;
  project_id?: string;
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

function monthRange(month: string) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const from = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return { from: from.toISOString(), to: to.toISOString() };
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

export function buildMonthlyInvoiceResponse(
  repo: FixtureUsageRepository,
  params: { orgId: string; query: unknown; requestId: string }
) {
  const query = monthlyInvoiceQuerySchema.parse(params.query);
  const range = monthRange(query.month);
  const events = repo.listForOrg(params.orgId, range.from, range.to);
  const grouped = new Map<
    string,
    {
      provider: string;
      model: string;
      quantity: number;
      subtotal: number;
      platform_fee: number;
    }
  >();

  for (const event of events) {
    const provider = event.model.split("/", 1)[0] ?? "unknown";
    const key = `${provider}::${event.model}`;
    const line = grouped.get(key) ?? {
      provider,
      model: event.model,
      quantity: 0,
      subtotal: 0,
      platform_fee: 0
    };

    line.quantity += event.requests;
    line.subtotal = roundMoney(line.subtotal + event.cost_usd);
    line.platform_fee = roundMoney(line.platform_fee + event.platform_fee_usd);
    grouped.set(key, line);
  }

  const lineItems = [...grouped.values()]
    .sort((a, b) => a.model.localeCompare(b.model))
    .map((line) => ({
      provider: line.provider,
      model: line.model,
      quantity: line.quantity,
      unit_price: line.quantity === 0 ? 0 : roundMoney(line.subtotal / line.quantity),
      subtotal: line.subtotal,
      platform_fee: line.platform_fee
    }));

  const totals = lineItems.reduce(
    (acc, line) => ({
      quantity: acc.quantity + line.quantity,
      subtotal: roundMoney(acc.subtotal + line.subtotal),
      platform_fee: roundMoney(acc.platform_fee + line.platform_fee),
      grand_total: roundMoney(acc.grand_total + line.subtotal + line.platform_fee)
    }),
    { quantity: 0, subtotal: 0, platform_fee: 0, grand_total: 0 }
  );

  return monthlyInvoiceResponseSchema.parse({
    data: {
      org_id: params.orgId,
      month: query.month,
      currency: "USD",
      line_items: lineItems,
      totals
    },
    meta: { request_id: params.requestId }
  });
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return 0;
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const parsed = Number(decoded);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function deriveProvider(model: string) {
  return model.split("/", 1)[0] ?? "unknown";
}

function resolveRange(query: z.infer<typeof usageListQuerySchema>) {
  const defaultTo = new Date().toISOString();
  const defaultFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const from = query.from ?? defaultFrom;
  const to = query.to ?? defaultTo;
  return { from, to };
}

export function buildUsageListResponse(
  repo: FixtureUsageRepository,
  params: { query: unknown; requestId: string }
) {
  const query = usageListQuerySchema.parse(params.query);
  const range = resolveRange(query);
  const start = decodeCursor(query.cursor);
  const rows = repo
    .listForOrg(query.org_id, range.from, range.to)
    .filter((event) => (query.project_id ? (event.project_id ?? "proj_mock") === query.project_id : true))
    .filter((event) => (query.model ? event.model === query.model : true))
    .filter((event) => (query.provider ? deriveProvider(event.model) === query.provider : true))
    .sort((a, b) => b.ts.localeCompare(a.ts));

  const pageRows = rows.slice(start, start + query.limit);
  const nextOffset = start + pageRows.length;
  const nextCursor = nextOffset < rows.length ? encodeCursor(nextOffset) : null;

  return usageListResponseSchema.parse({
    data: pageRows.map((event, index) => ({
      id: `usage_${start + index + 1}`,
      org_id: event.org_id,
      project_id: event.project_id ?? "proj_mock",
      provider: deriveProvider(event.model),
      model: event.model,
      ts: event.ts,
      requests: event.requests,
      input_tokens: event.input_tokens,
      output_tokens: event.output_tokens,
      total_tokens: event.input_tokens + event.output_tokens,
      cost_usd: event.cost_usd,
      platform_fee_usd: event.platform_fee_usd,
      provisional: event.finalized_at === null,
      finalized_at: event.finalized_at
    })),
    meta: {
      request_id: params.requestId,
      page: {
        limit: query.limit,
        next_cursor: nextCursor
      }
    }
  });
}

export function buildBillingListResponse(
  repo: FixtureUsageRepository,
  params: { query: unknown; requestId: string }
) {
  const query = billingListQuerySchema.parse(params.query);
  const range = resolveRange(query);
  const start = decodeCursor(query.cursor);
  const rows = repo
    .listForOrg(query.org_id, range.from, range.to)
    .filter((event) => (query.project_id ? (event.project_id ?? "proj_mock") === query.project_id : true))
    .filter((event) => (query.model ? event.model === query.model : true))
    .filter((event) => (query.provider ? deriveProvider(event.model) === query.provider : true))
    .sort((a, b) => b.ts.localeCompare(a.ts));

  const pageRows = rows.slice(start, start + query.limit);
  const nextOffset = start + pageRows.length;
  const nextCursor = nextOffset < rows.length ? encodeCursor(nextOffset) : null;

  return billingListResponseSchema.parse({
    data: pageRows.map((event, index) => {
      const subtotal = roundMoney(event.cost_usd);
      const fee = roundMoney(event.platform_fee_usd);
      return {
        id: `bill_${start + index + 1}`,
        org_id: event.org_id,
        project_id: event.project_id ?? "proj_mock",
        provider: deriveProvider(event.model),
        model: event.model,
        usage_ts: event.ts,
        month: event.ts.slice(0, 7),
        quantity: event.requests,
        subtotal_usd: subtotal,
        platform_fee_usd: fee,
        total_usd: roundMoney(subtotal + fee),
        provisional: event.finalized_at === null,
        finalized_at: event.finalized_at
      };
    }),
    meta: {
      request_id: params.requestId,
      page: {
        limit: query.limit,
        next_cursor: nextCursor
      }
    }
  });
}
