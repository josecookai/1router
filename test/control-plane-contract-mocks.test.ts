import { describe, expect, it } from "vitest";
import { apiPoliciesListMock, controlPlaneModelsMock, orgUsageMock } from "../src/generated/api-mocks.js";

function assertRequiredObjectFields(value: unknown, fields: string[], context: string) {
  expect(value, `${context} must be an object`).toBeTypeOf("object");
  expect(value).not.toBeNull();
  const record = value as Record<string, unknown>;
  for (const field of fields) {
    expect(record[field], `${context}.${field} is required`).not.toBeUndefined();
  }
}

describe("control-plane contract mocks", () => {
  it("keeps required fields for /api/models response", () => {
    assertRequiredObjectFields(controlPlaneModelsMock, ["data", "meta"], "/api/models");
    assertRequiredObjectFields(controlPlaneModelsMock.meta, ["request_id"], "/api/models.meta");
    expect(Array.isArray(controlPlaneModelsMock.data)).toBe(true);
    expect(controlPlaneModelsMock.data.length).toBeGreaterThan(0);
    assertRequiredObjectFields(controlPlaneModelsMock.data[0], ["id", "provider", "capabilities"], "/api/models.data[0]");
  });

  it("keeps required fields for /api/orgs/{orgId}/usage response", () => {
    assertRequiredObjectFields(orgUsageMock, ["data", "meta"], "/api/orgs/{orgId}/usage");
    assertRequiredObjectFields(orgUsageMock.meta, ["request_id"], "/api/orgs/{orgId}/usage.meta");
    assertRequiredObjectFields(
      orgUsageMock.data,
      ["org_id", "from", "to", "group_by", "provisional", "finalized_at", "totals", "summary", "buckets"],
      "/api/orgs/{orgId}/usage.data"
    );
    assertRequiredObjectFields(
      orgUsageMock.data.totals,
      ["requests", "input_tokens", "output_tokens", "total_tokens", "cost_usd", "platform_fee_usd", "provisional", "finalized_at"],
      "/api/orgs/{orgId}/usage.data.totals"
    );
  });

  it("keeps required fields for /api/policies response", () => {
    assertRequiredObjectFields(apiPoliciesListMock, ["data", "meta"], "/api/policies");
    assertRequiredObjectFields(apiPoliciesListMock.meta, ["request_id"], "/api/policies.meta");
    expect(Array.isArray(apiPoliciesListMock.data)).toBe(true);
    expect(apiPoliciesListMock.data.length).toBeGreaterThan(0);
    assertRequiredObjectFields(
      apiPoliciesListMock.data[0],
      ["id", "name", "route", "status", "weights", "fallback_chain", "created_at"],
      "/api/policies.data[0]"
    );
  });

  it("detects required field drift when a field is removed", () => {
    const drifted = {
      ...controlPlaneModelsMock,
      meta: {}
    } as unknown;

    expect(() => assertRequiredObjectFields((drifted as { meta: unknown }).meta, ["request_id"], "drifted.meta")).toThrow(
      /required/
    );
  });
});
