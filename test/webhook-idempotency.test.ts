import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  WebhookEventIdempotencyStore,
  DEFAULT_WEBHOOK_IDEMPOTENCY_CONFIG
} from "../src/webhook-idempotency.js";

describe("WebhookEventIdempotencyStore", () => {
  let store: WebhookEventIdempotencyStore;
  const now = Date.now();

  beforeEach(() => {
    store = new WebhookEventIdempotencyStore();
  });

  describe("event recording", () => {
    it("records a new event", () => {
      const record = store.recordReceived("evt_123", now);

      expect(record.eventId).toBe("evt_123");
      expect(record.receivedAt).toBe(now);
      expect(record.processed).toBe(false);
    });

    it("detects duplicate events", () => {
      store.recordReceived("evt_123", now);
      const duplicate = store.recordReceived("evt_123", now + 1000);

      // Should return the original record
      expect(duplicate.receivedAt).toBe(now);
    });

    it("marks events as processed", () => {
      store.recordReceived("evt_123", now);
      store.markProcessed("evt_123", { status: "ok" });

      const record = store.get("evt_123", now);
      expect(record?.processed).toBe(true);
      expect(record?.response).toEqual({ status: "ok" });
    });

    it("checks if event is processed", () => {
      store.recordReceived("evt_123", now);
      expect(store.isProcessed("evt_123", now)).toBe(false);

      store.markProcessed("evt_123");
      expect(store.isProcessed("evt_123", now)).toBe(true);
    });
  });

  describe("TTL expiration", () => {
    it("returns null for expired events", () => {
      const config = { ttlMs: 1000 };
      store = new WebhookEventIdempotencyStore(config);

      store.recordReceived("evt_123", now);
      expect(store.get("evt_123", now)).not.toBeNull();

      // Event should be expired after TTL
      const record = store.get("evt_123", now + 2000);
      expect(record).toBeNull();
    });

    it("removes expired events during cleanup", () => {
      const config = { ttlMs: 1000 };
      store = new WebhookEventIdempotencyStore(config);

      store.recordReceived("evt_123", now);
      store.recordReceived("evt_456", now + 500);

      // Both should exist initially
      expect(store.size()).toBe(2);

      // Cleanup at time now + 1500 - both are expired (>= 1000ms old)
      const removed = store.cleanupExpired(now + 1500);
      expect(removed).toBe(2); // both expired
      expect(store.get("evt_123", now + 1500)).toBeNull();
      expect(store.get("evt_456", now + 1500)).toBeNull();
    });
  });

  describe("processWithIdempotency", () => {
    it("processes new events", async () => {
      const processor = vi.fn().mockResolvedValue({ processed: true });

      const result = await store.processWithIdempotency("evt_123", processor, now);

      expect(result.shouldProcess).toBe(true);
      expect(result.result).toEqual({ processed: true });
      expect(processor).toHaveBeenCalledTimes(1);
    });

    it("skips processing for duplicate events", async () => {
      const processor = vi.fn().mockResolvedValue({ processed: true });

      // First call - should process
      await store.processWithIdempotency("evt_123", processor, now);

      // Second call - should skip
      const result = await store.processWithIdempotency("evt_123", processor, now + 1000);

      expect(result.shouldProcess).toBe(false);
      expect(processor).toHaveBeenCalledTimes(1); // Only called once
    });

    it("does not mark as processed on error", async () => {
      const processor = vi.fn().mockRejectedValue(new Error("Processing failed"));

      await expect(store.processWithIdempotency("evt_123", processor, now)).rejects.toThrow(
        "Processing failed"
      );

      // Event should not be marked as processed
      expect(store.isProcessed("evt_123", now)).toBe(false);
    });

    it("allows retry after failure", async () => {
      let callCount = 0;
      const processor = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error("First attempt failed");
        return Promise.resolve({ processed: true });
      });

      // First attempt fails
      await expect(store.processWithIdempotency("evt_123", processor, now)).rejects.toThrow();

      // Second attempt should process (event not marked as processed)
      const result = await store.processWithIdempotency("evt_123", processor, now + 1000);
      expect(result.shouldProcess).toBe(true);
      expect(result.result).toEqual({ processed: true });
    });
  });

  describe("store management", () => {
    it("returns all non-expired records", () => {
      store.recordReceived("evt_123", now);
      store.recordReceived("evt_456", now);

      const all = store.getAllRecords();
      expect(all).toHaveLength(2);
      expect(all.map((r) => r.eventId)).toContain("evt_123");
      expect(all.map((r) => r.eventId)).toContain("evt_456");
    });

    it("clears all records", () => {
      store.recordReceived("evt_123", now);
      store.recordReceived("evt_456", now);

      expect(store.size()).toBe(2);

      store.clear();

      expect(store.size()).toBe(0);
      expect(store.get("evt_123", now)).toBeNull();
    });
  });

  describe("default config", () => {
    it("uses sensible defaults", () => {
      expect(DEFAULT_WEBHOOK_IDEMPOTENCY_CONFIG.ttlMs).toBe(24 * 60 * 60 * 1000); // 24 hours
      expect(DEFAULT_WEBHOOK_IDEMPOTENCY_CONFIG.maxEvents).toBe(10000);
    });
  });
});

describe("Webhook Idempotency Integration", () => {
  const now = Date.now();

  it("first delivery produces side effects, duplicate does not", async () => {
    const store = new WebhookEventIdempotencyStore();
    let sideEffectCount = 0;

    const processor = async () => {
      sideEffectCount++;
      return { status: "charged", amount: 100 };
    };

    // First delivery
    const result1 = await store.processWithIdempotency("evt_payment_123", processor, now);
    expect(result1.shouldProcess).toBe(true);
    expect(sideEffectCount).toBe(1);

    // Duplicate delivery
    const result2 = await store.processWithIdempotency("evt_payment_123", processor, now + 1000);
    expect(result2.shouldProcess).toBe(false);
    expect(sideEffectCount).toBe(1); // No additional side effect
    expect(result2.record.processed).toBe(true);
  });

  it("different event IDs are processed independently", async () => {
    const store = new WebhookEventIdempotencyStore();
    let sideEffectCount = 0;

    const processor = async () => {
      sideEffectCount++;
      return { status: "ok" };
    };

    await store.processWithIdempotency("evt_1", processor, now);
    await store.processWithIdempotency("evt_2", processor, now);
    await store.processWithIdempotency("evt_1", processor, now + 1000); // Duplicate

    expect(sideEffectCount).toBe(2); // evt_1 and evt_2
  });
});
