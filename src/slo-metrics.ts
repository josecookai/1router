import { z } from "zod";

const methodEnum = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const envEnum = ["dev", "staging", "prod"] as const;

export const sliDashboardQuerySchema = z
  .object({
    window_minutes: z.coerce.number().int().positive().max(24 * 60).default(60),
    service: z.string().min(1).optional(),
    env: z.enum(envEnum).optional(),
    route_group: z.string().min(1).optional(),
    method: z.string().optional()
  })
  .strict();

export const sliAggregateSchema = z.object({
  window_minutes: z.number().int().positive(),
  request_count: z.number().int().nonnegative(),
  success_rate: z.number().min(0).max(1),
  error_rate: z.number().min(0).max(1),
  p95_latency_ms: z.number().int().nonnegative()
});

export const sliDashboardResponseSchema = z.object({
  data: sliAggregateSchema,
  meta: z.object({ request_id: z.string() })
});

export type SliMetricEvent = {
  ts: string;
  service: string;
  env: (typeof envEnum)[number];
  route_group: string;
  method: (typeof methodEnum)[number];
  status: number;
  latency_ms: number;
};

export class InMemorySliMetricsStore {
  private events: SliMetricEvent[];

  constructor(seed = buildSeedEvents()) {
    this.events = [...seed];
  }

  aggregateWindow(input: {
    windowMinutes: number;
    filters?: {
      service?: string;
      env?: string;
      route_group?: string;
      method?: string;
    };
  }) {
    const { windowMinutes } = input;
    const method = input.filters?.method;
    if (method && !methodEnum.includes(method as (typeof methodEnum)[number])) {
      throw new Error(`unsupported method filter: ${method}`);
    }

    const now = Date.now();
    const cutoff = now - windowMinutes * 60_000;

    const filtered = this.events.filter((event) => {
      const ts = new Date(event.ts).getTime();
      if (Number.isNaN(ts) || ts < cutoff) return false;
      if (input.filters?.service && event.service !== input.filters.service) return false;
      if (input.filters?.env && event.env !== input.filters.env) return false;
      if (input.filters?.route_group && event.route_group !== input.filters.route_group) return false;
      if (method && event.method !== method) return false;
      return true;
    });

    const requestCount = filtered.length;
    const successCount = filtered.filter((event) => event.status < 500).length;
    const errorCount = requestCount - successCount;

    const latencies = filtered.map((event) => event.latency_ms).sort((a, b) => a - b);
    const p95 = percentile95(latencies);

    return sliAggregateSchema.parse({
      window_minutes: windowMinutes,
      request_count: requestCount,
      success_rate: requestCount === 0 ? 1 : successCount / requestCount,
      error_rate: requestCount === 0 ? 0 : errorCount / requestCount,
      p95_latency_ms: p95
    });
  }
}

function percentile95(values: number[]) {
  if (values.length === 0) return 0;
  const idx = Math.ceil(values.length * 0.95) - 1;
  return Math.max(0, Math.round(values[Math.max(0, Math.min(idx, values.length - 1))] ?? 0));
}

function buildSeedEvents(): SliMetricEvent[] {
  const now = Date.now();
  return [
    {
      ts: new Date(now - 2 * 60_000).toISOString(),
      service: "router-api",
      env: "prod",
      route_group: "chat",
      method: "POST",
      status: 200,
      latency_ms: 320
    },
    {
      ts: new Date(now - 4 * 60_000).toISOString(),
      service: "router-api",
      env: "prod",
      route_group: "chat",
      method: "POST",
      status: 502,
      latency_ms: 1100
    },
    {
      ts: new Date(now - 6 * 60_000).toISOString(),
      service: "router-api",
      env: "prod",
      route_group: "embeddings",
      method: "POST",
      status: 200,
      latency_ms: 140
    }
  ];
}
