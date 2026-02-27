import { createHash } from "node:crypto";

export type IdempotencyRecord<T> = {
  key: string;
  fingerprint: string;
  response: T;
};

export class InMemoryIdempotencyStore<T> {
  private readonly records = new Map<string, IdempotencyRecord<T>>();

  get(key: string) {
    return this.records.get(key) ?? null;
  }

  set(record: IdempotencyRecord<T>) {
    this.records.set(record.key, record);
  }
}

export function buildPayloadFingerprint(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
