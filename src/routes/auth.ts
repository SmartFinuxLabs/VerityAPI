import { Router } from "express";
import { ApiError } from "../errors/api-error.js";
import { supabaseAuthService, type AuthService, type RegisterPayload } from "../services/supabase-auth.js";

function badRequest(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "bad_request",
    message,
    reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
  });
}

function requiredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export type { AuthService };

export function createAuthRouter(authService: AuthService = supabaseAuthService) {
  const router = Router();

  router.get("/auth/role-hint", async (req, res, next) => {
    try {
      const email = requiredString(req.query.email);
      if (!email) {
        throw badRequest("email is required.");
      }

      const roleHint = await authService.getRoleHint(email);
      res.status(200).json({ data: roleHint ?? {} });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/sign-in", async (req, res, next) => {
    try {
      const body = readBodyRecord(req.body);
      const email = requiredString(body.email);
      const password = requiredString(body.password);

      if (!email || !password) {
        throw badRequest("email and password are required.");
      }

      const result = await authService.signIn({ email, password });
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/register", async (req, res, next) => {
    try {
      const body = readBodyRecord(req.body);
      const payload: RegisterPayload = {
        email: requiredString(body.email) ?? "",
        password: requiredString(body.password) ?? "",
        fullName: requiredString(body.fullName) ?? "",
        entityName: requiredString(body.entityName) ?? "",
        participantRole: requiredString(body.participantRole) ?? "",
        partyType: requiredString(body.partyType) ?? "",
        invitationToken: requiredString(body.invitationToken)
      };

      if (
        !payload.email ||
        !payload.password ||
        !payload.fullName ||
        !payload.entityName ||
        !payload.participantRole ||
        !payload.partyType
      ) {
        throw badRequest("email, password, fullName, entityName, participantRole, and partyType are required.");
      }

      const result = await authService.register(payload);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const authRouter = createAuthRouter();
