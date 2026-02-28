import { describe, expect, it } from "vitest";
import { InMemoryQuotaLimiter } from "../src/quotas.js";

describe("InMemoryQuotaLimiter", () => {
  it("enforces concurrency limits and releases on completion", () => {
    const limiter = new InMemoryQuotaLimiter({
      api_key: { rpm: 100, tpm: 1000, concurrency: 1 },
      project: { rpm: 100, tpm: 1000, concurrency: 10 },
      org: { rpm: 100, tpm: 1000, concurrency: 10 }
    });

    const first = limiter.acquire({
      method: "POST",
      path: "/v1/responses",
      body: { input: "hello" },
      scope: { apiKeyId: "key_1", orgId: "org_1", projectId: "proj_1" },
      nowMs: 1_700_000_000_000
    });
    expect(first.ok).toBe(true);

    const second = limiter.acquire({
      method: "POST",
      path: "/v1/responses",
      body: { input: "world" },
      scope: { apiKeyId: "key_1", orgId: "org_1", projectId: "proj_1" },
      nowMs: 1_700_000_000_100
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.violation).toMatchObject({ scope: "api_key", code: "CONCURRENCY_EXCEEDED", limit: 1 });
    }

    if (first.ok) first.release();

    const third = limiter.acquire({
      method: "POST",
      path: "/v1/responses",
      body: { input: "retry" },
      scope: { apiKeyId: "key_1", orgId: "org_1", projectId: "proj_1" },
      nowMs: 1_700_000_000_200
    });
    expect(third.ok).toBe(true);
    if (third.ok) third.release();
  });

  it("enforces token-per-minute limits", () => {
    const limiter = new InMemoryQuotaLimiter({
      api_key: { rpm: 100, tpm: 5, concurrency: 10 },
      project: { rpm: 100, tpm: 1000, concurrency: 10 },
      org: { rpm: 100, tpm: 1000, concurrency: 10 }
    });

    const first = limiter.acquire({
      method: "POST",
      path: "/v1/responses",
      body: { input: "12345678" },
      scope: { apiKeyId: "key_1", orgId: "org_1", projectId: "proj_1" },
      nowMs: 1_700_000_000_000
    });
    expect(first.ok).toBe(true);
    if (first.ok) first.release();

    const second = limiter.acquire({
      method: "POST",
      path: "/v1/responses",
      body: { input: "abcdefgh" },
      scope: { apiKeyId: "key_1", orgId: "org_1", projectId: "proj_1" },
      nowMs: 1_700_000_000_100
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.violation).toMatchObject({ scope: "api_key", code: "TPM_EXCEEDED", limit: 5 });
    }
  });
});
