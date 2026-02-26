import { describe, expect, it } from "vitest";
import { buildModelsListResponse, modelsListResponseSchema } from "../src/models-catalog.js";

describe("buildModelsListResponse", () => {
  it("formats a static OpenAI-compatible list with router capabilities", () => {
    const created = 1_730_000_000;
    const payload = buildModelsListResponse(created);

    expect(modelsListResponseSchema.parse(payload)).toEqual(payload);
    expect(payload.object).toBe("list");
    expect(payload.data.length).toBeGreaterThanOrEqual(2);

    for (const model of payload.data) {
      expect(model.object).toBe("model");
      expect(model.created).toBe(created);
      expect(model.id).toMatch(/.+\/.+/);
      expect(model.x_router).toMatchObject({
        provider: expect.any(String),
        capabilities: {
          tools: expect.any(Boolean),
          vision: expect.any(Boolean),
          json_schema: expect.any(Boolean)
        }
      });
    }
  });
});
