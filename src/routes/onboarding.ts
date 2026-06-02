import { Router } from "express";
import { supabasePhase1DomainService, type Phase1DomainService } from "../services/phase1-domain.js";
import { readAuthContext, readBodyRecord } from "./route-utils.js";

export function createOnboardingRouter(domainService: Phase1DomainService = supabasePhase1DomainService) {
  const router = Router();

  router.post("/organizations/provision", async (req, res, next) => {
    try {
      const data = await domainService.provisionOrganization(readAuthContext(res.locals.auth), readBodyRecord(req.body));
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get("/organizations/:organizationId/memberships", async (req, res, next) => {
    try {
      const data = await domainService.listMemberships(readAuthContext(res.locals.auth), req.params.organizationId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/memberships/:membershipId/role", async (req, res, next) => {
    try {
      const data = await domainService.updateMembershipRole(
        readAuthContext(res.locals.auth),
        req.params.membershipId,
        readBodyRecord(req.body)
      );
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/organization-invitations", async (req, res, next) => {
    try {
      const data = await domainService.createOrganizationInvitation(
        readAuthContext(res.locals.auth),
        readBodyRecord(req.body)
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/organization-invitations/:invitationToken/accept", async (req, res, next) => {
    try {
      const data = await domainService.acceptOrganizationInvitation(
        readAuthContext(res.locals.auth),
        req.params.invitationToken,
        readBodyRecord(req.body)
      );
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/organization-invitations/:invitationId/revoke", async (req, res, next) => {
    try {
      const data = await domainService.revokeOrganizationInvitation(readAuthContext(res.locals.auth), req.params.invitationId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const onboardingRouter = createOnboardingRouter();
