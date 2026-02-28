import { describe, expect, it } from "vitest";
import { InMemoryProviderIncidentStore } from "../src/provider-incidents.js";

describe("InMemoryProviderIncidentStore", () => {
  it("drains provider after crossing threshold within window", () => {
    let now = 1_000;
    const store = new InMemoryProviderIncidentStore({
      threshold: 2,
      windowMs: 60_000,
      cooldownMs: 300_000,
      now: () => now
    });

    store.recordFailure("anthropic");
    expect(store.isDrained("anthropic")).toBe(false);
    store.recordFailure("anthropic");
    expect(store.isDrained("anthropic")).toBe(true);
  });

  it("recovers provider after cooldown elapses", () => {
    let now = 1_000;
    const store = new InMemoryProviderIncidentStore({
      threshold: 2,
      windowMs: 60_000,
      cooldownMs: 300_000,
      now: () => now
    });

    store.recordFailure("anthropic");
    store.recordFailure("anthropic");
    expect(store.isDrained("anthropic")).toBe(true);
    now += 300_001;
    expect(store.isDrained("anthropic")).toBe(false);
  });
});
