import type { RequestHandler } from "express";
import { ApiError, notImplemented } from "../errors/api-error.js";
import type { AuthContext } from "../services/auth-token.js";

export function contractStub(operation: string): RequestHandler {
  return (_req, _res, next) => {
    next(notImplemented(operation));
  };
}

export function readAuthContext(value: unknown): AuthContext {
  if (!value || typeof value !== "object") {
    throw new ApiError({
      statusCode: 401,
      code: "unauthorized",
      message: "Authenticated API access is required.",
      reasonCode: "ERR_UNAUTHORIZED"
    });
  }

  return value as AuthContext;
}

export function readBodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}
