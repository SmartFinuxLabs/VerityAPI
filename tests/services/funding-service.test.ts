import { describe, expect, it, jest } from "@jest/globals";
import type { AuthContext } from "../../src/services/auth-token.js";
import { createFundingService } from "../../src/services/funding-service.js";

const auth: AuthContext = {
  userId: "user-1",
  participantRole: "INVESTOR",
  organizationRole: "MEMBER"
};

const supplierAuth: AuthContext = {
  userId: "supplier-user-1",
  participantRole: "SUPPLIER",
  organizationRole: "SUPER_USER"
};

function createMarketplaceSubmissionClient({
  invoiceData = {
    id: "invoice-1",
    supplier_id: "supplier-org-1",
    buyer_id: "buyer-org-1",
    state: "ACCEPTED",
    gross_amount: 50000,
    accepted_amount: 50000,
    currency: "USDC"
  },
  membershipData = {
    organization_id: "supplier-org-1"
  },
  existingOfferData = null,
  resolutionData = {
    id: "resolution-1",
    decision_state: "ACCEPTED"
  },
  financeabilityData = {
    id: "financeability-1",
    invoice_id: "invoice-1",
    resolution_id: "resolution-1",
    status: "ELIGIBLE",
    eligible_amount: 45000
  },
  offerData = {
    id: "offer-1",
    financeability_id: "financeability-1",
    offered_amount: 45000,
    yield_apr: 0.12,
    reserve_rate: 0.1,
    settlement_currency: "USDC",
    status: "OPEN",
    expires_at: "2026-09-01T00:00:00.000Z"
  }
}: {
  invoiceData?: unknown;
  membershipData?: unknown;
  existingOfferData?: unknown;
  resolutionData?: unknown;
  financeabilityData?: unknown;
  offerData?: unknown;
} = {}) {
  const invoiceMaybeSingle = jest.fn(async () => ({ data: invoiceData, error: null }));
  const invoiceEq = jest.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
  const invoiceSelect = jest.fn(() => ({ eq: invoiceEq }));
  const invoiceUpdateMaybeSingle = jest.fn(async () => ({
    data: { id: "invoice-1", state: "FACTORING_REQUESTED" },
    error: null
  }));
  const invoiceUpdateSelect = jest.fn(() => ({ maybeSingle: invoiceUpdateMaybeSingle }));
  const invoiceUpdateEq = jest.fn(() => ({ select: invoiceUpdateSelect }));
  const invoiceUpdate = jest.fn(() => ({ eq: invoiceUpdateEq }));

  const membershipMaybeSingle = jest.fn(async () => ({ data: membershipData, error: null }));
  const membershipEqStatus = jest.fn(() => ({ maybeSingle: membershipMaybeSingle }));
  const membershipEqUser = jest.fn(() => ({ eq: membershipEqStatus }));
  const membershipEqOrg = jest.fn(() => ({ eq: membershipEqUser }));
  const membershipSelect = jest.fn(() => ({ eq: membershipEqOrg }));

  const existingOfferMaybeSingle = jest.fn(async () => ({ data: existingOfferData, error: null }));
  const existingOfferEqStatus = jest.fn(() => ({ maybeSingle: existingOfferMaybeSingle }));
  const existingOfferEqInvoice = jest.fn(() => ({ eq: existingOfferEqStatus }));
  const existingOfferSelect = jest.fn(() => ({ eq: existingOfferEqInvoice }));

  const resolutionMaybeSingle = jest.fn(async () => ({ data: resolutionData, error: null }));
  const resolutionEq = jest.fn(() => ({ maybeSingle: resolutionMaybeSingle }));
  const resolutionSelect = jest.fn(() => ({ eq: resolutionEq }));

  const financeabilityMaybeSingle = jest.fn(async () => ({ data: financeabilityData, error: null }));
  const financeabilitySelect = jest.fn(() => ({ maybeSingle: financeabilityMaybeSingle }));
  const financeabilityInsert = jest.fn(() => ({ select: financeabilitySelect }));
  const financeabilityUpsert = jest.fn(() => ({ select: financeabilitySelect }));

  const offerMaybeSingle = jest.fn(async () => ({ data: offerData, error: null }));
  const offerSelect = jest.fn(() => ({ maybeSingle: offerMaybeSingle }));
  const offerInsert = jest.fn(() => ({ select: offerSelect }));

  const from = jest.fn((table: string) => {
    if (table === "invoices") {
      return { select: invoiceSelect, update: invoiceUpdate };
    }
    if (table === "party_memberships") {
      return { select: membershipSelect };
    }
    if (table === "funding_offers") {
      return { select: existingOfferSelect, insert: offerInsert };
    }
    if (table === "invoice_resolutions") {
      return { select: resolutionSelect };
    }
    if (table === "financeability_records") {
      return { insert: financeabilityInsert, upsert: financeabilityUpsert };
    }
    return {};
  });
  const client = { rpc: jest.fn(), from };

  return {
    client,
    invoiceEq,
    invoiceUpdate,
    invoiceUpdateEq,
    membershipEqOrg,
    existingOfferEqInvoice,
    existingOfferEqStatus,
    resolutionEq,
    financeabilityInsert,
    financeabilityUpsert,
    offerInsert
  };
}

