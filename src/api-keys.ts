import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const apiKeyCreateRequestSchema = z.object({
  provider: z.string().min(1),
  label: z.string().min(1)
});

export const apiKeyMetadataSchema = z.object({
  id: z.string(),
  provider: z.string(),
  label: z.string(),
  last4: z.string().length(4),
  status: z.enum(["active", "inactive"])
});

export const apiKeysListResponseSchema = z.object({
  data: z.array(apiKeyMetadataSchema),
  meta: z.object({
    request_id: z.string()
  })
});

export const createApiKeyResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    provider: z.string(),
    label: z.string(),
    key: z.string(),
    key_prefix: z.string(),
    last4: z.string().length(4),
    status: z.enum(["active", "inactive"])
  }),
  meta: z.object({
    request_id: z.string()
  })
});

type StoredApiKey = {
  id: string;
  provider: string;
  label: string;
  key_hash: string;
  key_prefix: string;
  last4: string;
  status: "active" | "inactive";
};

export function generateRouterApiKey() {
  const secret = randomBytes(18).toString("base64url");
  const key = `rk_live_${secret}`;
  return {
    key,
    key_prefix: key.slice(0, "rk_live_".length + 6),
    last4: key.slice(-4)
  };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export class InMemoryApiKeyStore {
  private keys: StoredApiKey[] = [];
  private nextId = 1;

  create(input: z.infer<typeof apiKeyCreateRequestSchema>) {
    const parsed = apiKeyCreateRequestSchema.parse(input);
    const generated = generateRouterApiKey();

    const record: StoredApiKey = {
      id: `key_${String(this.nextId++).padStart(2, "0")}`,
      provider: parsed.provider,
      label: parsed.label,
      key_hash: hashApiKey(generated.key),
      key_prefix: generated.key_prefix,
      last4: generated.last4,
      status: "active"
    };

    this.keys.push(record);

    return {
      stored: record,
      plaintext: generated.key
    };
  }

  list() {
    return this.keys.map((record) => ({
      id: record.id,
      provider: record.provider,
      label: record.label,
      last4: record.last4,
      status: record.status
    }));
  }

  // Test-only visibility to assert plaintext is not stored.
  snapshotStoredRecords() {
    return this.keys.map((record) => ({ ...record }));
  }
}

export function buildApiKeysListResponse(store: InMemoryApiKeyStore, requestId: string) {
  return apiKeysListResponseSchema.parse({
    data: store.list(),
    meta: { request_id: requestId }
  });
}

export function buildCreateApiKeyResponse(
  store: InMemoryApiKeyStore,
  body: unknown,
  requestId: string
) {
  const { stored, plaintext } = store.create(apiKeyCreateRequestSchema.parse(body));

  return createApiKeyResponseSchema.parse({
    data: {
      id: stored.id,
      provider: stored.provider,
      label: stored.label,
      key: plaintext,
      key_prefix: stored.key_prefix,
      last4: stored.last4,
      status: stored.status
    },
    meta: { request_id: requestId }
  });
}
