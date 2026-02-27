import { describe, expect, it } from "vitest";
import {
  WEBHOOK_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  buildSignedWebhookHeaders,
  createWebhookSignature,
  isWebhookTimestampFresh,
  verifyWebhookSignature
} from "../src/webhooks.js";

describe("webhook signing", () => {
  it("matches deterministic signature test vector", () => {
    const signature = createWebhookSignature("whsec_test_123", "1700000000", "{\"event\":\"usage.finalized\"}");
    expect(signature).toBe("695832fa9df3c64e22994f5f4f0d385894b06f1cf27444e6bb4425869a500ab8");
  });

  it("builds signed webhook headers", () => {
    const headers = buildSignedWebhookHeaders({
      secret: "whsec_test_123",
      timestamp: "1700000000",
      body: "{\"event\":\"usage.finalized\"}",
      deliveryId: "wh_001"
    });

    expect(headers[WEBHOOK_ID_HEADER]).toBe("wh_001");
    expect(headers[WEBHOOK_TIMESTAMP_HEADER]).toBe("1700000000");
    expect(headers[WEBHOOK_SIGNATURE_HEADER]).toBe(
      "v1=695832fa9df3c64e22994f5f4f0d385894b06f1cf27444e6bb4425869a500ab8"
    );
  });
});

describe("webhook replay guard and verification", () => {
  it("verifies valid signature", () => {
    const result = verifyWebhookSignature({
      secret: "whsec_test_123",
      timestamp: "1700000000",
      signature: "v1=695832fa9df3c64e22994f5f4f0d385894b06f1cf27444e6bb4425869a500ab8",
      body: "{\"event\":\"usage.finalized\"}",
      nowMs: 1700000000 * 1000,
      replayWindowSeconds: 300
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects invalid signature", () => {
    const result = verifyWebhookSignature({
      secret: "whsec_test_123",
      timestamp: "1700000000",
      signature: "v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      body: "{\"event\":\"usage.finalized\"}",
      nowMs: 1700000000 * 1000,
      replayWindowSeconds: 300
    });
    expect(result).toEqual({ ok: false, error: "SIGNATURE_MISMATCH" });
  });

  it("rejects stale timestamp", () => {
    const result = verifyWebhookSignature({
      secret: "whsec_test_123",
      timestamp: "1700000000",
      signature: "v1=695832fa9df3c64e22994f5f4f0d385894b06f1cf27444e6bb4425869a500ab8",
      body: "{\"event\":\"usage.finalized\"}",
      nowMs: 1700000900 * 1000,
      replayWindowSeconds: 300
    });
    expect(result).toEqual({ ok: false, error: "STALE_TIMESTAMP" });
  });

  it("checks replay window helper", () => {
    expect(isWebhookTimestampFresh("1700000000", 1700000100 * 1000, 120)).toBe(true);
    expect(isWebhookTimestampFresh("1700000000", 1700000500 * 1000, 120)).toBe(false);
  });
});
