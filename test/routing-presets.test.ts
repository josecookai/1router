import { describe, expect, it } from "vitest";
import { selectRoutingCandidate, type RoutingCandidateMetrics } from "../src/routing-presets.js";

describe("routing with drained providers", () => {
  const CANDIDATES_WITH_DRAIN: RoutingCandidateMetrics[] = [
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

  it("excludes drained providers from selection", () => {
    const drainedProviders = new Set(["google"]);
    const result = selectRoutingCandidate(CANDIDATES_WITH_DRAIN, "cost", undefined, drainedProviders);

    // Without google (cheapest), should select openai
    expect(result.selected_provider).toBe("openai");
    expect(result.health.drained_providers).toContain("google");
    expect(result.health.drained_providers_excluded).toBe(true);
  });

  it("excludes drained providers from region filtering", () => {
    const drainedProviders = new Set(["openai"]);
    const result = selectRoutingCandidate(CANDIDATES_WITH_DRAIN, "cost", "EU", drainedProviders);

    // openai is drained, so no EU candidates remain - should fallback
    expect(result.region.fallback_used).toBe(true);
    expect(result.health.drained_providers).toContain("openai");
  });

  it("tracks both region and drain exclusions", () => {
    const drainedProviders = new Set(["google"]);
    // Request EU region: openai matches, anthropic doesn't match (US only), google is drained
    const result = selectRoutingCandidate(CANDIDATES_WITH_DRAIN, "cost", "EU", drainedProviders);

    const drainExclusions = result.region.excluded_candidates.filter((e) => e.reason === "PROVIDER_DRAINED");
    const regionExclusions = result.region.excluded_candidates.filter((e) => e.reason === "REGION_MISMATCH");

    expect(drainExclusions).toHaveLength(1);
    expect(drainExclusions[0]?.provider).toBe("google");
    expect(regionExclusions).toHaveLength(1);
    expect(regionExclusions[0]?.provider).toBe("anthropic");
  });

  it("throws error when all providers are drained", () => {
    const drainedProviders = new Set(["openai", "anthropic", "google"]);

    expect(() => selectRoutingCandidate(CANDIDATES_WITH_DRAIN, "cost", undefined, drainedProviders)).toThrow(
      "No routing candidates available"
    );
  });

  it("works without drained providers set (backward compatible)", () => {
    const result = selectRoutingCandidate(CANDIDATES_WITH_DRAIN, "cost");

    expect(result.selected_provider).toBe("google");
    expect(result.health.drained_providers).toHaveLength(0);
    expect(result.health.drained_providers_excluded).toBe(false);
  });
});

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
