import { z } from "zod";

export const traceQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(20),
    route_group: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    redact: z
      .preprocess((value) => {
        if (typeof value === "string") {
          const normalized = value.trim().toLowerCase();
          if (normalized === "true") return true;
          if (normalized === "false") return false;
        }
        return value;
      }, z.boolean())
      .default(true)
  })
  .strict();

const traceItemSchema = z.object({
  request_id: z.string(),
  ts: z.string().datetime(),
  route_group: z.string(),
  provider: z.string(),
  provider_model: z.string(),
  model: z.string(),
  status: z.number().int(),
  latency_ms: z.number().int().nonnegative(),
  prompt_preview: z.string()
});

export const traceListResponseSchema = z.object({
  data: z.array(traceItemSchema),
  meta: z.object({ request_id: z.string() })
});

type TraceEvent = z.infer<typeof traceItemSchema> & { raw_prompt: string };

const TRACE_SEED: TraceEvent[] = [
  {
    request_id: "req_trace_001",
    ts: "2026-02-28T08:00:00.000Z",
    route_group: "chat",
    provider: "openai",
    provider_model: "gpt-4.1-mini",
    model: "openai/gpt-4.1-mini",
    status: 200,
    latency_ms: 320,
    prompt_preview: "[REDACTED]",
    raw_prompt: "user email is alice@example.com; summarize meeting notes"
  },
  {
    request_id: "req_trace_002",
    ts: "2026-02-28T08:01:00.000Z",
    route_group: "chat",
    provider: "anthropic",
    provider_model: "claude-3-5-sonnet",
    model: "anthropic/claude-3-5-sonnet",
    status: 429,
    latency_ms: 980,
    prompt_preview: "[REDACTED]",
    raw_prompt: "api key sk-live-secret and billing details included"
  },
  {
    request_id: "req_trace_003",
    ts: "2026-02-28T08:02:00.000Z",
    route_group: "embeddings",
    provider: "google",
    provider_model: "gemini-2.0-flash",
    model: "google/gemini-2.0-flash",
    status: 200,
    latency_ms: 140,
    prompt_preview: "[REDACTED]",
    raw_prompt: "index doc: internal architecture and credentials"
  }
];

export class InMemoryResponseTraceStore {
  constructor(private readonly events: TraceEvent[] = TRACE_SEED) {}

  list(input: z.infer<typeof traceQuerySchema>) {
    const redacted = input.redact;
    return this.events
      .filter((event) => (input.route_group ? event.route_group === input.route_group : true))
      .filter((event) => (input.provider ? event.provider === input.provider : true))
      .slice(0, input.limit)
      .map((event) => ({
        request_id: event.request_id,
        ts: event.ts,
        route_group: event.route_group,
        provider: event.provider,
        provider_model: event.provider_model,
        model: event.model,
        status: event.status,
        latency_ms: event.latency_ms,
        prompt_preview: redacted ? "[REDACTED]" : event.raw_prompt.slice(0, 80)
      }));
  }
}
