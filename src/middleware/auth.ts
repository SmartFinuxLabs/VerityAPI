import type { RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";
import { type AuthContext, parseAuthToken } from "../services/auth-token.js";
import { supabaseAuthService } from "../services/supabase-auth.js";

function unauthorized(message: string) {
  return new ApiError({
    statusCode: 401,
    code: "unauthorized",
    message,
    reasonCode: "ERR_UNAUTHORIZED"
  });
}

function forbidden(message: string) {
  return new ApiError({
    statusCode: 403,
    code: "forbidden",
    message,
    reasonCode: "ERR_FORBIDDEN"
  });
}

export interface AccessTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthContext>;
}

export function createRequireAuth(verifier: AccessTokenVerifier = supabaseAuthService): RequestHandler {
  return async (req, res, next) => {
    const authorization = req.header("authorization");
    const [scheme, token] = authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      next(unauthorized("A bearer token is required."));
      return;
    }

    const testAuthContext = parseAuthToken(token);
    if (testAuthContext) {
      res.locals.auth = testAuthContext;
      next();
      return;
    }

    try {
      res.locals.auth = await verifier.verifyAccessToken(token);
      next();
    } catch (err) {
      if (err instanceof ApiError) {
        next(unauthorized("Bearer token is malformed, expired, or unsupported."));
        return;
      }

      next(err);
    }
  };
}

export const requireAuth = createRequireAuth();

export const blockViewerMutations: RequestHandler = (req, res, next) => {
  const authContext = res.locals.auth as AuthContext | undefined;
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);

  if (isMutation && authContext?.organizationRole === "VIEWER") {
    next(forbidden("Viewer role is read-only for Phase 1 API operations."));
    return;
  }

  next();
};

export const requireOperator: RequestHandler = (_req, res, next) => {
  const authContext = res.locals.auth as AuthContext | undefined;

  if (authContext?.participantRole !== "OPERATOR") {
    next(forbidden("Operator role is required for this API operation."));
    return;
  }

  next();
};
