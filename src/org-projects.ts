import { z } from "zod";

const nonEmptyString = z.string().min(1);
const statusSchema = z.enum(["active", "inactive"]);

const orgMutableSchema = z.object({
  name: nonEmptyString,
  status: statusSchema.default("active")
});

export const createOrgSchema = orgMutableSchema.strict();
export const updateOrgSchema = orgMutableSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "at least one field must be provided"
});

export const orgRecordSchema = z.object({
  id: z.string(),
  name: nonEmptyString,
  status: statusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
export type OrgRecord = z.infer<typeof orgRecordSchema>;

const projectMutableSchema = z.object({
  org_id: nonEmptyString,
  name: nonEmptyString,
  status: statusSchema.default("active")
});

export const createProjectSchema = projectMutableSchema.strict();
export const updateProjectSchema = projectMutableSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "at least one field must be provided"
});

export const projectRecordSchema = z.object({
  id: z.string(),
  org_id: nonEmptyString,
  name: nonEmptyString,
  status: statusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ProjectRecord = z.infer<typeof projectRecordSchema>;

export interface OrgProjectRepository {
  listOrgs(): OrgRecord[];
  createOrg(input: CreateOrgInput): OrgRecord;
  updateOrg(orgId: string, input: UpdateOrgInput): OrgRecord | null;
  listProjects(): ProjectRecord[];
  createProject(input: CreateProjectInput): ProjectRecord;
  updateProject(projectId: string, input: UpdateProjectInput): ProjectRecord | null;
}

export class InMemoryOrgProjectStore implements OrgProjectRepository {
  private readonly orgs: OrgRecord[];
  private readonly projects: ProjectRecord[];
  private nextOrgId: number;
  private nextProjectId: number;

  constructor(seedOrgs: OrgRecord[] = [], seedProjects: ProjectRecord[] = []) {
    this.orgs = [...seedOrgs];
    this.projects = [...seedProjects];
    this.nextOrgId = this.orgs.length + 1;
    this.nextProjectId = this.projects.length + 1;
  }

  listOrgs() {
    return [...this.orgs];
  }

  createOrg(input: CreateOrgInput) {
    const now = new Date().toISOString();
    const created = orgRecordSchema.parse({
      id: `org_${String(this.nextOrgId).padStart(2, "0")}`,
      name: input.name,
      status: input.status,
      created_at: now,
      updated_at: now
    });

    this.nextOrgId += 1;
    this.orgs.push(created);
    return created;
  }

  updateOrg(orgId: string, input: UpdateOrgInput) {
    const index = this.orgs.findIndex((item) => item.id === orgId);
    if (index < 0) return null;

    const current = this.orgs[index];
    const updated = orgRecordSchema.parse({
      ...current,
      ...input,
      updated_at: new Date().toISOString()
    });

    this.orgs[index] = updated;
    return updated;
  }

  listProjects() {
    return [...this.projects];
  }

  createProject(input: CreateProjectInput) {
    const now = new Date().toISOString();
    const created = projectRecordSchema.parse({
      id: `prj_${String(this.nextProjectId).padStart(2, "0")}`,
      org_id: input.org_id,
      name: input.name,
      status: input.status,
      created_at: now,
      updated_at: now
    });

    this.nextProjectId += 1;
    this.projects.push(created);
    return created;
  }

  updateProject(projectId: string, input: UpdateProjectInput) {
    const index = this.projects.findIndex((item) => item.id === projectId);
    if (index < 0) return null;

    const current = this.projects[index];
    const updated = projectRecordSchema.parse({
      ...current,
      ...input,
      updated_at: new Date().toISOString()
    });

    this.projects[index] = updated;
    return updated;
  }
}
