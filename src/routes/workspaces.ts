import { Router } from "express";
import { ApiError } from "../errors/api-error.js";
import type { AuthContext } from "../services/auth-token.js";
import { supabaseWorkspaceService, type WorkspaceService } from "../services/workspace-state.js";

function requireAuthContext(value: unknown): AuthContext {
  if (!value || typeof value !== "object") {
    throw new ApiError({
      statusCode: 401,
      code: "unauthorized",
      message: "Authenticated workspace access is required.",
      reasonCode: "ERR_UNAUTHORIZED"
    });
  }

  return value as AuthContext;
}

export type { WorkspaceService };

export function createWorkspacesRouter(workspaceService: WorkspaceService = supabaseWorkspaceService) {
  const router = Router();

  router.get("/workspaces/buyer", async (_req, res, next) => {
    try {
      const data = await workspaceService.getBuyerWorkspaceState(requireAuthContext(res.locals.auth));
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get("/workspaces/supplier", async (_req, res, next) => {
    try {
      const data = await workspaceService.getSupplierWorkspaceState(requireAuthContext(res.locals.auth));
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get("/workspaces/investor", async (_req, res, next) => {
    try {
      const data = await workspaceService.getInvestorWorkspaceState(requireAuthContext(res.locals.auth));
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const workspacesRouter = createWorkspacesRouter();
