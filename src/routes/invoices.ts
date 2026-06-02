import { Router } from "express";
import { supabasePhase1DomainService, type Phase1DomainService } from "../services/phase1-domain.js";
import { readAuthContext, readBodyRecord } from "./route-utils.js";

export function createInvoicesRouter(domainService: Phase1DomainService = supabasePhase1DomainService) {
  const router = Router();

  router.post("/invoices", async (req, res, next) => {
    try {
      const data = await domainService.createInvoice(readAuthContext(res.locals.auth), readBodyRecord(req.body));
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/invoices/:invoiceId/resolution", async (req, res, next) => {
    try {
      const data = await domainService.createInvoiceResolution(
        readAuthContext(res.locals.auth),
        req.params.invoiceId,
        readBodyRecord(req.body)
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/invoices/:invoiceId/hash", async (req, res, next) => {
    try {
      const data = await domainService.registerInvoiceHash(
        readAuthContext(res.locals.auth),
        req.params.invoiceId,
        readBodyRecord(req.body)
      );
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/invoices/:invoiceId/financeability", async (req, res, next) => {
    try {
      const data = await domainService.evaluateInvoiceFinanceability(
        readAuthContext(res.locals.auth),
        req.params.invoiceId,
        readBodyRecord(req.body)
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const invoicesRouter = createInvoicesRouter();
