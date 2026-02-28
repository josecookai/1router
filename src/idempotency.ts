import { createHash } from "node:crypto";

export type IdempotencyRecord<T> = {
  key: string;
  fingerprint: string;
  response: T;
};

type StoreEntry<T> = {
  record: IdempotencyRecord<T>;
  expiresAtMs: number | null;
};

type InMemoryIdempotencyStoreOptions = {
  defaultTtlMs?: number | null;
  now?: () => number;
};

export class InMemoryIdempotencyStore<T> {
  private readonly records = new Map<string, StoreEntry<T>>();
  private readonly defaultTtlMs: number | null;
  private readonly now: () => number;

  constructor(options: InMemoryIdempotencyStoreOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? null;
    this.now = options.now ?? Date.now;
  }

  get(key: string) {
    const entry = this.records.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs !== null && entry.expiresAtMs <= this.now()) {
      this.records.delete(key);
      return null;
    }
    return entry.record;
  }

  set(record: IdempotencyRecord<T>, ttlMs?: number | null) {
    const effectiveTtl = ttlMs ?? this.defaultTtlMs;
    const expiresAtMs = effectiveTtl === null ? null : this.now() + Math.max(0, effectiveTtl);
    this.records.set(record.key, { record, expiresAtMs });
  }
}

export function buildPayloadFingerprint(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
