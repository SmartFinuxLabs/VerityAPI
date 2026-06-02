import { describe, expect, it } from "@jest/globals";
import {
  validateFinanceabilityCommand,
  validateFundingCommitmentCommand,
  validateFundingOfferCommand,
  validateInvoiceCreateCommand,
  validateInvoiceHashCommand,
  validateInvoiceResolutionCommand,
  validateRelationshipCreateCommand,
  validateRelationshipInvoiceModeCommand,
  validateRelationshipRiskProfileCommand,
  validateSettlementInstructionCommand,
  validateSettlementStatusCommand
} from "../../src/services/domain-validation-layer.js";

function captureReasonCode(action: () => void): string | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    if (typeof error === "object" && error && "reasonCode" in error) {
      return (error as { reasonCode?: string }).reasonCode;
    }
    return undefined;
  }
}

describe("domain validation layer", () => {
  it("accepts valid relationship create commands", () => {
    expect(() =>
      validateRelationshipCreateCommand({
        buyerId: "buyer-1",
        supplierId: "supplier-1",
        invoiceMode: "SUPPLIER_ISSUED"
      })
    ).not.toThrow();
  });

  it("rejects invalid relationship invoice mode", () => {
    expect(captureReasonCode(() => validateRelationshipInvoiceModeCommand({ invoiceMode: "INVALID" }))).toBe(
      "ERR_INVALID_RELATIONSHIP_MODE"
    );
  });

  it("rejects unsupported recourse type", () => {
    expect(captureReasonCode(() => validateRelationshipRiskProfileCommand({ recourseType: "UNKNOWN" }))).toBe(
      "ERR_MISSING_REQUIRED_FIELDS"
    );
  });

  it("validates invoice create baseline fields", () => {
    expect(() =>
      validateInvoiceCreateCommand({
        relationshipId: "rel-1",
        supplierId: "supplier-1",
        buyerId: "buyer-1",
        invoiceNumber: "INV-1",
        issueDate: "2026-06-01",
        dueDate: "2026-07-01",
        currency: "USDC",
        grossAmount: 1000
      })
    ).not.toThrow();
  });

  it("rejects invalid invoice resolution state", () => {
    expect(
      captureReasonCode(() =>
        validateInvoiceResolutionCommand({
          decisionState: "APPROVED",
          acceptedAmount: 100
        })
      )
    ).toBe("ERR_MISSING_REQUIRED_FIELDS");
  });

  it("preserves hash validation reason codes", () => {
    expect(
      captureReasonCode(() =>
        validateInvoiceHashCommand({
          supplierEntityId: "supplier-1"
        })
      )
    ).toBe("HASH_MISSING_REQUIRED_INPUT");
  });

  it("validates financeability command", () => {
    expect(() =>
      validateFinanceabilityCommand({
        riskMode: "LOW",
        resolutionId: "resolution-1",
        eligibleAmount: 1000
      })
    ).not.toThrow();
  });

  it("validates funding commands", () => {
    expect(() =>
      validateFundingOfferCommand({
        financeabilityId: "financeability-1",
        offeredAmount: 1000,
        settlementCurrency: "USDC",
        expiresAt: "2026-07-01T00:00:00.000Z"
      })
    ).not.toThrow();

    expect(() =>
      validateFundingCommitmentCommand({
        investorId: "investor-1",
        committedAmount: 1000,
        commitmentTxRef: "tx-1"
      })
    ).not.toThrow();
  });

  it("validates settlement commands", () => {
    expect(() =>
      validateSettlementInstructionCommand({
        fundingCommitmentId: "commitment-1",
        contractId: "contract-1",
        instructionKind: "FUND_ESCROW",
        amount: 1000,
        asset: "USDC",
        idempotencyKey: "idem-1",
        sourceWalletRef: "wallet-a",
        destinationWalletRef: "wallet-b",
        networkRef: "network-1",
        destinationRef: "escrow-wallet"
      })
    ).not.toThrow();

    expect(() => validateSettlementStatusCommand("instruction-1")).not.toThrow();
  });
});
