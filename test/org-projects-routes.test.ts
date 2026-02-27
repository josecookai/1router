import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("org/project control-plane endpoints", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("supports org create/list/update flow", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/orgs",
      payload: {
        name: "Acme Inc"
      }
    });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.headers["x-request-id"]).toBeTruthy();
    const createdOrg = createRes.json().data as { id: string; name: string; status: string };
    expect(createdOrg).toMatchObject({
      id: expect.any(String),
      name: "Acme Inc",
      status: "active"
    });

    const listRes = await app.inject({ method: "GET", url: "/api/orgs" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.headers["x-request-id"]).toBeTruthy();
    expect(listRes.json().data.some((item: { id: string }) => item.id === createdOrg.id)).toBe(true);

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/api/orgs/${createdOrg.id}`,
      payload: {
        status: "inactive"
      }
    });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.headers["x-request-id"]).toBeTruthy();
    expect(updateRes.json()).toMatchObject({
      data: {
        id: createdOrg.id,
        name: "Acme Inc",
        status: "inactive"
      },
      meta: {
        request_id: updateRes.headers["x-request-id"]
      }
    });
  });

  it("supports project create/list/update flow", async () => {
    const createOrgRes = await app.inject({
      method: "POST",
      url: "/api/orgs",
      payload: { name: "Project Owner Org" }
    });
    const orgId = createOrgRes.json().data.id as string;

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        org_id: orgId,
        name: "Project Alpha"
      }
    });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.headers["x-request-id"]).toBeTruthy();
    const createdProject = createRes.json().data as { id: string; org_id: string; name: string; status: string };
    expect(createdProject).toMatchObject({
      id: expect.any(String),
      org_id: orgId,
      name: "Project Alpha",
      status: "active"
    });

    const listRes = await app.inject({ method: "GET", url: "/api/projects" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.headers["x-request-id"]).toBeTruthy();
    expect(listRes.json().data.some((item: { id: string }) => item.id === createdProject.id)).toBe(true);

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/api/projects/${createdProject.id}`,
      payload: {
        name: "Project Alpha v2",
        status: "inactive"
      }
    });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.headers["x-request-id"]).toBeTruthy();
    expect(updateRes.json()).toMatchObject({
      data: {
        id: createdProject.id,
        org_id: orgId,
        name: "Project Alpha v2",
        status: "inactive"
      },
      meta: {
        request_id: updateRes.headers["x-request-id"]
      }
    });
  });

  it("returns shared error envelope on malformed org payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/orgs",
      payload: { name: "" }
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid org payload",
        request_id: res.headers["x-request-id"]
      }
    });
  });

  it("returns shared error envelope on malformed project payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { org_id: "", name: "" }
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid project payload",
        request_id: res.headers["x-request-id"]
      }
    });
  });
});
