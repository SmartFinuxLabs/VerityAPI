import { Router } from "express";
import { requireOperator } from "../middleware/auth.js";
import { supabasePhase1DomainService, type Phase1DomainService } from "../services/phase1-domain.js";
import { readAuthContext } from "./route-utils.js";

export function createAuditRouter(domainService: Phase1DomainService = supabasePhase1DomainService) {
  const router = Router();

  router.get("/audit/events", requireOperator, async (_req, res, next) => {
    try {
      const data = await domainService.queryAuditEvents(readAuthContext(res.locals.auth));
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const auditRouter = createAuditRouter();
