type Role = "owner" | "admin" | "developer" | "billing" | "viewer";
type Action = "read_models" | "read_keys" | "write_keys" | "read_policies" | "write_policies" | "read_billing";

const ROLE_ALLOW: Record<Role, ReadonlySet<Action>> = {
  owner: new Set(["read_models", "read_keys", "write_keys", "read_policies", "write_policies", "read_billing"]),
  admin: new Set(["read_models", "read_keys", "write_keys", "read_policies", "write_policies", "read_billing"]),
  developer: new Set(["read_models", "read_keys", "read_policies"]),
  billing: new Set(["read_models", "read_billing"]),
  viewer: new Set(["read_models"])
};

const ROLE_VALUES = new Set<Role>(["owner", "admin", "developer", "billing", "viewer"]);

export function parseRole(value: unknown): Role {
  if (typeof value !== "string") return "owner";
  const lowered = value.trim().toLowerCase();
  if (!ROLE_VALUES.has(lowered as Role)) return "owner";
  return lowered as Role;
}

export function requiredActionForRoute(method: string, path: string): Action | null {
  if (method === "GET" && path === "/api/models") return "read_models";
  if (method === "GET" && path === "/api/keys") return "read_keys";
  if (method === "POST" && path === "/api/keys") return "write_keys";
  if (method === "GET" && path === "/api/policies") return "read_policies";
  if (method === "POST" && path === "/api/policies") return "write_policies";
  if (method === "GET" && path === "/api/usage") return "read_billing";
  if (method === "GET" && path === "/api/billing") return "read_billing";
  if (method === "GET" && path === "/api/orgs/:orgId/invoice") return "read_billing";
  return null;
}

export function canRoleAccess(role: Role, action: Action) {
  return ROLE_ALLOW[role].has(action);
}

export type { Role, Action };
