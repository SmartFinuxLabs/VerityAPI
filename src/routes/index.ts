import { Router } from "express";
import { blockViewerMutations, requireAuth } from "../middleware/auth.js";
import { auditRouter } from "./audit.js";
import { authRouter } from "./auth.js";
import { fundingRouter } from "./funding.js";
import { healthRouter } from "./health.js";
import { invoicesRouter } from "./invoices.js";
import { onboardingRouter } from "./onboarding.js";
import { createOpenApiRouter } from "./openapi.js";
import { relationshipsRouter } from "./relationships.js";
import { settlementRouter } from "./settlement.js";
import { workspacesRouter } from "./workspaces.js";

export type ApiRouterOptions = {
  nodeEnv: string;
};

export function createApiRouter(options: ApiRouterOptions) {
  const router = Router();

  router.use(healthRouter);
  router.use(authRouter);
  router.use(createOpenApiRouter({ protected: options.nodeEnv === "production" }));
  router.use(requireAuth);
  router.use(blockViewerMutations);
  router.use(workspacesRouter);
  router.use(onboardingRouter);
  router.use(relationshipsRouter);
  router.use(invoicesRouter);
  router.use(fundingRouter);
  router.use(settlementRouter);
  router.use(auditRouter);

  return router;
}

export const apiRouter = createApiRouter({ nodeEnv: "development" });