function createFundingOfferClient({
  financeabilityData = {
    id: "financeability-1",
    status: "ELIGIBLE",
    eligible_amount: 50000,
    policy_snapshot: {
      riskProfileId: "risk-1"
    }
  },
  offerData = {
    id: "offer-1",
    financeability_id: "financeability-1",
    offered_amount: 40000,
    status: "OPEN"
  }
}: {
  financeabilityData?: unknown;
  offerData?: unknown;
} = {}) {
  const financeabilityMaybeSingle = jest.fn(async () => ({ data: financeabilityData, error: null }));
  const financeabilityEq = jest.fn(() => ({ maybeSingle: financeabilityMaybeSingle }));
  const financeabilitySelect = jest.fn(() => ({ eq: financeabilityEq }));

  const offerMaybeSingle = jest.fn(async () => ({ data: offerData, error: null }));
  const offerSelect = jest.fn(() => ({ maybeSingle: offerMaybeSingle }));
  const offerInsert = jest.fn(() => ({ select: offerSelect }));

  const from = jest.fn((table: string) => {
    if (table === "financeability_records") {
      return { select: financeabilitySelect };
    }
    return { insert: offerInsert };
  });
  const client = { rpc: jest.fn(), from };

  return { client, financeabilityEq, offerInsert };
}

function createCommitmentClient({
  offerData = {
    id: "offer-1",
    status: "OPEN",
    offered_amount: 40000
  },
  investorData = {
    id: "investor-1",
    party_type: "INVESTOR",
    status: "ACTIVE"
  },
  duplicateCommitmentData = null,
  commitmentData = {
    id: "commitment-1",
    funding_offer_id: "offer-1",
    status: "PLEDGED"
  }
}: {
  offerData?: unknown;
  investorData?: unknown;
  duplicateCommitmentData?: unknown;
  commitmentData?: unknown;
} = {}) {
  const offerMaybeSingle = jest.fn(async () => ({ data: offerData, error: null }));
  const offerEq = jest.fn(() => ({ maybeSingle: offerMaybeSingle }));
  const offerSelect = jest.fn(() => ({ eq: offerEq }));

  const investorMaybeSingle = jest.fn(async () => ({ data: investorData, error: null }));
  const investorEq = jest.fn(() => ({ maybeSingle: investorMaybeSingle }));
  const investorSelect = jest.fn(() => ({ eq: investorEq }));

  const duplicateMaybeSingle = jest.fn(async () => ({ data: duplicateCommitmentData, error: null }));
  const duplicateInvestorEq = jest.fn(() => ({ maybeSingle: duplicateMaybeSingle }));
  const duplicateOfferEq = jest.fn(() => ({ eq: duplicateInvestorEq }));
  const duplicateSelect = jest.fn(() => ({ eq: duplicateOfferEq }));

  const commitmentMaybeSingle = jest.fn(async () => ({ data: commitmentData, error: null }));
  const commitmentSelect = jest.fn(() => ({ maybeSingle: commitmentMaybeSingle }));
  const commitmentInsert = jest.fn(() => ({ select: commitmentSelect }));

  const from = jest.fn((table: string) => {
    if (table === "funding_offers") {
      return { select: offerSelect };
    }
    if (table === "organizations") {
      return { select: investorSelect };
    }
    if (table === "funding_commitments") {
      return { select: duplicateSelect, insert: commitmentInsert };
    }
    return {};
  });
  const client = { rpc: jest.fn(), from };

  return {
    client,
    offerEq,
    investorEq,
    duplicateOfferEq,
    duplicateInvestorEq,
    commitmentInsert
  };
}

function createService(client: ReturnType<typeof createFundingOfferClient>["client"]) {
  return createFundingService(() => client);
}

