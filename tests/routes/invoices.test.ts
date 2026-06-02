import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { ApiError } from "../../src/errors/api-error.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createInvoicesRouter } from "../../src/routes/invoices.js";
import type { Phase1DomainService } from "../../src/services/phase1-domain.js";

function createInvoiceTestApp(domainService: Phase1DomainService) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.auth = {
      userId: "user-1",
      participantRole: "SUPPLIER",
      organizationRole: "MEMBER"
    };
    next();
  });
  app.use("/api/v1", createInvoicesRouter(domainService));
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

describe("invoice routes", () => {
  it("registers supplier invoice intake through the domain service", async () => {
    const domainService = createDomainService({
      createInvoice: jest.fn(async () => ({
        id: "invoice-1",
        state: "SUBMITTED"
      }))
    });
    const payload = {
      relationshipId: "rel-1",
      supplierId: "supplier-org-1",
      buyerId: "buyer-org-1",
      invoiceNumber: "INV-2026-001",
      issueDate: "2026-06-01",
      dueDate: "2026-07-01",
      currency: "USDC",
      grossAmount: 25000
    };

    const response = await request(createInvoiceTestApp(domainService))
      .post("/api/v1/invoices")
      .send(payload)
      .expect(201);

    expect(domainService.createInvoice).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "SUPPLIER",
        organizationRole: "MEMBER"
      },
      payload
    );
    expect(response.body).toEqual({
      data: {
        id: "invoice-1",
        state: "SUBMITTED"
      }
    });
  });

  it("records buyer invoice resolution through the domain service", async () => {
    const domainService = createDomainService({
      createInvoiceResolution: jest.fn(async () => ({
        resolution: {
          id: "resolution-1",
          invoiceId: "invoice-1",
          decisionState: "ACCEPTED",
          acceptedAmount: 25000
        },
        invoice: {
          id: "invoice-1",
          state: "ACCEPTED"
        }
      }))
    });
    const payload = {
      decisionState: "ACCEPTED",
      acceptedAmount: 25000,
      decisionReason: "Buyer accepted invoice",
      reasonCode: "BUYER_APPROVED"
    };

    const response = await request(createInvoiceTestApp(domainService))
      .post("/api/v1/invoices/invoice-1/resolution")
      .send(payload)
      .expect(201);

    expect(domainService.createInvoiceResolution).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "SUPPLIER",
        organizationRole: "MEMBER"
      },
      "invoice-1",
      payload
    );
    expect(response.body).toEqual({
      data: {
        resolution: {
          id: "resolution-1",
          invoiceId: "invoice-1",
          decisionState: "ACCEPTED",
          acceptedAmount: 25000
        },
        invoice: {
          id: "invoice-1",
          state: "ACCEPTED"
        }
      }
    });
  });

  it("returns stable transition reason codes for invalid invoice resolution attempts", async () => {
    const domainService = createDomainService({
      createInvoiceResolution: jest.fn(async () => {
        throw new ApiError({
          statusCode: 409,
          code: "invalid_invoice_state",
          message: "Invoice is not in a resolvable state.",
          reasonCode: "ERR_CONFLICT",
          details: {
            currentState: "SETTLED",
            requestedState: "ACCEPTED",
            allowedSourceStates: ["SUBMITTED", "UNDER_REVIEW"]
          }
        });
      })
    });
    const payload = {
      decisionState: "ACCEPTED",
      acceptedAmount: 25000,
      decisionReason: "Buyer accepted invoice",
      reasonCode: "BUYER_APPROVED"
    };

    const response = await request(createInvoiceTestApp(domainService))
      .post("/api/v1/invoices/invoice-1/resolution")
      .send(payload)
      .expect(409);

    expect(domainService.createInvoiceResolution).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "SUPPLIER",
        organizationRole: "MEMBER"
      },
      "invoice-1",
      payload
    );
    expect(response.body).toEqual({
      code: "invalid_invoice_state",
      message: "Invoice is not in a resolvable state.",
      correlationId: "unknown",
      reasonCode: "ERR_CONFLICT",
      details: {
        currentState: "SETTLED",
        requestedState: "ACCEPTED",
        allowedSourceStates: ["SUBMITTED", "UNDER_REVIEW"]
      }
    });
  });

  it("registers deterministic invoice hash through the domain service", async () => {
    const domainService = createDomainService({
      registerInvoiceHash: jest.fn(async () => ({
        hashDigest: "hash-1",
        canonicalPayload: "PAYLOAD",
        duplicateDetected: false,
        duplicateOfInvoiceId: null
      }))
    });
    const payload = {
      supplierEntityId: "supplier-1",
      buyerEntityId: "buyer-1",
      invoiceNumber: "INV-2026-001",
      invoiceIssueDate: "2026-06-01",
      invoiceCurrency: "USDC",
      grossInvoiceAmount: 25000,
      acceptedAmountAtRegistration: 25000,
      dueDate: "2026-07-01",
      relationshipId: "rel-1",
      sourceSystemReference: "erp-invoice-1"
    };

    const response = await request(createInvoiceTestApp(domainService))
      .post("/api/v1/invoices/invoice-1/hash")
      .send(payload)
      .expect(200);

    expect(domainService.registerInvoiceHash).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "SUPPLIER",
        organizationRole: "MEMBER"
      },
      "invoice-1",
      payload
    );
    expect(response.body).toEqual({
      data: {
        hashDigest: "hash-1",
        canonicalPayload: "PAYLOAD",
        duplicateDetected: false,
        duplicateOfInvoiceId: null
      }
    });
  });

  it("returns stable duplicate reason codes for exact invoice hash duplicate attempts", async () => {
    const domainService = createDomainService({
      registerInvoiceHash: jest.fn(async () => {
        throw new ApiError({
          statusCode: 409,
          code: "duplicate_hash_detected",
          message: "Invoice hash matches an existing invoice.",
          reasonCode: "HASH_DUPLICATE_DETECTED",
          details: {
            duplicateOfInvoiceId: "invoice-original",
            hashDigest: "hash-1",
            canonicalPayload: "PAYLOAD"
          }
        });
      })
    });
    const payload = {
      supplierEntityId: "supplier-1",
      buyerEntityId: "buyer-1",
      invoiceNumber: "INV-2026-001",
      invoiceIssueDate: "2026-06-01",
      invoiceCurrency: "USDC",
      grossInvoiceAmount: 25000,
      acceptedAmountAtRegistration: 25000,
      dueDate: "2026-07-01",
      relationshipId: "rel-1",
      sourceSystemReference: "erp-invoice-1"
    };

    const response = await request(createInvoiceTestApp(domainService))
      .post("/api/v1/invoices/invoice-1/hash")
      .send(payload)
      .expect(409);

    expect(domainService.registerInvoiceHash).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "SUPPLIER",
        organizationRole: "MEMBER"
      },
      "invoice-1",
      payload
    );
    expect(response.body).toEqual({
      code: "duplicate_hash_detected",
      message: "Invoice hash matches an existing invoice.",
      correlationId: "unknown",
      reasonCode: "HASH_DUPLICATE_DETECTED",
      details: {
        duplicateOfInvoiceId: "invoice-original",
        hashDigest: "hash-1",
        canonicalPayload: "PAYLOAD"
      }
    });
  });

  it("evaluates invoice financeability through the domain service", async () => {
    const domainService = createDomainService({
      evaluateInvoiceFinanceability: jest.fn(async () => ({
        id: "financeability-1",
        invoiceId: "invoice-1",
        acceptedAmount: 25000,
        eligibleAmount: 25000,
        riskMode: "LOW",
        status: "ELIGIBLE",
        reasonCode: "FINANCEABLE_ACCEPTED_VALUE",
        isDuplicateBlocked: false
      }))
    });
    const payload = {
      resolutionId: "resolution-1",
      riskMode: "LOW"
    };

    const response = await request(createInvoiceTestApp(domainService))
      .post("/api/v1/invoices/invoice-1/financeability")
      .send(payload)
      .expect(201);

    expect(domainService.evaluateInvoiceFinanceability).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "SUPPLIER",
        organizationRole: "MEMBER"
      },
      "invoice-1",
      payload
    );
    expect(response.body).toEqual({
      data: {
        id: "financeability-1",
        invoiceId: "invoice-1",
        acceptedAmount: 25000,
        eligibleAmount: 25000,
        riskMode: "LOW",
        status: "ELIGIBLE",
        reasonCode: "FINANCEABLE_ACCEPTED_VALUE",
        isDuplicateBlocked: false
      }
    });
  });

  it("returns stable duplicate reason codes for duplicate-blocked financeability attempts", async () => {
    const domainService = createDomainService({
      evaluateInvoiceFinanceability: jest.fn(async () => {
        throw new ApiError({
          statusCode: 409,
          code: "duplicate_hash_detected",
          message: "Duplicate-blocked invoices cannot become financeable.",
          reasonCode: "HASH_DUPLICATE_DETECTED",
          details: {
            invoiceId: "invoice-1"
          }
        });
      })
    });
    const payload = {
      resolutionId: "resolution-1",
      riskMode: "LOW",
      isDuplicateBlocked: true
    };

    const response = await request(createInvoiceTestApp(domainService))
      .post("/api/v1/invoices/invoice-1/financeability")
      .send(payload)
      .expect(409);

    expect(domainService.evaluateInvoiceFinanceability).toHaveBeenCalledWith(
      {
        userId: "user-1",
        participantRole: "SUPPLIER",
        organizationRole: "MEMBER"
      },
      "invoice-1",
      payload
    );
    expect(response.body).toEqual({
      code: "duplicate_hash_detected",
      message: "Duplicate-blocked invoices cannot become financeable.",
      correlationId: "unknown",
      reasonCode: "HASH_DUPLICATE_DETECTED",
      details: {
        invoiceId: "invoice-1"
      }
    });
  });
});
