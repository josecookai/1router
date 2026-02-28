import { hashApiKey, type InMemoryApiKeyStore } from "./api-keys.js";

export type RouterAuthContext = {
  api_key_id: string;
  key_prefix: string;
  org_id: string;
  project_id: string;
  scopes: Array<"inference:write" | "keys:read" | "billing:read" | "policies:write">;
};

export interface RouterApiKeyRepository {
  findActiveByHash(keyHash: string): {
    id: string;
    key_prefix: string;
    scopes: Array<"inference:write" | "keys:read" | "billing:read" | "policies:write">;
  } | null;
}

export class ApiKeyStoreRouterAuthRepository implements RouterApiKeyRepository {
  constructor(private readonly store: InMemoryApiKeyStore) {}

  findActiveByHash(keyHash: string) {
    const match = this.store.findActiveByHash(keyHash);
    if (!match) return null;
    return { id: match.id, key_prefix: match.key_prefix, scopes: match.scopes };
  }
}

export function parseBearerToken(authorization: string | undefined) {
  if (!authorization) return null;
  const [scheme, token, extra] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) return null;
  return token;
}

export function authenticateRouterKey(
  authorization: string | undefined,
  repo: RouterApiKeyRepository
): RouterAuthContext | null {
  const token = parseBearerToken(authorization);
  if (!token) return null;

  const found = repo.findActiveByHash(hashApiKey(token));
  if (!found) return null;

  return {
    api_key_id: found.id,
    key_prefix: found.key_prefix,
    org_id: "org_mock",
    project_id: "proj_mock",
    scopes: found.scopes
  };
}
