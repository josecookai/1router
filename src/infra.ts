import type { FastifyBaseLogger, FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

type ErrorEnvelope = {
  error: {
    code: "INTERNAL_ERROR" | "VALIDATION_ERROR";
    message: string;
    request_id: string;
    details?: unknown;
  };
};

type FastifyErrorLike = FastifyError & {
  validation?: unknown;
  statusCode?: number;
};

const REDACTION = "[REDACTED]";
const SENSITIVE_HEADER_NAMES = [
  "authorization",
  "x-api-key",
  "api-key",
  "provider-key",
  "provider_api_key"
];

function isSensitiveHeaderName(name: string) {
  const normalized = name.toLowerCase();
  return SENSITIVE_HEADER_NAMES.includes(normalized) || normalized.includes("token") || normalized.includes("secret");
}

export function redactHeaders(headers: Record<string, unknown>) {
  const redacted: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = isSensitiveHeaderName(name) ? REDACTION : value;
  }

  return redacted;
}

function logRequestFailure(
  logger: FastifyBaseLogger,
  request: FastifyRequest,
  error: FastifyError,
  statusCode: number
) {
  const payload = {
    request_id: request.id,
    method: request.method,
    url: request.url,
    statusCode,
    headers: redactHeaders(request.headers as Record<string, unknown>)
  };

  if (statusCode >= 500) {
    logger.error({ ...payload, err: error }, "request failed");
    return;
  }

  logger.warn({ ...payload, err: error }, "request failed");
}

function toErrorEnvelope(request: FastifyRequest, error: FastifyError, statusCode: number): ErrorEnvelope {
  const isValidationError = statusCode === 400 && Array.isArray((error as FastifyErrorLike).validation);

  if (isValidationError) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        request_id: request.id,
        details: (error as FastifyErrorLike).validation
      }
    };
  }

  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      request_id: request.id
    }
  };
}

function toFastifyError(error: unknown): FastifyErrorLike {
  if (error instanceof Error) {
    return error as FastifyErrorLike;
  }

  const fallback = new Error("Unknown error") as FastifyErrorLike;
  fallback.cause = error;
  return fallback;
}

export function registerInfraBaseline(app: FastifyInstance) {
  app.addHook("onSend", async (request, reply, payload) => {
    if (!reply.hasHeader("x-request-id")) {
      reply.header("x-request-id", request.id);
    }

    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    const fastifyError = toFastifyError(error);
    const rawStatusCode = typeof fastifyError.statusCode === "number" ? fastifyError.statusCode : 500;
    const statusCode = rawStatusCode >= 400 ? rawStatusCode : 500;

    logRequestFailure(app.log, request, fastifyError, statusCode);

    if (!reply.sent) {
      reply.header("x-request-id", request.id);
      reply.code(statusCode).send(toErrorEnvelope(request, fastifyError, statusCode));
    }
  });
}

export const loggerRedactPaths = [
  "req.headers.authorization",
  "req.headers.x-api-key",
  "req.headers.api-key",
  "req.headers.provider-key",
  "req.headers.provider_api_key",
  "headers.authorization",
  "headers.x-api-key",
  "headers.api-key",
  "headers.provider-key",
  "headers.provider_api_key"
];
