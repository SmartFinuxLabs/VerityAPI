import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createFundingRouter } from "../../src/routes/funding.js";
import type { Phase1DomainService } from "../../src/services/phase1-domain.js";

function createFundingTestApp(domainService: Phase1DomainService) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.auth = {
      userId: "user-1",
      participantRole: "INVESTOR",
      organizationRole: "MEMBER"
    };
    next();
  });
  app.use("/api/v1", createFundingRouter(domainService));
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
    submitInvoiceToMarketplace: jest.fn(),
    createFundingOffer: jest.fn(),
    createFundingCommitment: jest.fn(),
    createSettlementInstruction: jest.fn(),
    getSettlementStatus: jest.fn(),
    queryAuditEvents: jest.fn(),
    ...overrides
  };
}

describe("funding routes", () => {
  it("creates funding offers through the domain service", async () => {
    const domainService = createDomainService({
      createFundingOffer: jest.fn(async () => ({
        id: "offer-1",
        financeabilityId: "financeability-1",
        offeredAmount: 40000,
        status: "OPEN"
      }))
    });
    const payload = {
      offeredAmount: 40000,
      yieldApr: 0.12,
      reserveRate: 0.05,
      settlementCurrency: "USDC",
      expiresAt: "2026-07-01T00:00:00.000Z"
    };

    const response = await request(createFundingTestApp(domainService))
      .post("/api/v1/financeability/financeability-1/offers")
      .send(payload)
      .expect(201);

    expect(domainService.createFundingOffer).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "INVESTOR",
        organizationRole: "MEMBER"
      },
      {
        ...payload,
        financeabilityId: "financeability-1"
      }
    );
    expect(response.body).toEqual({
      data: {
        id: "offer-1",
        financeabilityId: "financeability-1",
        offeredAmount: 40000,
        status: "OPEN"
      }
    });
  });

  it("creates investor commitments through the domain service", async () => {
    const domainService = createDomainService({
      createFundingCommitment: jest.fn(async () => ({
        id: "commitment-1",
        fundingOfferId: "offer-1",
        status: "PLEDGED"
      }))
    });
    const payload = {
      investorId: "investor-1",
      committedAmount: 25000,
      offeredRate: 0.12,
      commitmentTxRef: "tx-1"
    };

    const response = await request(createFundingTestApp(domainService))
      .post("/api/v1/offers/offer-1/commitments")
      .send(payload)
      .expect(201);

    expect(domainService.createFundingCommitment).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "INVESTOR",
        organizationRole: "MEMBER"
      },
      "offer-1",
      payload
    );
    expect(response.body).toEqual({
      data: {
        id: "commitment-1",
        fundingOfferId: "offer-1",
        status: "PLEDGED"
      }
    });
  });

  it("submits supplier invoices to marketplace through the domain service", async () => {
    const domainService = createDomainService({
      submitInvoiceToMarketplace: jest.fn(async () => ({
        invoiceId: "invoice-1",
        financeabilityId: "financeability-1",
        fundingOfferId: "offer-1",
        fundingStatus: "LISTED",
        offeredAmount: 45000,
        yieldApr: 0.12,
        reserveRate: 0.1,
        expiresAt: "2026-09-01T00:00:00.000Z"
      }))
    });
    const payload = {
      offeredAmount: 45000,
      yieldApr: 0.12,
      reserveRate: 0.1,
      settlementCurrency: "USDC",
      expiresAt: "2026-09-01T00:00:00.000Z"
    };

    const response = await request(createFundingTestApp(domainService))
      .post("/api/v1/invoices/invoice-1/marketplace-submissions")
      .send(payload)
      .expect(201);

    expect(domainService.submitInvoiceToMarketplace).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "INVESTOR",
        organizationRole: "MEMBER"
      },
      "invoice-1",
      payload
    );
    expect(response.body).toEqual({
      data: {
        invoiceId: "invoice-1",
        financeabilityId: "financeability-1",
        fundingOfferId: "offer-1",
        fundingStatus: "LISTED",
        offeredAmount: 45000,
        yieldApr: 0.12,
        reserveRate: 0.1,
        expiresAt: "2026-09-01T00:00:00.000Z"
      }
    });
  });
});
