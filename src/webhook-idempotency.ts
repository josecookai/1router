import type { FastifyBaseLogger } from "fastify";

export type WebhookEventRecord = {
  /** Unique event ID from the payment provider */
  eventId: string;
  /** When the event was first received */
  receivedAt: number;
  /** Whether the event was successfully processed */
  processed: boolean;
  /** Response data from processing (for idempotent replay) */
  response?: unknown;
};

export type WebhookIdempotencyConfig = {
  /** TTL for event records in milliseconds (default: 24 hours) */
  ttlMs: number;
  /** Maximum number of events to keep in memory */
  maxEvents: number;
};

export const DEFAULT_WEBHOOK_IDEMPOTENCY_CONFIG: WebhookIdempotencyConfig = {
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  maxEvents: 10000
};

/**
 * In-memory store for webhook event deduplication.
 * Prevents duplicate processing of payment provider webhooks.
 */
export class WebhookEventIdempotencyStore {
  private readonly records = new Map<string, WebhookEventRecord>();
  private readonly config: WebhookIdempotencyConfig;
  private readonly logger: FastifyBaseLogger | undefined;

  constructor(config: Partial<WebhookIdempotencyConfig> = {}, logger?: FastifyBaseLogger) {
    this.config = { ...DEFAULT_WEBHOOK_IDEMPOTENCY_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Check if an event has been seen before.
   * Returns the existing record if found, null otherwise.
   */
  get(eventId: string, now = Date.now()): WebhookEventRecord | null {
    const record = this.records.get(eventId);
    if (!record) return null;

    // Check if record has expired
    if (now - record.receivedAt >= this.config.ttlMs) {
      this.records.delete(eventId);
      return null;
    }

    return record;
  }

  /**
   * Mark an event as received.
   * If the event already exists and hasn't expired, returns the existing record.
   */
  recordReceived(eventId: string, timestamp = Date.now()): WebhookEventRecord {
    const existing = this.get(eventId, timestamp);
    if (existing) {
      this.logger?.debug({ eventId }, "duplicate webhook event detected");
      return existing;
    }

    const record: WebhookEventRecord = {
      eventId,
      receivedAt: timestamp,
      processed: false
    };

    this.cleanupIfNeeded();
    this.records.set(eventId, record);
    this.logger?.debug({ eventId }, "webhook event recorded");

    return record;
  }

  /**
   * Mark an event as successfully processed.
   * Stores the response for idempotent replay.
   */
  markProcessed(eventId: string, response?: unknown): void {
    const record = this.records.get(eventId);
    if (record) {
      record.processed = true;
      record.response = response;
      this.logger?.debug({ eventId }, "webhook event marked as processed");
    }
  }

  /**
   * Check if an event has been processed.
   */
  isProcessed(eventId: string, now = Date.now()): boolean {
    const record = this.get(eventId, now);
    return record?.processed ?? false;
  }

  /**
   * Process a webhook event with idempotency guarantee.
   * Returns { shouldProcess: false, record } if event is already processed (duplicate).
   * Returns { shouldProcess: true, record } if event should be processed (new or failed retry).
   */
  async processWithIdempotency<T>(
    eventId: string,
    processor: () => Promise<T>,
    timestamp = Date.now()
  ): Promise<{ shouldProcess: boolean; record: WebhookEventRecord; result?: T }> {
    const existing = this.get(eventId, timestamp);

    if (existing?.processed) {
      // Already processed - duplicate event, return cached result
      this.logger?.info({ eventId }, "idempotent webhook replay detected, skipping processing");
      return { shouldProcess: false, record: existing };
    }

    // New event or failed event (retry) - record it and process
    const record = existing ?? this.recordReceived(eventId, timestamp);

    try {
      const result = await processor();
      this.markProcessed(eventId, result);
      return { shouldProcess: true, record, result };
    } catch (error) {
      // Don't mark as processed on error - allow retry
      this.logger?.warn({ eventId, error }, "webhook processing failed, allowing retry");
      throw error;
    }
  }

  /**
   * Get all event records (for testing/debugging).
   */
  getAllRecords(now = Date.now()): WebhookEventRecord[] {
    // Clean up expired records first
    for (const [eventId, record] of this.records) {
      if (now - record.receivedAt >= this.config.ttlMs) {
        this.records.delete(eventId);
      }
    }
    return Array.from(this.records.values());
  }

  /**
   * Get the number of stored events.
   */
  size(): number {
    return this.records.size;
  }

  /**
   * Clear all records (useful for testing).
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Clean up old records if we've exceeded the max size.
   * Removes oldest records first.
   */
  private cleanupIfNeeded(): void {
    if (this.records.size < this.config.maxEvents) return;

    // Sort by receivedAt and remove oldest 10%
    const entries = Array.from(this.records.entries()).sort((a, b) => a[1].receivedAt - b[1].receivedAt);
    const toRemove = Math.ceil(this.config.maxEvents * 0.1);

    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.records.delete(entries[i][0]);
    }

    this.logger?.warn({ removed: toRemove }, "webhook idempotency store cleanup performed");
  }

  /**
   * Manually trigger cleanup of expired records.
   */
  cleanupExpired(now = Date.now()): number {
    let removed = 0;

    for (const [eventId, record] of this.records) {
      if (now - record.receivedAt >= this.config.ttlMs) {
        this.records.delete(eventId);
        removed++;
      }
    }

    return removed;
  }
}
