import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { FixtureUsageRepository, type UsageEvent } from "../src/usage-report.js";

describe("usage and billing dashboard listing APIs", () => {
  const events: UsageEvent[] = [
    {
      org_id: "org_demo",
      project_id: "proj_a",
      ts: "2026-02-27T10:00:00.000Z",
      model: "openai/gpt-4.1-mini",
      finalized_at: "2026-02-27T10:30:00.000Z",
      requests: 4,
      input_tokens: 400,
      output_tokens: 100,
      cost_usd: 0.05,
      platform_fee_usd: 0.01
    },
    {
      org_id: "org_demo",
      project_id: "proj_b",
      ts: "2026-02-27T11:00:00.000Z",
      model: "anthropic/claude-3.5-haiku",
      finalized_at: null,
      requests: 3,
      input_tokens: 300,
      output_tokens: 90,
      cost_usd: 0.04,
      platform_fee_usd: 0.008
    },
    {
      org_id: "org_demo",
      project_id: "proj_a",
      ts: "2026-02-27T12:00:00.000Z",
      model: "openai/text-embedding-3-small",
      finalized_at: null,
      requests: 2,
      input_tokens: 220,
      output_tokens: 0,
      cost_usd: 0.01,
      platform_fee_usd: 0.002
    }
  ];

  const app = buildApp({ usageRepo: new FixtureUsageRepository(events) });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("supports cursor pagination for /api/usage", async () => {
    const page1 = await app.inject({
      method: "GET",
      url: "/api/usage?org_id=org_demo&from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z&limit=2",
      headers: { "x-org-role": "owner" }
    });

    expect(page1.statusCode).toBe(200);
    expect(page1.json().data).toHaveLength(2);
    expect(page1.json().meta.page.next_cursor).toBeTruthy();

    const page2 = await app.inject({
      method: "GET",
      url: `/api/usage?org_id=org_demo&from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z&limit=2&cursor=${page1.json().meta.page.next_cursor}`,
      headers: { "x-org-role": "owner" }
    });

    expect(page2.statusCode).toBe(200);
    expect(page2.json().data).toHaveLength(1);
    expect(page2.json().meta.page.next_cursor).toBeNull();
  });

  it("applies filter combinations on /api/usage", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/usage?org_id=org_demo&project_id=proj_a&provider=openai&model=openai/gpt-4.1-mini&from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z",
      headers: { "x-org-role": "owner" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({
      project_id: "proj_a",
      provider: "openai",
      model: "openai/gpt-4.1-mini"
    });
  });

  it("supports cursor and filters on /api/billing", async () => {
    const filtered = await app.inject({
      method: "GET",
      url: "/api/billing?org_id=org_demo&provider=anthropic&from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z&limit=1",
      headers: { "x-org-role": "owner" }
    });

    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().data).toHaveLength(1);
    expect(filtered.json().data[0]).toMatchObject({
      provider: "anthropic",
      project_id: "proj_b",
      quantity: 3
    });

    const page1 = await app.inject({
      method: "GET",
      url: "/api/billing?org_id=org_demo&from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z&limit=1",
      headers: { "x-org-role": "owner" }
    });

    expect(page1.statusCode).toBe(200);
    expect(page1.json().data).toHaveLength(1);
    expect(page1.json().meta.page.next_cursor).toBeTruthy();
  });
});
