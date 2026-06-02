import { Router } from "express";
import { supabasePhase1DomainService, type Phase1DomainService } from "../services/phase1-domain.js";
import { readAuthContext, readBodyRecord } from "./route-utils.js";

export function createSettlementRouter(domainService: Phase1DomainService = supabasePhase1DomainService) {
  const router = Router();

  router.post("/commitments/:commitmentId/settlement-instructions", async (req, res, next) => {
    try {
      const data = await domainService.createSettlementInstruction(readAuthContext(res.locals.auth), {
        ...readBodyRecord(req.body),
        fundingCommitmentId: req.params.commitmentId
      });
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get("/settlement/:instructionId/status", async (req, res, next) => {
    try {
      const data = await domainService.getSettlementStatus(readAuthContext(res.locals.auth), req.params.instructionId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const settlementRouter = createSettlementRouter();
