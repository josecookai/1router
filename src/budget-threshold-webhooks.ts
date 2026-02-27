import { z } from "zod";
import { buildSignedWebhookHeaders } from "./webhooks.js";

const BUDGET_THRESHOLDS = [0.8, 1] as const;

export const budgetThresholdWebhookPayloadSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.literal("budget.threshold_reached"),
  org_id: z.string().min(1),
  project_id: z.string().min(1),
  threshold_pct: z.union([z.literal(80), z.literal(100)]),
  budget_usd: z.number().positive(),
  current_spend_usd: z.number().nonnegative(),
  request_timestamp: z.string().datetime()
});

type BudgetThresholdWebhookPayload = z.infer<typeof budgetThresholdWebhookPayloadSchema>;

type DedupRecord = {
  window_key: string;
};

export class InMemoryBudgetWebhookDedupStore {
  private readonly records = new Map<string, DedupRecord>();

  seen(key: string, windowKey: string) {
    const record = this.records.get(key);
    return record?.window_key === windowKey;
  }

  mark(key: string, windowKey: string) {
    this.records.set(key, { window_key: windowKey });
  }
}

function buildWindowKey(observedAtIso: string, windowMinutes: number) {
  const observedMs = new Date(observedAtIso).getTime();
  const windowMs = windowMinutes * 60 * 1000;
  const bucket = Math.floor(observedMs / windowMs);
  return `${bucket}`;
}

function buildEventId(params: {
  orgId: string;
  projectId: string;
  thresholdPct: 80 | 100;
  windowKey: string;
}) {
  return `evt_budget_${params.orgId}_${params.projectId}_${params.thresholdPct}_${params.windowKey}`;
}

export function emitBudgetThresholdWebhooks(
  dedupStore: InMemoryBudgetWebhookDedupStore,
  params: {
    orgId: string;
    projectId: string;
    budgetUsd: number;
    currentSpendUsd: number;
    requestTimestamp: string;
    webhookSecret: string;
    windowMinutes?: number;
  }
) {
  const windowMinutes = params.windowMinutes ?? 60;
  const windowKey = buildWindowKey(params.requestTimestamp, windowMinutes);
  const deliveries: Array<{ payload: BudgetThresholdWebhookPayload; headers: Record<string, string> }> = [];

  for (const threshold of BUDGET_THRESHOLDS) {
    if (params.currentSpendUsd < params.budgetUsd * threshold) continue;

    const thresholdPct = threshold === 0.8 ? 80 : 100;
    const dedupKey = `${params.orgId}:${params.projectId}:${thresholdPct}`;
    if (dedupStore.seen(dedupKey, windowKey)) continue;

    dedupStore.mark(dedupKey, windowKey);
    const eventId = buildEventId({
      orgId: params.orgId,
      projectId: params.projectId,
      thresholdPct,
      windowKey
    });
    const payload = budgetThresholdWebhookPayloadSchema.parse({
      event_id: eventId,
      event_type: "budget.threshold_reached",
      org_id: params.orgId,
      project_id: params.projectId,
      threshold_pct: thresholdPct,
      budget_usd: params.budgetUsd,
      current_spend_usd: params.currentSpendUsd,
      request_timestamp: params.requestTimestamp
    });
    const body = JSON.stringify(payload);
    deliveries.push({
      payload,
      headers: buildSignedWebhookHeaders({
        secret: params.webhookSecret,
        body,
        timestamp: Math.floor(new Date(params.requestTimestamp).getTime() / 1000).toString(),
        deliveryId: eventId
      })
    });
  }

  return deliveries;
}
