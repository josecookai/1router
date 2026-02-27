import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_HEADER = "x-1router-webhook-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-1router-webhook-timestamp";
export const WEBHOOK_ID_HEADER = "x-1router-webhook-id";

export type VerifyWebhookSignatureParams = {
  secret: string;
  timestamp: string;
  signature: string;
  body: string;
  nowMs?: number;
  replayWindowSeconds?: number;
};

export function buildWebhookSigningPayload(timestamp: string, body: string) {
  return `${timestamp}.${body}`;
}

export function createWebhookSignature(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(buildWebhookSigningPayload(timestamp, body)).digest("hex");
}

export function buildSignedWebhookHeaders(params: {
  secret: string;
  body: string;
  timestamp?: string;
  deliveryId: string;
}) {
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signature = createWebhookSignature(params.secret, timestamp, params.body);
  return {
    [WEBHOOK_ID_HEADER]: params.deliveryId,
    [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    [WEBHOOK_SIGNATURE_HEADER]: `v1=${signature}`
  };
}

export function isWebhookTimestampFresh(timestamp: string, nowMs = Date.now(), replayWindowSeconds = 300) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return Math.abs(nowMs - ts * 1000) <= replayWindowSeconds * 1000;
}

function timingSafeEqualHex(a: string, b: string) {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function verifyWebhookSignature(params: VerifyWebhookSignatureParams) {
  const replayWindowSeconds = params.replayWindowSeconds ?? 300;
  const nowMs = params.nowMs ?? Date.now();
  if (!isWebhookTimestampFresh(params.timestamp, nowMs, replayWindowSeconds)) {
    return { ok: false as const, error: "STALE_TIMESTAMP" as const };
  }

  const received = params.signature.startsWith("v1=") ? params.signature.slice(3) : params.signature;
  if (!/^[0-9a-f]{64}$/i.test(received)) {
    return { ok: false as const, error: "INVALID_SIGNATURE_FORMAT" as const };
  }

  const expected = createWebhookSignature(params.secret, params.timestamp, params.body);
  if (!timingSafeEqualHex(expected, received.toLowerCase())) {
    return { ok: false as const, error: "SIGNATURE_MISMATCH" as const };
  }

  return { ok: true as const };
}
