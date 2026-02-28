import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryApiKeyStore } from "../src/api-keys.js";
import { buildApp } from "../src/app.js";
import { InMemoryQuotaLimiter } from "../src/quotas.js";

describe("v1 quota/rate-limit enforcement", () => {
  function buildAuthedApp(quotaLimiter: InMemoryQuotaLimiter) {
    const apiKeyStore = new InMemoryApiKeyStore();
    const { plaintext } = apiKeyStore.create({ provider: "router", label: "quota-test" });
    const app = buildApp({ apiKeyStore, quotaLimiter });
    return { app, token: plaintext };
  }

  it("enforces api_key > project > org precedence for RPM violations", async () => {
    const keyScope = buildAuthedApp(
      new InMemoryQuotaLimiter({
        api_key: { rpm: 1, tpm: 1000, concurrency: 10 },
        project: { rpm: 10, tpm: 1000, concurrency: 10 },
        org: { rpm: 10, tpm: 1000, concurrency: 10 }
      })
    );
    await keyScope.app.ready();
    await keyScope.app.inject({ method: "GET", url: "/v1/models", headers: { authorization: `Bearer ${keyScope.token}` } });
    const keyRes = await keyScope.app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: `Bearer ${keyScope.token}` }
    });
    expect(keyRes.statusCode).toBe(429);
    expect(keyRes.json()).toMatchObject({ error: { details: { scope: "api_key", limit_type: "RPM_EXCEEDED" } } });
    await keyScope.app.close();

    const projectScope = buildAuthedApp(
      new InMemoryQuotaLimiter({
        api_key: { rpm: 10, tpm: 1000, concurrency: 10 },
        project: { rpm: 1, tpm: 1000, concurrency: 10 },
        org: { rpm: 10, tpm: 1000, concurrency: 10 }
      })
    );
    await projectScope.app.ready();
    await projectScope.app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: `Bearer ${projectScope.token}` }
    });
    const projectRes = await projectScope.app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: `Bearer ${projectScope.token}` }
    });
    expect(projectRes.statusCode).toBe(429);
    expect(projectRes.json()).toMatchObject({ error: { details: { scope: "project", limit_type: "RPM_EXCEEDED" } } });
    await projectScope.app.close();

    const orgScope = buildAuthedApp(
      new InMemoryQuotaLimiter({
        api_key: { rpm: 10, tpm: 1000, concurrency: 10 },
        project: { rpm: 10, tpm: 1000, concurrency: 10 },
        org: { rpm: 1, tpm: 1000, concurrency: 10 }
      })
    );
    await orgScope.app.ready();
    await orgScope.app.inject({ method: "GET", url: "/v1/models", headers: { authorization: `Bearer ${orgScope.token}` } });
    const orgRes = await orgScope.app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: `Bearer ${orgScope.token}` }
    });
    expect(orgRes.statusCode).toBe(429);
    expect(orgRes.json()).toMatchObject({ error: { details: { scope: "org", limit_type: "RPM_EXCEEDED" } } });
    await orgScope.app.close();
  });

  it("returns deterministic 429 envelope for burst and tpm limits", async () => {
    const { app, token } = buildAuthedApp(
      new InMemoryQuotaLimiter({
        api_key: { rpm: 2, tpm: 2, concurrency: 10 },
        project: { rpm: 10, tpm: 1000, concurrency: 10 },
        org: { rpm: 10, tpm: 1000, concurrency: 10 }
      })
    );
    await app.ready();

    await app.inject({ method: "GET", url: "/v1/models", headers: { authorization: `Bearer ${token}` } });
    await app.inject({ method: "GET", url: "/v1/models", headers: { authorization: `Bearer ${token}` } });
    const burst = await app.inject({ method: "GET", url: "/v1/models", headers: { authorization: `Bearer ${token}` } });
    expect(burst.statusCode).toBe(429);
    expect(burst.headers["x-request-id"]).toBeTruthy();
    expect(burst.json()).toMatchObject({
      error: {
        code: "RATE_LIMITED",
        request_id: burst.headers["x-request-id"],
        details: {
          scope: "api_key",
          limit_type: "RPM_EXCEEDED",
          limit: 2
        }
      }
    });

    await app.close();
  });
});
