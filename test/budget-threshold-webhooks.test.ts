import { describe, expect, it } from "vitest";
import {
  InMemoryBudgetWebhookDedupStore,
  budgetThresholdWebhookPayloadSchema,
  emitBudgetThresholdWebhooks
} from "../src/budget-threshold-webhooks.js";
import { WEBHOOK_ID_HEADER, WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER } from "../src/webhooks.js";

describe("budget threshold webhooks", () => {
  it("emits 80% and 100% threshold events when budget spend reaches 100%", () => {
    const store = new InMemoryBudgetWebhookDedupStore();
    const deliveries = emitBudgetThresholdWebhooks(store, {
      orgId: "org_demo",
      projectId: "proj_demo",
      budgetUsd: 100,
      currentSpendUsd: 100,
      requestTimestamp: "2026-02-27T02:00:00.000Z",
      webhookSecret: "whsec_budget_test"
    });

    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((item) => item.payload.threshold_pct)).toEqual([80, 100]);
  });

  it("deduplicates same threshold within the same window", () => {
    const store = new InMemoryBudgetWebhookDedupStore();
    const first = emitBudgetThresholdWebhooks(store, {
      orgId: "org_demo",
      projectId: "proj_demo",
      budgetUsd: 100,
      currentSpendUsd: 85,
      requestTimestamp: "2026-02-27T02:05:00.000Z",
      webhookSecret: "whsec_budget_test",
      windowMinutes: 60
    });
    const second = emitBudgetThresholdWebhooks(store, {
      orgId: "org_demo",
      projectId: "proj_demo",
      budgetUsd: 100,
      currentSpendUsd: 95,
      requestTimestamp: "2026-02-27T02:35:00.000Z",
      webhookSecret: "whsec_budget_test",
      windowMinutes: 60
    });

    expect(first).toHaveLength(1);
    expect(first[0]?.payload.threshold_pct).toBe(80);
    expect(second).toHaveLength(0);
  });

  it("returns full payload contract and signed headers", () => {
    const store = new InMemoryBudgetWebhookDedupStore();
    const deliveries = emitBudgetThresholdWebhooks(store, {
      orgId: "org_demo",
      projectId: "proj_demo",
      budgetUsd: 100,
      currentSpendUsd: 85,
      requestTimestamp: "2026-02-27T02:10:00.000Z",
      webhookSecret: "whsec_budget_test"
    });

    expect(deliveries).toHaveLength(1);
    const event = deliveries[0];
    const payload = budgetThresholdWebhookPayloadSchema.parse(event?.payload);
    expect(payload.org_id).toBe("org_demo");
    expect(payload.project_id).toBe("proj_demo");
    expect(payload.threshold_pct).toBe(80);
    expect(payload.budget_usd).toBe(100);
    expect(payload.current_spend_usd).toBe(85);
    expect(payload.request_timestamp).toBe("2026-02-27T02:10:00.000Z");
    expect(event?.headers[WEBHOOK_ID_HEADER]).toBe(payload.event_id);
    expect(event?.headers[WEBHOOK_TIMESTAMP_HEADER]).toBe("1772158200");
    expect(event?.headers[WEBHOOK_SIGNATURE_HEADER]?.startsWith("v1=")).toBe(true);
  });
});
