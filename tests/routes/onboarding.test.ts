import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { blockViewerMutations } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createOnboardingRouter } from "../../src/routes/onboarding.js";
import type { Phase1DomainService } from "../../src/services/phase1-domain.js";

function createDomainService(overrides: Partial<Phase1DomainService> = {}): Phase1DomainService {
  return {
    provisionOrganization: jest.fn(),
    listMemberships: jest.fn(),
    updateMembershipRole: jest.fn(),
    createOrganizationInvitation: jest.fn(),
    acceptOrganizationInvitation: jest.fn(),
    revokeOrganizationInvitation: jest.fn(),
    queryAuditEvents: jest.fn(),
    createRelationship: jest.fn(),
    updateRelationshipInvoiceMode: jest.fn(),
    upsertRelationshipRiskProfile: jest.fn(),
    createInvoice: jest.fn(),
    createInvoiceResolution: jest.fn(),
    registerInvoiceHash: jest.fn(),
    evaluateInvoiceFinanceability: jest.fn(),
    createFundingOffer: jest.fn(),
    createFundingCommitment: jest.fn(),
    createSettlementInstruction: jest.fn(),
    getSettlementStatus: jest.fn(),
    reconcileSettlementInstruction: jest.fn(),
    ...overrides
  };
}

function createOnboardingTestApp(
  service: Phase1DomainService,
  auth: Record<string, unknown> = {
    userId: "user-1",
    participantRole: "BUYER",
    organizationRole: "SUPER_USER"
  }
) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.auth = auth;
    next();
  });
  app.use(blockViewerMutations);
  app.use("/api/v1", createOnboardingRouter(service));
  app.use(errorHandler);
  return app;
}

describe("onboarding routes", () => {
  it("provisions an organization through the configured domain service", async () => {
    const service = createDomainService({
      provisionOrganization: jest.fn(async () => ({
        organizationId: "org-1"
      }))
    });

    const payload = {
      legalName: "Buyer Inc",
      partyType: "BUYER",
      email: "buyer@test.local",
      fullName: "Buyer User",
      registrationNo: "REG-1"
    };

    const response = await request(createOnboardingTestApp(service))
      .post("/api/v1/organizations/provision")
      .send(payload)
      .expect(201);

    expect(service.provisionOrganization).toHaveBeenCalledWith({
      userId: "user-1",
      participantRole: "BUYER",
      organizationRole: "SUPER_USER"
    }, payload);
    expect(response.body).toEqual({ data: { organizationId: "org-1" } });
  });

  it("lists organization memberships through the configured domain service", async () => {
    const service = createDomainService({
      listMemberships: jest.fn(async () => [{ id: "membership-1", organizationRole: "VIEWER" }])
    });

    const response = await request(createOnboardingTestApp(service))
      .get("/api/v1/organizations/org-1/memberships")
      .expect(200);

    expect(service.listMemberships).toHaveBeenCalledWith(expect.any(Object), "org-1");
    expect(response.body).toEqual({ data: [{ id: "membership-1", organizationRole: "VIEWER" }] });
  });

  it("updates membership roles through the configured domain service", async () => {
    const service = createDomainService({
      updateMembershipRole: jest.fn(async () => ({ id: "membership-1", org_role: "VIEWER" }))
    });

    const response = await request(createOnboardingTestApp(service))
      .patch("/api/v1/memberships/membership-1/role")
      .send({ organizationRole: "VIEWER" })
      .expect(200);

    expect(service.updateMembershipRole).toHaveBeenCalledWith(expect.any(Object), "membership-1", {
      organizationRole: "VIEWER"
    });
    expect(response.body).toEqual({ data: { id: "membership-1", org_role: "VIEWER" } });
  });

  it("creates, accepts, and revokes organization invitations through the configured domain service", async () => {
    const service = createDomainService({
      createOrganizationInvitation: jest.fn(async () => ({ invitationId: "invitation-1" })),
      acceptOrganizationInvitation: jest.fn(async () => ({ organizationId: "supplier-org-1" })),
      revokeOrganizationInvitation: jest.fn(async () => ({ id: "invitation-1", status: "REVOKED" }))
    });
    const app = createOnboardingTestApp(service);

    await request(app)
      .post("/api/v1/organization-invitations")
      .send({
        sourceOrganizationId: "buyer-org-1",
        inviteeEmail: "supplier@test.local",
        invitationType: "SUPPLIER_ORG",
        targetPartyType: "SUPPLIER",
        expiresAt: "2026-07-01T00:00:00.000Z"
      })
      .expect(201);
    await request(app)
      .post("/api/v1/organization-invitations/token-1/accept")
      .send({
        fullName: "Supplier User",
        legalName: "Supplier LLC",
        registrationNo: "SUP-1"
      })
      .expect(200);
    await request(app)
      .post("/api/v1/organization-invitations/invitation-1/revoke")
      .send({})
      .expect(200);

    expect(service.createOrganizationInvitation).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      invitationType: "SUPPLIER_ORG"
    }));
    expect(service.acceptOrganizationInvitation).toHaveBeenCalledWith(expect.any(Object), "token-1", expect.objectContaining({
      legalName: "Supplier LLC"
    }));
    expect(service.revokeOrganizationInvitation).toHaveBeenCalledWith(expect.any(Object), "invitation-1");
  });

  it("blocks viewer users from mutating onboarding resources", async () => {
    const service = createDomainService();

    const response = await request(createOnboardingTestApp(service, {
      userId: "viewer-1",
      participantRole: "BUYER",
      organizationRole: "VIEWER"
    }))
      .post("/api/v1/organizations/provision")
      .send({})
      .expect(403);

    expect(service.provisionOrganization).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      code: "forbidden",
      reasonCode: "ERR_FORBIDDEN",
      message: "Viewer role is read-only for Phase 1 API operations."
    });
  });
});
