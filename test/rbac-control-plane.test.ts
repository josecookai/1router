import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("control-plane RBAC matrix", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const matrix = [
    { role: "owner", expectCode: { models: 200, keysGet: 200, keysPost: 201, policiesGet: 200, policiesPost: 201, billingGet: 200 } },
    { role: "admin", expectCode: { models: 200, keysGet: 200, keysPost: 201, policiesGet: 200, policiesPost: 201, billingGet: 200 } },
    { role: "developer", expectCode: { models: 200, keysGet: 200, keysPost: 403, policiesGet: 200, policiesPost: 403, billingGet: 403 } },
    { role: "billing", expectCode: { models: 200, keysGet: 403, keysPost: 403, policiesGet: 403, policiesPost: 403, billingGet: 200 } },
    { role: "viewer", expectCode: { models: 200, keysGet: 403, keysPost: 403, policiesGet: 403, policiesPost: 403, billingGet: 403 } }
  ] as const;

  it("enforces owner/admin/developer/billing/viewer matrix", async () => {
    for (const row of matrix) {
      const headers = { "x-org-role": row.role };

      const models = await app.inject({ method: "GET", url: "/api/models", headers });
      expect(models.statusCode).toBe(row.expectCode.models);

      const keysGet = await app.inject({ method: "GET", url: "/api/keys", headers });
      expect(keysGet.statusCode).toBe(row.expectCode.keysGet);

      const keysPost = await app.inject({
        method: "POST",
        url: "/api/keys",
        headers,
        payload: { provider: "openai", label: `label-${row.role}` }
      });
      expect(keysPost.statusCode).toBe(row.expectCode.keysPost);

      const policiesGet = await app.inject({ method: "GET", url: "/api/policies", headers });
      expect(policiesGet.statusCode).toBe(row.expectCode.policiesGet);

      const policiesPost = await app.inject({
        method: "POST",
        url: "/api/policies",
        headers,
        payload: {
          name: `policy-${row.role}`,
          route: "/v1/chat/completions",
          weights: [{ provider: "openai", value: 1 }]
        }
      });
      expect(policiesPost.statusCode).toBe(row.expectCode.policiesPost);

      const billing = await app.inject({
        method: "GET",
        url: "/api/orgs/org_demo/invoice?month=2026-02",
        headers
      });
      expect(billing.statusCode).toBe(row.expectCode.billingGet);
    }
  });

  it("returns 403 with role/scope context for forbidden requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/policies",
      headers: { "x-org-role": "viewer" },
      payload: {
        name: "viewer-blocked",
        route: "/v1/chat/completions",
        weights: [{ provider: "openai", value: 1 }]
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "RBAC policy denied request",
        request_id: res.headers["x-request-id"],
        details: {
          role: "viewer",
          scope: "write_policies"
        }
      }
    });
  });
});
