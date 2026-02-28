import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { InMemoryApiKeyStore, buildApiKeysListResponse, buildCreateApiKeyResponse } from "./api-keys.js";
import { ApiKeyStoreRouterAuthRepository, authenticateRouterKey } from "./auth.js";
import { buildChatCompletionsStreamChunks, buildChatCompletionsStubResponse } from "./chat-completions.js";
import { buildEmbeddingsStubResponse } from "./embeddings.js";
import { loggerRedactPaths, registerInfraBaseline } from "./infra.js";
import { InMemoryIdempotencyStore, buildPayloadFingerprint } from "./idempotency.js";
import { buildModelsListResponse } from "./models-catalog.js";
import {
  InMemoryOrgProjectStore,
  createOrgSchema,
  createProjectSchema,
  type OrgProjectRepository,
  updateOrgSchema,
  updateProjectSchema
} from "./org-projects.js";
import { InMemoryPolicyStore, type PolicyRepository, createPolicySchema } from "./policies.js";
import {
  buildResponsesStubResponse,
  buildRoutingExplainResponse,
  type ResponsesResponse
} from "./responses.js";
import { canRoleAccess, parseRole, requiredActionForRoute } from "./rbac.js";
import {
  InMemorySliMetricsStore,
  sliDashboardQuerySchema,
  sliDashboardResponseSchema
} from "./slo-metrics.js";
import {
  paymentWebhookAckSchema,
  paymentWebhookBodySchema,
  paymentWebhookHeadersSchema,
  type PaymentWebhookAck
} from "./payment-webhook.js";
import { FixtureUsageRepository, buildMonthlyInvoiceResponse, buildUsageReportResponse } from "./usage-report.js";

const healthzResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("1router-api"),
  time: z.string().datetime()
});

