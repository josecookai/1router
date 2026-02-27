export type RoutingPreset = "cost" | "latency" | "success" | "balanced";

export type RoutingCandidateMetrics = {
  provider: string;
  provider_model: string;
  cost_per_1k_usd: number;
  latency_ms: number;
  success_rate: number;
};

export type ScoredRoutingCandidate = RoutingCandidateMetrics & {
  score: number;
  rank: number;
};

const PRESET_WEIGHTS: Record<RoutingPreset, { cost: number; latency: number; success: number }> = {
  cost: { cost: 0.7, latency: 0.15, success: 0.15 },
  latency: { cost: 0.1, latency: 0.8, success: 0.1 },
  success: { cost: 0.1, latency: 0.1, success: 0.8 },
  balanced: { cost: 0.34, latency: 0.33, success: 0.33 }
};

function normalizeAscending(value: number, min: number, max: number) {
  if (max === min) return 1;
  return 1 - (value - min) / (max - min);
}

function normalizeDescending(value: number, min: number, max: number) {
  if (max === min) return 1;
  return (value - min) / (max - min);
}

function roundScore(value: number) {
  return Number(value.toFixed(6));
}

export function scoreRoutingCandidates(candidates: RoutingCandidateMetrics[], preset: RoutingPreset): ScoredRoutingCandidate[] {
  const weights = PRESET_WEIGHTS[preset];
  const costs = candidates.map((c) => c.cost_per_1k_usd);
  const latencies = candidates.map((c) => c.latency_ms);
  const successes = candidates.map((c) => c.success_rate);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);
  const minSuccess = Math.min(...successes);
  const maxSuccess = Math.max(...successes);

  const scored = candidates.map((candidate) => {
    const costScore = normalizeAscending(candidate.cost_per_1k_usd, minCost, maxCost);
    const latencyScore = normalizeAscending(candidate.latency_ms, minLatency, maxLatency);
    const successScore = normalizeDescending(candidate.success_rate, minSuccess, maxSuccess);
    const score = roundScore(
      weights.cost * costScore + weights.latency * latencyScore + weights.success * successScore
    );

    return { ...candidate, score, rank: 0 };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.provider.localeCompare(b.provider))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function selectRoutingCandidate(candidates: RoutingCandidateMetrics[], preset: RoutingPreset) {
  const scored = scoreRoutingCandidates(candidates, preset);
  const selected = scored[0];

  if (!selected) {
    throw new Error("No routing candidates available");
  }

  return {
    preset,
    selected_provider: selected.provider,
    selected_provider_model: selected.provider_model,
    candidates: scored
  };
}
