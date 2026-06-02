import { Router } from "express";
import { supabasePhase1DomainService, type Phase1DomainService } from "../services/phase1-domain.js";
import { readAuthContext, readBodyRecord } from "./route-utils.js";

export function createFundingRouter(domainService: Phase1DomainService = supabasePhase1DomainService) {
  const router = Router();

  router.post("/financeability/:financeabilityId/offers", async (req, res, next) => {
    try {
      const data = await domainService.createFundingOffer(readAuthContext(res.locals.auth), {
        ...readBodyRecord(req.body),
        financeabilityId: req.params.financeabilityId
      });
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/offers/:offerId/commitments", async (req, res, next) => {
    try {
      const data = await domainService.createFundingCommitment(
        readAuthContext(res.locals.auth),
        req.params.offerId,
        readBodyRecord(req.body)
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const fundingRouter = createFundingRouter();
