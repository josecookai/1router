import { describe, expect, it } from "vitest";
import { selectRoutingCandidate } from "../src/routing-presets.js";

const CANDIDATES = [
  { provider: "openai", provider_model: "openai/gpt-4.1-mini", cost_per_1k_usd: 0.6, latency_ms: 320, success_rate: 0.985 },
  {
    provider: "anthropic",
    provider_model: "anthropic/claude-3-5-sonnet",
    cost_per_1k_usd: 0.9,
    latency_ms: 410,
    success_rate: 0.994
  },
  { provider: "google", provider_model: "google/gemini-2.0-flash", cost_per_1k_usd: 0.4, latency_ms: 240, success_rate: 0.965 }
];

describe("routing preset scoring", () => {
  it("selects cheapest model for cost preset", () => {
    const result = selectRoutingCandidate(CANDIDATES, "cost");
    expect(result.selected_provider).toBe("google");
    expect(result.candidates[0]?.rank).toBe(1);
  });

  it("selects fastest model for latency preset", () => {
    const result = selectRoutingCandidate(CANDIDATES, "latency");
    expect(result.selected_provider).toBe("google");
  });

  it("selects highest success model for success preset", () => {
    const result = selectRoutingCandidate(CANDIDATES, "success");
    expect(result.selected_provider).toBe("anthropic");
  });
});
