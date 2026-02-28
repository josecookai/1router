import { z } from "zod";

export const paymentWebhookHeadersSchema = z.object({
  "x-provider-event-id": z.string().trim().min(1)
});

export const paymentWebhookBodySchema = z
  .object({
    provider: z.string().trim().min(1),
    event_type: z.enum(["payment.succeeded", "payment.failed", "invoice.generated"]),
    org_id: z.string().trim().min(1),
    invoice_id: z.string().trim().min(1).optional(),
    payment_id: z.string().trim().min(1).optional(),
    amount_cents: z.number().int().nonnegative().optional(),
    currency: z.string().trim().min(3).max(3).optional(),
    occurred_at: z.string().datetime()
  })
  .strict();

export const paymentWebhookAckSchema = z.object({
  data: z.object({
    event_id: z.string(),
    accepted: z.boolean(),
    replayed: z.boolean(),
    processed_at: z.string().datetime()
  }),
  meta: z.object({
    request_id: z.string()
  })
});

export type PaymentWebhookAck = z.infer<typeof paymentWebhookAckSchema>;
