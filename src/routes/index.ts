import { Router } from "express";
import { blockViewerMutations, requireAuth } from "../middleware/auth.js";
import { auditRouter } from "./audit.js";
import { authRouter } from "./auth.js";
import { fundingRouter } from "./funding.js";
import { healthRouter } from "./health.js";
import { invoicesRouter } from "./invoices.js";
import { onboardingRouter } from "./onboarding.js";
import { relationshipsRouter } from "./relationships.js";
import { settlementRouter } from "./settlement.js";
import { workspacesRouter } from "./workspaces.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(requireAuth);
apiRouter.use(blockViewerMutations);
apiRouter.use(workspacesRouter);
apiRouter.use(onboardingRouter);
apiRouter.use(relationshipsRouter);
apiRouter.use(invoicesRouter);
apiRouter.use(fundingRouter);
apiRouter.use(settlementRouter);
apiRouter.use(auditRouter);
