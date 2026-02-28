export type ProviderIncidentStoreOptions = {
  threshold: number;
  windowMs: number;
  cooldownMs: number;
  now?: () => number;
};

type ProviderState = {
  failureTimestamps: number[];
  drainedUntilMs: number | null;
};

export class InMemoryProviderIncidentStore {
  private readonly states = new Map<string, ProviderState>();
  private readonly now: () => number;
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;

  constructor(options: ProviderIncidentStoreOptions) {
    this.threshold = options.threshold;
    this.windowMs = options.windowMs;
    this.cooldownMs = options.cooldownMs;
    this.now = options.now ?? Date.now;
  }

  recordFailure(provider: string) {
    const nowMs = this.now();
    const state = this.states.get(provider) ?? { failureTimestamps: [], drainedUntilMs: null };
    state.failureTimestamps = state.failureTimestamps.filter((ts) => nowMs - ts <= this.windowMs);
    state.failureTimestamps.push(nowMs);
    if (state.failureTimestamps.length >= this.threshold) {
      state.drainedUntilMs = nowMs + this.cooldownMs;
      state.failureTimestamps = [];
    }
    this.states.set(provider, state);
  }

  isDrained(provider: string) {
    const nowMs = this.now();
    const state = this.states.get(provider);
    if (!state || state.drainedUntilMs === null) return false;
    if (state.drainedUntilMs <= nowMs) {
      state.drainedUntilMs = null;
      this.states.set(provider, state);
      return false;
    }
    return true;
  }
}