const controlPlaneModelsQuerySchema = z
  .object({
    provider: z.enum(["openai", "anthropic", "google"]).optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
  .strict();

function embeddingsErrorEnvelope(
  requestId: string,
  code: "INVALID_REQUEST" | "UNSUPPORTED_MODEL",
  message: string,
  details?: unknown
) {
  return {
    error: {
      code,
      message,
      request_id: requestId,
      ...(details === undefined ? {} : { details })
    }
  };
}

function requestErrorEnvelope(requestId: string, code: string, message: string, details?: unknown) {
  return {
    error: {
      code,
      message,
      request_id: requestId,
      ...(details === undefined ? {} : { details })
    }
  };
}

type BuildAppOptions = {
  logger?: boolean;
  apiKeyStore?: InMemoryApiKeyStore;
  policyStore?: PolicyRepository;
  orgProjectStore?: OrgProjectRepository;
  usageRepo?: FixtureUsageRepository;
  responsesIdempotencyStore?: InMemoryIdempotencyStore<ResponsesResponse>;
  paymentWebhookIdempotencyStore?: InMemoryIdempotencyStore<PaymentWebhookAck>;
  sliMetricsStore?: InMemorySliMetricsStore;
  registerRoutes?: (app: FastifyInstance) => void;
};

export function buildApp(options: BuildAppOptions = {}) {
  const fastifyOptions: FastifyServerOptions = options.logger
    ? {
        logger: {
          level: "info",
          redact: {
            paths: loggerRedactPaths,
            censor: "[REDACTED]"
          }
        }
      }
    : { logger: false };

  const app = Fastify(fastifyOptions);
  const apiKeyStore = options.apiKeyStore ?? new InMemoryApiKeyStore();
  const authRepo = new ApiKeyStoreRouterAuthRepository(apiKeyStore);
  const policyStore = options.policyStore ?? new InMemoryPolicyStore();
  const orgProjectStore = options.orgProjectStore ?? new InMemoryOrgProjectStore();
  const usageRepo = options.usageRepo ?? new FixtureUsageRepository();
  const responsesIdempotencyStore = options.responsesIdempotencyStore ?? new InMemoryIdempotencyStore<ResponsesResponse>();
  const paymentWebhookIdempotencyStore =
    options.paymentWebhookIdempotencyStore ?? new InMemoryIdempotencyStore<PaymentWebhookAck>();
  const sliMetricsStore = options.sliMetricsStore ?? new InMemorySliMetricsStore();
  const publicDir = path.resolve(process.cwd(), "public");
  (app as FastifyInstance & { sliMetricsStore?: InMemorySliMetricsStore }).sliMetricsStore = sliMetricsStore;

  app.get("/", async (_request, reply) => {
    const html = await readFile(path.join(publicDir, "landing.html"), "utf8");
    reply.type("text/html; charset=utf-8");
    return html;
  });

  app.get("/landing.css", async (_request, reply) => {
    const css = await readFile(path.join(publicDir, "landing.css"), "utf8");
    reply.type("text/css; charset=utf-8");
    return css;
  });

  registerInfraBaseline(app);

  app.get("/healthz", async () => {
    return healthzResponseSchema.parse({
      status: "ok",
      service: "1router-api",
      time: new Date().toISOString()
    });
  });

  app.get("/v1/models", async () => {
    return buildModelsListResponse();
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/v1/")) return;

    const context = authenticateRouterKey(request.headers.authorization, authRepo);
    if (!context) {
      reply.header("x-request-id", request.id);
      reply.code(401);
      return reply.send(requestErrorEnvelope(request.id, "UNAUTHORIZED", "Missing or invalid bearer token"));
    }

    (request as { router_auth?: typeof context }).router_auth = context;
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;

    const action = requiredActionForRoute(request.method, request.routeOptions.url ?? "");
    if (!action) return;

    const role = parseRole(request.headers["x-org-role"]);
    if (canRoleAccess(role, action)) return;

    reply.header("x-request-id", request.id);
    reply.code(403);
    return reply.send(
      requestErrorEnvelope(request.id, "FORBIDDEN", "RBAC policy denied request", {
        role,
        scope: action
      })
    );
  });

  app.post("/v1/embeddings", async (request, reply) => {
    try {
      return await buildEmbeddingsStubResponse(request.body);
    } catch (error) {
      reply.header("x-request-id", request.id);

      if (error instanceof z.ZodError) {
        reply.code(400);
        return embeddingsErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid embeddings request", error.issues);
      }

      reply.code(400);
      return embeddingsErrorEnvelope(
        request.id,
        "UNSUPPORTED_MODEL",
        error instanceof Error ? error.message : "Unsupported embeddings model"
      );
    }
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const stream =
        typeof request.body === "object" &&
        request.body !== null &&
        "stream" in request.body &&
        (request.body as Record<string, unknown>).stream === true;

      if (stream) {
        const abortController = new AbortController();
        const result = await buildChatCompletionsStreamChunks(request.body, request.id, {
          signal: abortController.signal
        });

        reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
        reply.raw.setHeader("cache-control", "no-cache");
        reply.raw.setHeader("connection", "keep-alive");
        const onClose = () => abortController.abort();
        request.raw.on("close", onClose);
        for (const chunk of result.chunks) {
          if (abortController.signal.aborted) break;
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        if (!abortController.signal.aborted && result.done) {
          reply.raw.write("data: [DONE]\n\n");
        }
        request.raw.off("close", onClose);
        reply.raw.end();
        return reply;
      }

      return await buildChatCompletionsStubResponse(request.body, request.id);
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid chat completions request", error.issues);
      }

      reply.code(400);
      return requestErrorEnvelope(
        request.id,
        "UNSUPPORTED_MODEL",
        error instanceof Error ? error.message : "Unsupported chat model"
      );
    }
  });

  app.post("/v1/responses", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const idempotencyKeyHeader = request.headers["idempotency-key"];
      const idempotencyKey = typeof idempotencyKeyHeader === "string" ? idempotencyKeyHeader.trim() : "";
      const fingerprint = idempotencyKey ? buildPayloadFingerprint(request.body) : null;

      if (idempotencyKey && fingerprint) {
        const existing = responsesIdempotencyStore.get(idempotencyKey);
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            reply.code(409);
            return requestErrorEnvelope(
              request.id,
              "IDEMPOTENCY_KEY_CONFLICT",
              "Idempotency-Key already used with different payload"
            );
          }

          reply.header("x-idempotent-replay", "true");
          return existing.response;
        }
      }

      const response = await buildResponsesStubResponse(request.body, request.id);
      if (idempotencyKey && fingerprint) {
        responsesIdempotencyStore.set({
          key: idempotencyKey,
          fingerprint,
          response
        });
      }

      return response;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid responses request", error.issues);
      }

      reply.code(400);
      return requestErrorEnvelope(
        request.id,
        "UNSUPPORTED_MODEL",
        error instanceof Error ? error.message : "Unsupported responses model"
      );
    }
  });

  app.post("/v1/routing/decision/explain", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      return buildRoutingExplainResponse(request.body, request.id);
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid routing explain request", error.issues);
      }

      reply.code(400);
      return requestErrorEnvelope(
        request.id,
        "UNSUPPORTED_MODEL",
        error instanceof Error ? error.message : "Unsupported routing explain model"
      );
    }
  });

  app.get("/api/keys", async (request, reply) => {
    reply.header("x-request-id", request.id);
    return buildApiKeysListResponse(apiKeyStore, request.id);
  });

  app.post("/api/keys", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      reply.code(201);
      return buildCreateApiKeyResponse(apiKeyStore, request.body, request.id);
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid API key create request", error.issues);
      }

      throw error;
    }
  });
  app.get("/api/models", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const query = controlPlaneModelsQuerySchema.parse(request.query ?? {});
      const controlPlaneModels = buildModelsListResponse().data
        .map((model) => ({
          id: model.id,
          provider: model.x_router.provider,
          status: "active" as const,
          capabilities: [
            ...(model.x_router.capabilities.tools ? ["tools"] : []),
            ...(model.x_router.capabilities.vision ? ["vision"] : []),
            ...(model.x_router.capabilities.json_schema ? ["json_schema"] : [])
          ]
        }))
        .filter((model) => (query.provider ? model.provider === query.provider : true))
        .filter((model) => (query.status ? model.status === query.status : true));

      return {
        data: controlPlaneModels,
        meta: { request_id: request.id }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid models list query", error.issues);
      }
      throw error;
    }
  });

  app.get("/api/orgs", async (request, reply) => {
    reply.header("x-request-id", request.id);
    return {
      data: orgProjectStore.listOrgs(),
      meta: { request_id: request.id }
    };
  });

  app.post("/api/orgs", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const payload = createOrgSchema.parse(request.body);
      const created = orgProjectStore.createOrg(payload);
      reply.code(201);
      return {
        data: created,
        meta: { request_id: request.id }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid org payload", error.issues);
      }

      throw error;
    }
  });

  app.patch("/api/orgs/:orgId", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const { orgId } = z.object({ orgId: z.string().min(1) }).parse(request.params);
      const payload = updateOrgSchema.parse(request.body);
      const updated = orgProjectStore.updateOrg(orgId, payload);

      if (!updated) {
        reply.code(404);
        return requestErrorEnvelope(request.id, "NOT_FOUND", `Org not found: ${orgId}`);
      }

      return {
        data: updated,
        meta: { request_id: request.id }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid org payload", error.issues);
      }

      throw error;
    }
  });

  app.get("/api/projects", async (request, reply) => {
    reply.header("x-request-id", request.id);
    return {
      data: orgProjectStore.listProjects(),
      meta: { request_id: request.id }
    };
  });

  app.post("/api/projects", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const payload = createProjectSchema.parse(request.body);
      const created = orgProjectStore.createProject(payload);
      reply.code(201);
      return {
        data: created,
        meta: { request_id: request.id }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid project payload", error.issues);
      }

      throw error;
    }
  });

  app.patch("/api/projects/:projectId", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const payload = updateProjectSchema.parse(request.body);
      const updated = orgProjectStore.updateProject(projectId, payload);

      if (!updated) {
        reply.code(404);
        return requestErrorEnvelope(request.id, "NOT_FOUND", `Project not found: ${projectId}`);
      }

      return {
        data: updated,
        meta: { request_id: request.id }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid project payload", error.issues);
      }

      throw error;
    }
  });

  app.get("/api/policies", async (request, reply) => {
    reply.header("x-request-id", request.id);
    return {
      data: policyStore.list(),
      meta: { request_id: request.id }
    };
  });

  app.post("/api/policies", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const payload = createPolicySchema.parse(request.body);
      const created = policyStore.create(payload);
      reply.code(201);
      return {
        data: created,
        meta: { request_id: request.id }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid policy payload", error.issues);
      }

      throw error;
    }
  });

  app.get("/api/orgs/:orgId/usage", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const { orgId } = request.params as { orgId: string };
      const query = request.query as Record<string, unknown>;
      return buildUsageReportResponse(usageRepo, { orgId, query, requestId: request.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid usage report request", error.issues);
      }

      throw error;
    }
  });

  app.get("/api/orgs/:orgId/invoice", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const { orgId } = z.object({ orgId: z.string().min(1) }).parse(request.params);
      return buildMonthlyInvoiceResponse(usageRepo, { orgId, query: request.query, requestId: request.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid invoice request", error.issues);
      }

      throw error;
    }
  });

  app.post("/api/webhooks/payments", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const headers = paymentWebhookHeadersSchema.parse(request.headers);
      const payload = paymentWebhookBodySchema.parse(request.body);
      const eventId = headers["x-provider-event-id"];
      const fingerprint = buildPayloadFingerprint(payload);
      const existing = paymentWebhookIdempotencyStore.get(eventId);

      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          reply.code(409);
          return requestErrorEnvelope(
            request.id,
            "IDEMPOTENCY_KEY_CONFLICT",
            "Provider event id already used with different payload"
          );
        }

        reply.header("x-idempotent-replay", "true");
        return existing.response;
      }

      const response = paymentWebhookAckSchema.parse({
        data: {
          event_id: eventId,
          accepted: true,
          replayed: false,
          processed_at: new Date().toISOString()
        },
        meta: { request_id: request.id }
      });

      paymentWebhookIdempotencyStore.set({
        key: eventId,
        fingerprint,
        response
      });

      return response;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid payment webhook request", error.issues);
      }

      throw error;
    }
  });

  app.get("/api/infra/slo", async (request, reply) => {
    reply.header("x-request-id", request.id);

    try {
      const query = sliDashboardQuerySchema.parse(request.query);
      const aggregate = sliMetricsStore.aggregateWindow({
        windowMinutes: query.window_minutes,
        filters: {
          service: query.service,
          env: query.env,
          route_group: query.route_group,
          method: query.method
        }
      });

      return sliDashboardResponseSchema.parse({
        data: aggregate,
        meta: { request_id: request.id }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid SLO dashboard query", error.issues);
      }

      if (error instanceof Error && error.message.startsWith("unsupported")) {
        reply.code(400);
        return requestErrorEnvelope(request.id, "INVALID_REQUEST", "Invalid SLO dashboard query", [
          {
            code: "custom",
            message: error.message,
            path: []
          }
        ]);
      }

      throw error;
    }
  });
  const registerRoutesResult = options.registerRoutes?.(app);
  if (registerRoutesResult && typeof (registerRoutesResult as { then?: unknown }).then === "function") {
    throw new Error("buildApp registerRoutes callback must be synchronous");
  }

  return app;
}
