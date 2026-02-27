import { describe, expect, it } from "vitest";
import { selectRoutingCandidate, type RoutingCandidateMetrics } from "../src/routing-presets.js";

const CANDIDATES: RoutingCandidateMetrics[] = [
  {
    provider: "openai",
    provider_model: "openai/gpt-4.1-mini",
    regions: ["US", "EU"],
    cost_per_1k_usd: 0.6,
    latency_ms: 320,
    success_rate: 0.985
  },
  {
    provider: "anthropic",
    provider_model: "anthropic/claude-3-5-sonnet",
    regions: ["US"],
    cost_per_1k_usd: 0.9,
    latency_ms: 410,
    success_rate: 0.994
  },
  {
    provider: "google",
    provider_model: "google/gemini-2.0-flash",
    regions: ["APAC"],
    cost_per_1k_usd: 0.4,
    latency_ms: 240,
    success_rate: 0.965
  }
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

  it("filters candidates by region when matches exist", () => {
    const result = selectRoutingCandidate(CANDIDATES, "cost", "EU");
    expect(result.selected_provider).toBe("openai");
    expect(result.region.requested_region).toBe("EU");
    expect(result.region.fallback_used).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.region.excluded_candidates).toHaveLength(2);
  });

  it("falls back to full candidate set when no candidate matches requested region", () => {
    const candidates: RoutingCandidateMetrics[] = [
      {
        provider: "openai",
        provider_model: "openai/gpt-4.1-mini",
        regions: ["US"],
        cost_per_1k_usd: 0.6,
        latency_ms: 320,
        success_rate: 0.985
      },
      {
        provider: "anthropic",
        provider_model: "anthropic/claude-3-5-sonnet",
        regions: ["US"],
        cost_per_1k_usd: 0.9,
        latency_ms: 410,
        success_rate: 0.994
      }
    ];

    const result = selectRoutingCandidate(candidates, "success", "APAC");
    expect(result.region.requested_region).toBe("APAC");
    expect(result.region.fallback_used).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.region.excluded_candidates).toHaveLength(2);
  });
});
