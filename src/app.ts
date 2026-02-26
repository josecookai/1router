import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { InMemoryApiKeyStore, buildApiKeysListResponse, buildCreateApiKeyResponse } from "./api-keys.js";
import { buildChatCompletionsStubResponse } from "./chat-completions.js";
import { buildEmbeddingsStubResponse } from "./embeddings.js";
import { buildModelsListResponse } from "./models-catalog.js";
import { InMemoryPolicyStore, createPolicySchema } from "./policies.js";
import { FixtureUsageRepository, buildUsageReportResponse } from "./usage-report.js";

const healthzResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("1router-api"),
  time: z.string().datetime()
});

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
  apiKeyStore?: InMemoryApiKeyStore;
  policyStore?: InMemoryPolicyStore;
  usageRepo?: FixtureUsageRepository;
};

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: false });
  const apiKeyStore = options.apiKeyStore ?? new InMemoryApiKeyStore();
  const policyStore = options.policyStore ?? new InMemoryPolicyStore();
  const publicDir = path.resolve(process.cwd(), "public");

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
  const usageRepo = options.usageRepo ?? new FixtureUsageRepository();

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

    const controlPlaneModels = buildModelsListResponse().data.map((model) => ({
      id: model.id,
      provider: model.x_router.provider,
      capabilities: [
        ...(model.x_router.capabilities.tools ? ["tools"] : []),
        ...(model.x_router.capabilities.vision ? ["vision"] : []),
        ...(model.x_router.capabilities.json_schema ? ["json_schema"] : [])
      ]
    }));

    return {
      data: controlPlaneModels,
      meta: { request_id: request.id }
    };
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

  return app;
}
