import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryIdempotencyStore } from "../src/idempotency.js";
import type { PaymentWebhookAck } from "../src/payment-webhook.js";

describe("POST /api/webhooks/payments", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const payload = {
    provider: "stripe",
    event_type: "payment.succeeded",
    org_id: "org_demo",
    invoice_id: "inv_1",
    payment_id: "pay_1",
    amount_cents: 275,
    currency: "USD",
    occurred_at: "2026-02-27T12:00:00.000Z"
  } as const;

  it("accepts first delivery and stores idempotency record", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/payments",
      headers: { "x-provider-event-id": "evt_001" },
      payload
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-idempotent-replay"]).toBeUndefined();
    expect(res.json()).toMatchObject({
      data: {
        event_id: "evt_001",
        accepted: true,
        replayed: false
      },
      meta: { request_id: res.headers["x-request-id"] }
    });
  });

  it("returns replayed response for duplicate event with same payload", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/webhooks/payments",
      headers: { "x-provider-event-id": "evt_002" },
      payload
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/webhooks/payments",
      headers: { "x-provider-event-id": "evt_002" },
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers["x-idempotent-replay"]).toBe("true");
    expect(replay.json()).toMatchObject({
      data: {
        event_id: "evt_002",
        accepted: true,
        replayed: true
      }
    });
    expect((first.json() as { data: { replayed: boolean } }).data.replayed).toBe(false);
  });

  it("returns conflict for duplicate event id with different payload", async () => {
    await app.inject({
      method: "POST",
      url: "/api/webhooks/payments",
      headers: { "x-provider-event-id": "evt_003" },
      payload
    });

    const conflict = await app.inject({
      method: "POST",
      url: "/api/webhooks/payments",
      headers: { "x-provider-event-id": "evt_003" },
      payload: { ...payload, amount_cents: 999 }
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: {
        code: "IDEMPOTENCY_KEY_CONFLICT",
        request_id: conflict.headers["x-request-id"]
      }
    });
  });

  it("returns invalid request envelope when required event id header is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/payments",
      payload
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid payment webhook request",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("expires dedupe record after TTL and accepts event as new delivery", async () => {
    let now = Date.now();
    const ttlStore = new InMemoryIdempotencyStore<PaymentWebhookAck>({
      defaultTtlMs: 1000,
      now: () => now
    });
    const ttlApp = buildApp({ paymentWebhookIdempotencyStore: ttlStore });
    await ttlApp.ready();

    const first = await ttlApp.inject({
      method: "POST",
      url: "/api/webhooks/payments",
      headers: { "x-provider-event-id": "evt_ttl_001" },
      payload
    });
    now += 2_000;
    const second = await ttlApp.inject({
      method: "POST",
      url: "/api/webhooks/payments",
      headers: { "x-provider-event-id": "evt_ttl_001" },
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-idempotent-replay"]).toBeUndefined();
    expect((second.json() as { data: { replayed: boolean } }).data.replayed).toBe(false);

    await ttlApp.close();
  });
});
