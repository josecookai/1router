import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loggerRedactPaths, redactHeaders } from "../src/infra.js";

describe("infra middleware baseline", () => {
  const app = buildApp({
    registerRoutes(instance) {
      instance.get("/boom", async () => {
        throw new Error("kaboom");
      });

      instance.get(
        "/validate",
        {
          schema: {
            querystring: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string", minLength: 1 }
              }
            }
          }
        },
        async () => {
          return { ok: true };
        }
      );
    }
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("adds x-request-id to successful responses", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("returns shared error envelope for unhandled errors", async () => {
    const res = await app.inject({ method: "GET", url: "/boom" });
    const body = res.json();

    expect(res.statusCode).toBe(500);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("formats validation failures with request_id", async () => {
    const res = await app.inject({ method: "GET", url: "/validate" });
    const body = res.json();

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Request validation failed");
    expect(body.error.request_id).toBe(res.headers["x-request-id"]);
    expect(Array.isArray(body.error.details)).toBe(true);
  });
});

describe("redaction helpers", () => {
  it("masks sensitive headers", () => {
    expect(
      redactHeaders({
        authorization: "Bearer abc",
        "x-api-key": "secret-key",
        "content-type": "application/json"
      })
    ).toEqual({
      authorization: "[REDACTED]",
      "x-api-key": "[REDACTED]",
      "content-type": "application/json"
    });
  });

  it("exports logger redact paths for request headers", () => {
    expect(loggerRedactPaths).toContain("req.headers.authorization");
    expect(loggerRedactPaths).toContain("req.headers.x-api-key");
    expect(loggerRedactPaths).toContain("headers.provider-key");
  });
});
