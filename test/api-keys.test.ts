import { describe, expect, it } from "vitest";
import {
  InMemoryApiKeyStore,
  buildCreateApiKeyResponse,
  generateRouterApiKey,
  hashApiKey
} from "../src/api-keys.js";

describe("api key helpers", () => {
  it("generates rk_live_ keys and stable hashes", () => {
    const generated = generateRouterApiKey();

    expect(generated.key.startsWith("rk_live_")).toBe(true);
    expect(generated.last4).toHaveLength(4);
    expect(hashApiKey(generated.key)).toHaveLength(64);
    expect(hashApiKey("same")).toBe(hashApiKey("same"));
  });

  it("stores hash/prefix only and not plaintext", () => {
    const store = new InMemoryApiKeyStore();
    const created = buildCreateApiKeyResponse(store, { provider: "openai", label: "prod" }, "req_1");
    const snapshot = store.snapshotStoredRecords();
    const stored = snapshot[0];

    expect(stored).toBeTruthy();
    expect(stored?.key_hash).toHaveLength(64);
    expect(stored?.key_prefix.startsWith("rk_live_")).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain(created.data.key);
  });
});
