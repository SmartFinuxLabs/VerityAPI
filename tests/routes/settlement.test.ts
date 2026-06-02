import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { ApiError } from "../../src/errors/api-error.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createSettlementRouter } from "../../src/routes/settlement.js";
import type { Phase1DomainService } from "../../src/services/phase1-domain.js";

function createSettlementTestApp(domainService: Phase1DomainService) {
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
  app.use("/api/v1", createSettlementRouter(domainService));
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

describe("settlement routes", () => {
  it("creates settlement instructions with idempotency key through the domain service", async () => {
    const domainService = createDomainService({
      createSettlementInstruction: jest.fn(async () => ({
        id: "instruction-1",
        executionStatus: "PENDING",
        asset: "USDC",
        idempotencyKey: "idem-1",
        provider: "ARC",
        providerReference: null
      }))
    });
    const payload = {
      contractId: "contract-1",
      instructionKind: "FUND_ESCROW",
      amount: 25000,
      asset: "USDC",
      sourceWalletRef: "wallet-source",
      destinationWalletRef: "wallet-destination",
      networkRef: "arc-testnet",
      destinationRef: "escrow-wallet"
    };

    const response = await request(createSettlementTestApp(domainService))
      .post("/api/v1/commitments/commitment-1/settlement-instructions")
      .set("Idempotency-Key", "idem-1")
      .send(payload)
      .expect(202);

    expect(domainService.createSettlementInstruction).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "INVESTOR",
        organizationRole: "MEMBER"
      },
      {
        ...payload,
        fundingCommitmentId: "commitment-1",
        idempotencyKey: "idem-1"
      }
    );
    expect(response.body).toEqual({
      data: {
        id: "instruction-1",
        executionStatus: "PENDING",
        asset: "USDC",
        idempotencyKey: "idem-1",
        provider: "ARC",
        providerReference: null
      }
    });
  });

  it("maps provider timeout status checks to 503", async () => {
    const domainService = createDomainService({
      getSettlementStatus: jest.fn(async () => {
        throw new ApiError({
          statusCode: 503,
          code: "provider_timeout",
          message: "Settlement provider timed out.",
          reasonCode: "PROVIDER_TIMEOUT"
        });
      })
    });

    await request(createSettlementTestApp(domainService))
      .get("/api/v1/settlement/instruction-1/status")
      .expect(503)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: "provider_timeout",
          reasonCode: "PROVIDER_TIMEOUT"
        });
      });
  });
});
