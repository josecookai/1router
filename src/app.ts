import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { z } from "zod";
import { buildModelsListResponse } from "./models-catalog.js";
import { loggerRedactPaths, registerInfraBaseline } from "./infra.js";

const healthzResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("1router-api"),
  time: z.string().datetime()
});

type BuildAppOptions = {
  logger?: boolean;
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

  const registerRoutesResult = options.registerRoutes?.(app);
  if (registerRoutesResult && typeof (registerRoutesResult as { then?: unknown }).then === "function") {
    throw new Error("buildApp registerRoutes callback must be synchronous");
  }

  return app;
}