describe("funding service", () => {
  describe("supplier marketplace submission", () => {
    it("creates financeability and open funding offer for accepted supplier invoices", async () => {
      const {
        client,
        invoiceEq,
        invoiceUpdate,
        invoiceUpdateEq,
        membershipEqOrg,
        existingOfferEqInvoice,
        existingOfferEqStatus,
        resolutionEq,
        financeabilityUpsert,
        offerInsert
      } = createMarketplaceSubmissionClient();
      const service = createService(client);

      await expect(
        service.submitInvoiceToMarketplace(supplierAuth, "invoice-1", {
          offeredAmount: 45000,
          yieldApr: 0.12,
          reserveRate: 0.1,
          settlementCurrency: "USDC",
          expiresAt: "2026-09-01T00:00:00.000Z"
        })
      ).resolves.toEqual({
        invoiceId: "invoice-1",
        financeabilityId: "financeability-1",
        fundingOfferId: "offer-1",
        fundingStatus: "LISTED",
        offeredAmount: 45000,
        yieldApr: 0.12,
        reserveRate: 0.1,
        expiresAt: "2026-09-01T00:00:00.000Z"
      });

      expect(invoiceEq).toHaveBeenCalledWith("id", "invoice-1");
      expect(membershipEqOrg).toHaveBeenCalledWith("organization_id", "supplier-org-1");
      expect(existingOfferEqInvoice).toHaveBeenCalledWith("financeability.invoice_id", "invoice-1");
      expect(existingOfferEqStatus).toHaveBeenCalledWith("status", "OPEN");
      expect(resolutionEq).toHaveBeenCalledWith("invoice_id", "invoice-1");
      expect(financeabilityUpsert).toHaveBeenCalledWith(
        {
          invoice_id: "invoice-1",
          resolution_id: "resolution-1",
          accepted_amount: 50000,
          eligible_amount: 45000,
          status: "ELIGIBLE",
          reason_code: "SUPPLIER_MARKETPLACE_SUBMISSION",
          policy_snapshot: expect.objectContaining({
            submittedBy: "supplier-user-1",
            requestedOfferedAmount: 45000,
            advanceRate: 0.9,
            yieldApr: 0.12,
            reserveRate: 0.1
          })
        },
        { onConflict: "invoice_id" }
      );
      expect(offerInsert).toHaveBeenCalledWith({
        financeability_id: "financeability-1",
        offered_amount: 45000,
        yield_apr: 0.12,
        reserve_rate: 0.1,
        settlement_currency: "USDC",
        status: "OPEN",
        expires_at: "2026-09-01T00:00:00.000Z",
        created_by: "supplier-user-1"
      });
      expect(invoiceUpdate).toHaveBeenCalledWith({ state: "FACTORING_REQUESTED", updated_by: "supplier-user-1" });
      expect(invoiceUpdateEq).toHaveBeenCalledWith("id", "invoice-1");
    });

    it("rejects accepted invoices without an accepted resolution before financeability upsert", async () => {
      const { client, financeabilityUpsert, offerInsert } = createMarketplaceSubmissionClient({
        resolutionData: null
      });
      const service = createService(client);

      await expect(
        service.submitInvoiceToMarketplace(supplierAuth, "invoice-1", {
          offeredAmount: 45000,
          yieldApr: 0.12,
          reserveRate: 0.1,
          settlementCurrency: "USDC",
          expiresAt: "2026-09-01T00:00:00.000Z"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "not_financeable_state",
        reasonCode: "ERR_NOT_FINANCEABLE_STATE"
      });

      expect(financeabilityUpsert).not.toHaveBeenCalled();
      expect(offerInsert).not.toHaveBeenCalled();
    });

    it("rejects duplicate open marketplace offers for the same invoice", async () => {
      const { client, financeabilityInsert, financeabilityUpsert, offerInsert } = createMarketplaceSubmissionClient({
        existingOfferData: { id: "offer-existing" }
      });
      const service = createService(client);

      await expect(
        service.submitInvoiceToMarketplace(supplierAuth, "invoice-1", {
          offeredAmount: 45000,
          yieldApr: 0.12,
          reserveRate: 0.1,
          settlementCurrency: "USDC",
          expiresAt: "2026-09-01T00:00:00.000Z"
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        reasonCode: "ERR_CONFLICT"
      });

      expect(financeabilityInsert).not.toHaveBeenCalled();
      expect(financeabilityUpsert).not.toHaveBeenCalled();
      expect(offerInsert).not.toHaveBeenCalled();
    });
  });

  describe("funding offers", () => {
    it("creates funding offers when financeability is eligible and amount is within eligible amount", async () => {
      const { client, financeabilityEq, offerInsert } = createFundingOfferClient();
      const service = createService(client);

      await expect(
        service.createFundingOffer(auth, {
          financeabilityId: "financeability-1",
          offeredAmount: 40000,
          yieldApr: 0.12,
          reserveRate: 0.05,
          settlementCurrency: "USDC",
          expiresAt: "2026-07-01T00:00:00.000Z"
        })
      ).resolves.toEqual({
        id: "offer-1",
        financeability_id: "financeability-1",
        offered_amount: 40000,
        status: "OPEN"
      });

      expect(financeabilityEq).toHaveBeenCalledWith("id", "financeability-1");
      expect(offerInsert).toHaveBeenCalledWith({
        financeability_id: "financeability-1",
        offered_amount: 40000,
        yield_apr: 0.12,
        reserve_rate: 0.05,
        settlement_currency: "USDC",
        status: "OPEN",
        expires_at: "2026-07-01T00:00:00.000Z",
        created_by: "user-1"
      });
    });

    it("rejects offers when financeability is not eligible", async () => {
      const { client, offerInsert } = createFundingOfferClient({
        financeabilityData: {
          id: "financeability-1",
          status: "NOT_ELIGIBLE",
          eligible_amount: 50000
        }
      });
      const service = createService(client);

      await expect(
        service.createFundingOffer(auth, {
          financeabilityId: "financeability-1",
          offeredAmount: 40000,
          yieldApr: 0.12,
          expiresAt: "2026-07-01T00:00:00.000Z"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "not_financeable_state",
        reasonCode: "ERR_NOT_FINANCEABLE_STATE"
      });
      expect(offerInsert).not.toHaveBeenCalled();
    });

    it("rejects offers above eligible amount", async () => {
      const { client, offerInsert } = createFundingOfferClient();
      const service = createService(client);

      await expect(
        service.createFundingOffer(auth, {
          financeabilityId: "financeability-1",
          offeredAmount: 60000,
          yieldApr: 0.12,
          expiresAt: "2026-07-01T00:00:00.000Z"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "bad_request",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
      });
      expect(offerInsert).not.toHaveBeenCalled();
    });
  });

  describe("investor commitments", () => {
    it("creates investor commitments for active investor organizations", async () => {
      const { client, offerEq, investorEq, duplicateOfferEq, duplicateInvestorEq, commitmentInsert } =
        createCommitmentClient();
      const service = createService(client);

      await expect(
        service.createFundingCommitment(auth, "offer-1", {
          investorId: "investor-1",
          committedAmount: 25000,
          offeredRate: 0.12,
          commitmentTxRef: "tx-1"
        })
      ).resolves.toEqual({
        id: "commitment-1",
        funding_offer_id: "offer-1",
        status: "PLEDGED"
      });

      expect(offerEq).toHaveBeenCalledWith("id", "offer-1");
      expect(investorEq).toHaveBeenCalledWith("id", "investor-1");
      expect(duplicateOfferEq).toHaveBeenCalledWith("funding_offer_id", "offer-1");
      expect(duplicateInvestorEq).toHaveBeenCalledWith("investor_id", "investor-1");
      expect(commitmentInsert).toHaveBeenCalledWith({
        funding_offer_id: "offer-1",
        investor_id: "investor-1",
        committed_amount: 25000,
        offered_rate: 0.12,
        status: "PLEDGED",
        commitment_tx_ref: "tx-1"
      });
    });

    it("rejects inactive or non-investor organizations", async () => {
      const { client, commitmentInsert } = createCommitmentClient({
        investorData: {
          id: "investor-1",
          party_type: "BUYER",
          status: "ACTIVE"
        }
      });
      const service = createService(client);

      await expect(
        service.createFundingCommitment(auth, "offer-1", {
          investorId: "investor-1",
          committedAmount: 25000,
          offeredRate: 0.12,
          commitmentTxRef: "tx-1"
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "forbidden",
        reasonCode: "ERR_FORBIDDEN"
      });
      expect(commitmentInsert).not.toHaveBeenCalled();
    });

    it("rejects non-positive commitment amounts", async () => {
      const { client, commitmentInsert } = createCommitmentClient();
      const service = createService(client);

      await expect(
        service.createFundingCommitment(auth, "offer-1", {
          investorId: "investor-1",
          committedAmount: 0,
          offeredRate: 0.12,
          commitmentTxRef: "tx-1"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "bad_request",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
      });
      expect(commitmentInsert).not.toHaveBeenCalled();
    });

    it("rejects duplicate investor commitments for the same offer", async () => {
      const { client, commitmentInsert } = createCommitmentClient({
        duplicateCommitmentData: {
          id: "commitment-existing"
        }
      });
      const service = createService(client);

      await expect(
        service.createFundingCommitment(auth, "offer-1", {
          investorId: "investor-1",
          committedAmount: 25000,
          offeredRate: 0.12,
          commitmentTxRef: "tx-1"
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "duplicate_commitment",
        reasonCode: "ERR_CONFLICT"
      });
      expect(commitmentInsert).not.toHaveBeenCalled();
    });
  });
});
