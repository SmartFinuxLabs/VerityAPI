import { describe, expect, it, jest } from "@jest/globals";
import type { AuthContext } from "../../src/services/auth-token.js";
import { createFundingService } from "../../src/services/funding-service.js";
import { createInvoiceService } from "../../src/services/invoice-service.js";
import { createRelationshipService } from "../../src/services/relationship-service.js";
import { createSettlementService } from "../../src/services/settlement-service.js";

const auth: AuthContext = {
  userId: "user-1",
  participantRole: "BUYER",
  organizationRole: "MEMBER"
};

function singleRow(data: unknown) {
  return {
    select: jest.fn(() => ({
      maybeSingle: jest.fn(async () => ({ data, error: null }))
    }))
  };
}

function createAuditInsert() {
  const auditMaybeSingle = jest.fn(async () => ({ data: { id: "audit-1" }, error: null }));
  const auditSelect = jest.fn(() => ({ maybeSingle: auditMaybeSingle }));
  return jest.fn(() => ({ select: auditSelect }));
}

describe("domain audit events", () => {
  it("emits audit events for relationship creation", async () => {
    const relationshipInsert = jest.fn(() => singleRow({ id: "rel-1", invoice_mode: "SUPPLIER_ISSUED" }));
    const auditInsert = createAuditInsert();
    const client = {
      rpc: jest.fn(),
      from: jest.fn((table: string) => (table === "audit_events" ? { insert: auditInsert } : { insert: relationshipInsert }))
    };
    const service = createRelationshipService(() => client, { auditEvents: true });

    await service.createRelationship(auth, {
      buyerId: "buyer-org-1",
      supplierId: "supplier-org-1",
      invoiceMode: "SUPPLIER_ISSUED",
      sourceSystemReference: "erp-rel-1"
    });

    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      aggregate_type: "RELATIONSHIP",
      aggregate_id: "rel-1",
      event_type: "RELATIONSHIP_CREATED",
      actor_user_id: "user-1",
      payload: expect.objectContaining({
        buyerId: "buyer-org-1",
        supplierId: "supplier-org-1",
        invoiceMode: "SUPPLIER_ISSUED"
      })
    }));
  });

  it("emits audit events for invoice submission and buyer resolution", async () => {
    const auditInsert = createAuditInsert();
    const invoiceInsert = jest.fn(() => singleRow({ id: "invoice-1", state: "SUBMITTED" }));
    const resolutionInsert = jest.fn(() => singleRow({ id: "resolution-1", decision_state: "ACCEPTED" }));
    const invoiceUpdate = jest.fn(() => ({
      eq: jest.fn(() => singleRow({ id: "invoice-1", state: "ACCEPTED" }))
    }));
    const invoiceRead = {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({
            data: { id: "invoice-1", state: "SUBMITTED", gross_amount: 25000 },
            error: null
          }))
        }))
      })),
      update: invoiceUpdate,
      insert: invoiceInsert
    };
    const relationshipRead = {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({
            data: {
              id: "rel-1",
              buyer_id: "buyer-org-1",
              supplier_id: "supplier-org-1",
              status: "ACTIVE"
            },
            error: null
          }))
        }))
      }))
    };
    const client = {
      rpc: jest.fn(),
      from: jest.fn((table: string) => {
        if (table === "audit_events") return { insert: auditInsert };
        if (table === "relationships") return relationshipRead;
        if (table === "invoice_resolutions") return { insert: resolutionInsert, upsert: resolutionInsert };
        return invoiceRead;
      })
    };
    const service = createInvoiceService(() => client, { auditEvents: true });

    await service.createInvoice(auth, {
      relationshipId: "rel-1",
      supplierId: "supplier-org-1",
      buyerId: "buyer-org-1",
      invoiceNumber: "INV-1",
      issueDate: "2026-06-01",
      dueDate: "2026-07-01",
      currency: "USDC",
      grossAmount: 25000,
      sourceSystemReference: "erp-invoice-1"
    });
    await service.createInvoiceResolution(auth, "invoice-1", {
      decisionState: "ACCEPTED",
      acceptedAmount: 25000,
      decisionReason: "Approved",
      reasonCode: "BUYER_APPROVED"
    });

    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      aggregate_type: "INVOICE",
      aggregate_id: "invoice-1",
      event_type: "INVOICE_SUBMITTED"
    }));
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      aggregate_type: "INVOICE",
      aggregate_id: "invoice-1",
      event_type: "INVOICE_RESOLVED",
      reason_code: "BUYER_APPROVED"
    }));
  });

  it("emits audit events for funding commitments", async () => {
    const auditInsert = createAuditInsert();
    const commitmentInsert = jest.fn(() => singleRow({ id: "commitment-1", status: "PLEDGED" }));
    const client = {
      rpc: jest.fn(),
      from: jest.fn((table: string) => {
        if (table === "audit_events") return { insert: auditInsert };
        if (table === "funding_offers") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: "offer-1", status: "OPEN", offered_amount: 40000 }, error: null }))
              }))
            }))
          };
        }
        if (table === "organizations") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: "investor-1", party_type: "INVESTOR", status: "ACTIVE" }, error: null }))
              }))
            }))
          };
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: null, error: null }))
              }))
            }))
          })),
          insert: commitmentInsert
        };
      })
    };
    const service = createFundingService(() => client, { auditEvents: true });

    await service.createFundingCommitment(auth, "offer-1", {
      investorId: "investor-1",
      committedAmount: 25000,
      commitmentTxRef: "tx-1"
    });

    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      aggregate_type: "FUNDING_COMMITMENT",
      aggregate_id: "commitment-1",
      event_type: "FUNDING_COMMITMENT_CREATED"
    }));
  });

  it("emits audit events for settlement instruction creation", async () => {
    const auditInsert = createAuditInsert();
    const instructionInsert = jest.fn(() => singleRow({
      id: "instruction-1",
      execution_status: "PENDING",
      asset: "USDC",
      idempotency_key: "idem-1"
    }));
    const client = {
      rpc: jest.fn(),
      from: jest.fn((table: string) => {
        if (table === "audit_events") return { insert: auditInsert };
        if (table === "funding_commitments") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: "commitment-1", status: "PLEDGED", committed_amount: 25000 }, error: null }))
              }))
            }))
          };
        }
        if (table === "funding_contracts") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: "contract-1", invoice_id: "invoice-1", contract_status: "ACTIVE" }, error: null }))
              }))
            }))
          };
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: null, error: null }))
            }))
          })),
          insert: instructionInsert
        };
      })
    };
    const service = createSettlementService(() => client, { auditEvents: true });

    await service.createSettlementInstruction(auth, {
      fundingCommitmentId: "commitment-1",
      contractId: "contract-1",
      instructionKind: "FUND_ESCROW",
      amount: 25000,
      asset: "USDC",
      sourceWalletRef: "wallet-source",
      destinationWalletRef: "wallet-destination",
      networkRef: "arc-testnet",
      destinationRef: "escrow-wallet",
      idempotencyKey: "idem-1"
    });

    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      aggregate_type: "SETTLEMENT_INSTRUCTION",
      aggregate_id: "instruction-1",
      event_type: "SETTLEMENT_INSTRUCTION_CREATED"
    }));
  });
});
