import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { WebhookEventIdempotencyStore } from "./webhook-idempotency.js";
import { WEBHOOK_ID_HEADER, verifyWebhookSignature } from "./webhooks.js";

/** Payment webhook event types */
export type PaymentWebhookEventType =
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed"
  | "invoice.payment_succeeded"
  | "invoice.payment_failed"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.deleted";

/** Payment webhook payload schema */
export const paymentWebhookPayloadSchema = z.object({
  id: z.string().min(1),
  object: z.literal("event"),
  api_version: z.string().optional(),
  created: z.number().int().positive(),
  data: z.object({
    object: z.record(z.unknown())
  }),
  livemode: z.boolean(),
  pending_webhooks: z.number().int().nonnegative().optional(),
  request: z
    .object({
      id: z.string().optional(),
      idempotency_key: z.string().optional()
    })
    .optional(),
  type: z.string().min(1)
});

export type PaymentWebhookPayload = z.infer<typeof paymentWebhookPayloadSchema>;

/** Result of processing a payment webhook */
export type PaymentWebhookResult = {
  eventId: string;
  eventType: string;
  processed: boolean;
  duplicate: boolean;
  response?: unknown;
};

/** Handler function for payment webhook events */
export type PaymentWebhookHandler = (payload: PaymentWebhookPayload) => Promise<unknown>;

/**
 * Payment webhook processor with idempotency handling.
 * Prevents duplicate billing effects from repeated payment provider webhooks.
 */
export class PaymentWebhookProcessor {
  private readonly idempotencyStore: WebhookEventIdempotencyStore;
  private readonly webhookSecret: string;
  private readonly handlers = new Map<string, PaymentWebhookHandler>();

  constructor(webhookSecret: string, idempotencyStore?: WebhookEventIdempotencyStore) {
    this.webhookSecret = webhookSecret;
    this.idempotencyStore = idempotencyStore ?? new WebhookEventIdempotencyStore();
  }

  /**
   * Register a handler for a specific event type.
   */
  on(eventType: string, handler: PaymentWebhookHandler): void {
    this.handlers.set(eventType, handler);
  }

  /**
   * Process a payment webhook request with idempotency guarantee.
   * Duplicate events are acknowledged (200 OK) but produce no duplicate side effects.
   */
  async processWebhook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<PaymentWebhookResult> {
    const body = request.body as string;
    const signature = request.headers["x-webhook-signature"] as string | undefined;
    const timestamp = request.headers["x-webhook-timestamp"] as string | undefined;
    const eventId = request.headers[WEBHOOK_ID_HEADER] as string | undefined;

    // Verify webhook signature
    if (!signature || !timestamp) {
      reply.code(400);
      throw new Error("Missing webhook signature or timestamp");
    }

    const verification = verifyWebhookSignature({
      secret: this.webhookSecret,
      signature,
      timestamp,
      body
    });

    if (!verification.ok) {
      reply.code(401);
      throw new Error(`Webhook verification failed: ${verification.error}`);
    }

    // Parse payload
    let payload: PaymentWebhookPayload;
    try {
      const jsonBody = JSON.parse(body);
      payload = paymentWebhookPayloadSchema.parse(jsonBody);
    } catch (error) {
      reply.code(400);
      throw new Error("Invalid webhook payload");
    }

    // Use header event ID or fall back to payload id
    const dedupeEventId = eventId ?? payload.id;

    // Check idempotency store
    const existing = this.idempotencyStore.get(dedupeEventId);
    if (existing?.processed) {
      // Duplicate event - return 200 OK but skip processing
      reply.code(200);
      return {
        eventId: dedupeEventId,
        eventType: payload.type,
        processed: false,
        duplicate: true,
        response: existing.response
      };
    }

    // New event or previously failed event - process it
    const handler = this.handlers.get(payload.type);
    if (!handler) {
      // No handler for this event type - acknowledge but don't process
      reply.code(200);
      this.idempotencyStore.markProcessed(dedupeEventId, { acknowledged: true, noHandler: true });
      return {
        eventId: dedupeEventId,
        eventType: payload.type,
        processed: false,
        duplicate: false,
        response: { acknowledged: true, noHandler: true }
      };
    }

    // Record event as received (for deduplication)
    this.idempotencyStore.recordReceived(dedupeEventId);

    try {
      // Process the event
      const result = await handler(payload);

      // Mark as processed
      this.idempotencyStore.markProcessed(dedupeEventId, result);

      reply.code(200);
      return {
        eventId: dedupeEventId,
        eventType: payload.type,
        processed: true,
        duplicate: false,
        response: result
      };
    } catch (error) {
      // Don't mark as processed on error - allow retry
      throw error;
    }
  }

  /**
   * Process webhook with idempotency using the processWithIdempotency helper.
   * This is a lower-level method that can be used directly.
   */
  async processWithIdempotency<T>(
    eventId: string,
    processor: () => Promise<T>,
    timestamp = Date.now()
  ): Promise<{ shouldProcess: boolean; result?: T; record: unknown }> {
    return this.idempotencyStore.processWithIdempotency(eventId, processor, timestamp);
  }

  /**
   * Get the idempotency store (for testing/debugging).
   */
  getIdempotencyStore(): WebhookEventIdempotencyStore {
    return this.idempotencyStore;
  }
}

/**
 * Register payment webhook routes on the Fastify app.
 */
export function registerPaymentWebhookRoutes(
  app: FastifyInstance,
  processor: PaymentWebhookProcessor
): void {
  app.post("/webhooks/payment", async (request, reply) => {
    reply.header("x-request-id", request.id);
    return processor.processWebhook(request, reply);
  });
}
