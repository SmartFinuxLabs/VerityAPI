import { Router } from "express";
import { supabasePhase1DomainService, type Phase1DomainService } from "../services/phase1-domain.js";
import { readAuthContext, readBodyRecord } from "./route-utils.js";

export function createRelationshipsRouter(domainService: Phase1DomainService = supabasePhase1DomainService) {
  const router = Router();

  router.post("/relationships", async (req, res, next) => {
    try {
      const data = await domainService.createRelationship(readAuthContext(res.locals.auth), readBodyRecord(req.body));
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/relationships/:relationshipId/invoice-mode", async (req, res, next) => {
    try {
      const data = await domainService.updateRelationshipInvoiceMode(
        readAuthContext(res.locals.auth),
        req.params.relationshipId,
        readBodyRecord(req.body)
      );
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.put("/relationships/:relationshipId/risk-profile", async (req, res, next) => {
    try {
      const data = await domainService.upsertRelationshipRiskProfile(
        readAuthContext(res.locals.auth),
        req.params.relationshipId,
        readBodyRecord(req.body)
      );
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const relationshipsRouter = createRelationshipsRouter();
