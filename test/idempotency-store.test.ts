import { describe, expect, it } from "vitest";
import { InMemoryIdempotencyStore } from "../src/idempotency.js";

describe("InMemoryIdempotencyStore", () => {
  it("returns stored record before ttl expiry and null after expiry", () => {
    let now = 1_000;
    const store = new InMemoryIdempotencyStore<{ ok: boolean }>({
      defaultTtlMs: 100,
      now: () => now
    });
    store.set({
      key: "k1",
      fingerprint: "fp1",
      response: { ok: true }
    });

    expect(store.get("k1")?.fingerprint).toBe("fp1");
    now = 1_200;
    expect(store.get("k1")).toBeNull();
  });
});
