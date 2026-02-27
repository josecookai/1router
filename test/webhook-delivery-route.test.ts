import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { WEBHOOK_ID_HEADER, WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER, buildSignedWebhookHeaders } from "../src/webhooks.js";

describe("webhook delivery integration", () => {
  const app = buildApp({
    registerRoutes(instance) {
      instance.post("/internal/webhook-test-delivery", async (_request, reply) => {
        const body = JSON.stringify({ event: "usage.finalized", org_id: "org_demo", total_tokens: 1200 });
        const headers = buildSignedWebhookHeaders({
          secret: "whsec_test_123",
          timestamp: "1700000000",
          deliveryId: "wh_001",
          body
        });
        return reply.send({ body, headers });
      });
    }
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("includes signature metadata on delivery payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/webhook-test-delivery"
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json() as { body: string; headers: Record<string, string> };
    expect(payload.headers[WEBHOOK_ID_HEADER]).toBe("wh_001");
    expect(payload.headers[WEBHOOK_TIMESTAMP_HEADER]).toBe("1700000000");
    expect(payload.headers[WEBHOOK_SIGNATURE_HEADER]).toBe(
      "v1=dfb3bd067f300ae5129b954d5fbcada23f3353ae5df8656fa1c067809e3fdbc4"
    );
  });
});
