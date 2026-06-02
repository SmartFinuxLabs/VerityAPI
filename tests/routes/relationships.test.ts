import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createRelationshipsRouter } from "../../src/routes/relationships.js";
import type { Phase1DomainService } from "../../src/services/phase1-domain.js";

function createRelationshipTestApp(domainService: Phase1DomainService) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.auth = {
      userId: "user-1",
      participantRole: "BUYER",
      organizationRole: "MEMBER"
    };
    next();
  });
  app.use("/api/v1", createRelationshipsRouter(domainService));
  app.use(errorHandler);
  return app;
}

function createDomainService(overrides: Partial<Phase1DomainService>): Phase1DomainService {
  return {
    provisionOrganization: jest.fn(),
    listMemberships: jest.fn(),
    updateMembershipRole: jest.fn(),
    createOrganizationInvitation: jest.fn(),
    acceptOrganizationInvitation: jest.fn(),
    revokeOrganizationInvitation: jest.fn(),
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
    queryAuditEvents: jest.fn(),
    ...overrides
  };
}

describe("relationship routes", () => {
  it("creates relationship invoice mode configuration through the domain service", async () => {
    const domainService = createDomainService({
      createRelationship: jest.fn(async () => ({
        id: "rel-1",
        invoiceMode: "SUPPLIER_ISSUED"
      }))
    });

    const payload = {
      buyerId: "buyer-org-1",
      supplierId: "supplier-org-1",
      invoiceMode: "SUPPLIER_ISSUED"
    };

    const response = await request(createRelationshipTestApp(domainService))
      .post("/api/v1/relationships")
      .send(payload)
      .expect(201);

    expect(domainService.createRelationship).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "BUYER",
        organizationRole: "MEMBER"
      },
      payload
    );
    expect(response.body).toEqual({
      data: {
        id: "rel-1",
        invoiceMode: "SUPPLIER_ISSUED"
      }
    });
  });

  it("updates relationship invoice mode through the domain service", async () => {
    const domainService = createDomainService({
      updateRelationshipInvoiceMode: jest.fn(async () => ({
        id: "rel-1",
        invoiceMode: "SELF_BILLED"
      }))
    });

    const response = await request(createRelationshipTestApp(domainService))
      .patch("/api/v1/relationships/rel-1/invoice-mode")
      .send({ invoiceMode: "SELF_BILLED" })
      .expect(200);

    expect(domainService.updateRelationshipInvoiceMode).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "BUYER",
        organizationRole: "MEMBER"
      },
      "rel-1",
      { invoiceMode: "SELF_BILLED" }
    );
    expect(response.body).toEqual({
      data: {
        id: "rel-1",
        invoiceMode: "SELF_BILLED"
      }
    });
  });
});
