import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createAuditRouter } from "../../src/routes/audit.js";
import type { Phase1DomainService } from "../../src/services/phase1-domain.js";

function createAuditTestApp(domainService: Phase1DomainService) {
  const app = express();
  app.use((_req, res, next) => {
    res.locals.auth = {
      userId: "operator-1",
      participantRole: "OPERATOR",
      organizationRole: "SUPER_USER"
    };
    next();
  });
  app.use("/api/v1", createAuditRouter(domainService));
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

describe("audit routes", () => {
  it("returns operator audit events with query filters", async () => {
    const domainService = createDomainService({
      queryAuditEvents: jest.fn(async () => ({
        events: [
          {
            id: "audit-1",
            aggregateType: "INVOICE",
            aggregateId: "invoice-1",
            eventType: "INVOICE_SUBMITTED"
          }
        ],
        nextCursor: null
      }))
    });

    const response = await request(createAuditTestApp(domainService))
      .get("/api/v1/audit/events")
      .query({
        aggregateType: "INVOICE",
        aggregateId: "invoice-1",
        eventType: "INVOICE_SUBMITTED",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-03T00:00:00.000Z",
        limit: "25"
      })
      .expect(200);

    expect(domainService.queryAuditEvents).toHaveBeenCalledWith(
      {
        userId: "operator-1",
        participantRole: "OPERATOR",
        organizationRole: "SUPER_USER"
      },
      {
        aggregateType: "INVOICE",
        aggregateId: "invoice-1",
        eventType: "INVOICE_SUBMITTED",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-03T00:00:00.000Z",
        limit: "25"
      }
    );
    expect(response.body).toEqual({
      data: {
        events: [
          {
            id: "audit-1",
            aggregateType: "INVOICE",
            aggregateId: "invoice-1",
            eventType: "INVOICE_SUBMITTED"
          }
        ],
        nextCursor: null
      }
    });
  });
});
