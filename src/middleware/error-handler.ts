import type { ErrorRequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";

export function isJsonSyntaxError(err: unknown): boolean {
  return err instanceof SyntaxError && typeof err === "object" && err !== null && "body" in err;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const correlationId =
    typeof res.locals.correlationId === "string" ? res.locals.correlationId : "unknown";

  if (isJsonSyntaxError(err)) {
    res.status(400).json({
      code: "invalid_json",
      message: "Request body must be valid JSON.",
      correlationId,
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      correlationId,
      reasonCode: err.reasonCode,
      ...(err.details === undefined ? {} : { details: err.details })
    });
    return;
  }

  res.status(500).json({
    code: "internal_server_error",
    message: "An unexpected server error occurred.",
    correlationId,
    reasonCode: "ERR_INTERNAL_SERVER_ERROR"
  });
};
