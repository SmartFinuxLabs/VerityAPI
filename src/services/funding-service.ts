import type { AuthContext } from "./auth-token.js";
import { emitDomainAuditEvent } from "./audit-service.js";
import {
  type BodyRecord,
  type SupabaseDomainClientProvider,
  badRequest,
  conflict,
  duplicateCommitment,
  forbidden,
  insertRow,
  notFinanceableState,
  notFound,
  numberOrUndefined,
  operationFailed,
  requiredString,
  requireAssetCode,
  requirePositiveNumber,
  requireString,
  updateRow,
  upsertRow,
  unwrap
} from "./domain-service-utils.js";
import {
  validateFundingCommitmentCommand,
  validateFundingOfferCommand,
  validateMarketplaceSubmissionCommand
} from "./domain-validation-layer.js";

export interface FundingService {
  submitInvoiceToMarketplace(auth: AuthContext, invoiceId: string, body: BodyRecord): Promise<unknown>;
  createFundingOffer(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  createFundingCommitment(auth: AuthContext, offerId: string, body: BodyRecord): Promise<unknown>;
}

interface FundingServiceOptions {
  auditEvents?: boolean;
}

function readStringField(record: BodyRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readPositiveRecordAmount(record: BodyRecord, key: string, message: string): number {
  const value = numberOrUndefined(record[key]);
  if (value === undefined || value <= 0) {
    throw operationFailed("Read funding lifecycle state", { message });
  }
  return value;
}

function optionalNonNegativeRate(body: BodyRecord, key: string, fallback = 0): number {
  const value = numberOrUndefined(body[key]) ?? fallback;
  if (value < 0) {
    throw badRequest(`${key} cannot be negative.`);
  }
  return value;
}

function readRequiredPositiveRowAmount(record: BodyRecord, keys: string[], message: string): number {
  for (const key of keys) {
    const value = numberOrUndefined(record[key]);
    if (value !== undefined && value > 0) {
      return value;
    }
  }

  throw operationFailed("Read invoice lifecycle state", { message });
}

export function createFundingService(getClient: SupabaseDomainClientProvider, options: FundingServiceOptions = {}): FundingService {
  return {
    async submitInvoiceToMarketplace(auth, invoiceId, body) {
      validateMarketplaceSubmissionCommand(body);
      const offeredAmount = requirePositiveNumber(body, "offeredAmount");
      const yieldApr = optionalNonNegativeRate(body, "yieldApr");
      const reserveRate = optionalNonNegativeRate(body, "reserveRate");
      const settlementCurrency = requireAssetCode(body, "settlementCurrency");
      const expiresAt = requireString(body, "expiresAt");
      const client = getClient(auth);

      const invoiceResult = await client
        .from("invoices")
        .select("id,supplier_id,buyer_id,state,gross_amount,accepted_amount,currency")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invoiceResult.error) {
        throw operationFailed("Read invoice", invoiceResult.error);
      }

      if (!invoiceResult.data || typeof invoiceResult.data !== "object") {
        throw notFound("Invoice was not found.");
      }

      const invoice = invoiceResult.data as BodyRecord;
      if (readStringField(invoice, "state") !== "ACCEPTED") {
        throw notFinanceableState("Only ACCEPTED invoices can be submitted to marketplace.");
      }

      const supplierId = requireString({ supplierId: invoice.supplier_id }, "supplierId");
      const membershipResult = await client
        .from("party_memberships")
        .select("organization_id")
        .eq("organization_id", supplierId)
        .eq("user_id", auth.userId)
        .eq("membership_status", "ACTIVE")
        .maybeSingle();

      if (membershipResult.error) {
        throw operationFailed("Read supplier membership", membershipResult.error);
      }

      if (!membershipResult.data || typeof membershipResult.data !== "object") {
        throw forbidden("Supplier invoice marketplace submission requires membership in the supplier organization.");
      }

      const existingOfferResult = await client
        .from("funding_offers")
        .select("id,financeability:financeability_records!inner(invoice_id)")
        .eq("financeability.invoice_id", invoiceId)
        .eq("status", "OPEN")
        .maybeSingle();

      if (existingOfferResult.error) {
        throw operationFailed("Check marketplace offer", existingOfferResult.error);
      }

      if (existingOfferResult.data && typeof existingOfferResult.data === "object") {
        throw conflict("Invoice already has an open marketplace offer.");
      }

      const invoiceAmount = readRequiredPositiveRowAmount(
        invoice,
        ["accepted_amount", "gross_amount"],
        "Invoice accepted_amount or gross_amount is invalid."
      );
      if (offeredAmount > invoiceAmount) {
        throw badRequest("offeredAmount cannot exceed accepted invoice amount.");
      }

      const resolutionResult = await client
        .from("invoice_resolutions")
        .select("id,decision_state")
        .eq("invoice_id", invoiceId)
        .maybeSingle();

      if (resolutionResult.error) {
        throw operationFailed("Read invoice resolution", resolutionResult.error);
      }

      if (!resolutionResult.data || typeof resolutionResult.data !== "object") {
        throw notFinanceableState("Marketplace submission requires an accepted invoice resolution.");
      }

      const resolution = resolutionResult.data as BodyRecord;
      const decisionState = readStringField(resolution, "decision_state");
      if (decisionState !== "ACCEPTED" && decisionState !== "PARTIALLY_ACCEPTED") {
        throw notFinanceableState("Marketplace submission requires an accepted invoice resolution.");
      }

      const advanceRate = invoiceAmount > 0 ? offeredAmount / invoiceAmount : 0;
      const financeabilityRecord = await unwrap<BodyRecord>(
        "Upsert financeability record",
        upsertRow(client, "financeability_records", {
          invoice_id: invoiceId,
          resolution_id: requireString(resolution, "id"),
          accepted_amount: invoiceAmount,
          eligible_amount: offeredAmount,
          status: "ELIGIBLE",
          reason_code: "SUPPLIER_MARKETPLACE_SUBMISSION",
          policy_snapshot: {
            submittedBy: auth.userId,
            requestedOfferedAmount: offeredAmount,
            invoiceAmount,
            advanceRate,
            yieldApr,
            reserveRate,
            settlementCurrency,
            expiresAt
          }
        }, "invoice_id")
      );

      const financeabilityId = requireString(financeabilityRecord, "id");
      const offerRecord = await unwrap<BodyRecord>(
        "Create funding offer",
        insertRow(client, "funding_offers", {
          financeability_id: financeabilityId,
          offered_amount: offeredAmount,
          yield_apr: yieldApr,
          reserve_rate: reserveRate,
          settlement_currency: settlementCurrency,
          status: "OPEN",
          expires_at: expiresAt,
          created_by: auth.userId
        })
      );

      const fundingOfferId = requireString(offerRecord, "id");
      await unwrap<BodyRecord>(
        "Update invoice factoring state",
        updateRow(client, "invoices", invoiceId, {
          state: "FACTORING_REQUESTED",
          updated_by: auth.userId
        })
      );

      if (options.auditEvents) {
        await emitDomainAuditEvent(client, auth, {
          aggregateType: "FUNDING_OFFER",
          aggregateId: fundingOfferId,
          eventType: "INVOICE_MARKETPLACE_SUBMITTED",
          payload: {
            invoiceId,
            financeabilityId,
            fundingOfferId,
            offeredAmount,
            settlementCurrency
          }
        });
      }

      return {
        invoiceId,
        financeabilityId,
        fundingOfferId,
        fundingStatus: "LISTED",
        offeredAmount,
        yieldApr,
        reserveRate,
        expiresAt
      };
    },

    async createFundingOffer(auth, body) {
      validateFundingOfferCommand(body);
      const financeabilityId = requireString(body, "financeabilityId");
      const offeredAmount = requirePositiveNumber(body, "offeredAmount");
      const yieldApr = optionalNonNegativeRate(body, "yieldApr");
      const reserveRate = optionalNonNegativeRate(body, "reserveRate");
      const settlementCurrency = requireAssetCode(body, "settlementCurrency");
      const expiresAt = requireString(body, "expiresAt");
      const client = getClient(auth);

      const financeabilityResult = await client
        .from("financeability_records")
        .select("id,status,eligible_amount,policy_snapshot")
        .eq("id", financeabilityId)
        .maybeSingle();

      if (financeabilityResult.error) {
        throw operationFailed("Read financeability record", financeabilityResult.error);
      }

      if (!financeabilityResult.data || typeof financeabilityResult.data !== "object") {
        throw notFound("Financeability record was not found.");
      }

      const financeability = financeabilityResult.data as BodyRecord;
      if (readStringField(financeability, "status") !== "ELIGIBLE") {
        throw notFinanceableState("Funding offers require ELIGIBLE financeability.");
      }

      const eligibleAmount = readPositiveRecordAmount(
        financeability,
        "eligible_amount",
        "Financeability eligible_amount is invalid."
      );
      if (offeredAmount > eligibleAmount) {
        throw badRequest("offeredAmount cannot exceed eligible amount.");
      }

      const offerRecord = await unwrap<BodyRecord>(
        "Create funding offer",
        insertRow(client, "funding_offers", {
          financeability_id: financeabilityId,
          offered_amount: offeredAmount,
          yield_apr: yieldApr,
          reserve_rate: reserveRate,
          settlement_currency: settlementCurrency,
          status: requiredString(body, "status") ?? "OPEN",
          expires_at: expiresAt,
          created_by: auth.userId
        })
      );

      if (options.auditEvents) {
        await emitDomainAuditEvent(client, auth, {
          aggregateType: "FUNDING_OFFER",
          aggregateId: requireString(offerRecord, "id"),
          eventType: "FUNDING_OFFER_CREATED",
          payload: {
            financeabilityId,
            offeredAmount,
            settlementCurrency,
            status: requiredString(body, "status") ?? "OPEN"
          }
        });
      }

      return offerRecord;
    },

    async createFundingCommitment(auth, offerId, body) {
      validateFundingCommitmentCommand(body);
      const investorId = requireString(body, "investorId");
      const committedAmount = requirePositiveNumber(body, "committedAmount");
      const offeredRate = optionalNonNegativeRate(body, "offeredRate");
      const commitmentTxRef = requireString(body, "commitmentTxRef");
      const client = getClient(auth);

      const offerResult = await client
        .from("funding_offers")
        .select("id,status,offered_amount")
        .eq("id", offerId)
        .maybeSingle();

      if (offerResult.error) {
        throw operationFailed("Read funding offer", offerResult.error);
      }

      if (!offerResult.data || typeof offerResult.data !== "object") {
        throw notFound("Funding offer was not found.");
      }

      const offer = offerResult.data as BodyRecord;
      if (readStringField(offer, "status") !== "OPEN") {
        throw notFinanceableState("Investor commitments require an OPEN funding offer.");
      }

      const offerAmount = readPositiveRecordAmount(offer, "offered_amount", "Funding offer offered_amount is invalid.");
      if (committedAmount > offerAmount) {
        throw badRequest("committedAmount cannot exceed offered amount.");
      }

      const investorResult = await client
        .from("organizations")
        .select("id,party_type,status")
        .eq("id", investorId)
        .maybeSingle();

      if (investorResult.error) {
        throw operationFailed("Read investor organization", investorResult.error);
      }

      if (!investorResult.data || typeof investorResult.data !== "object") {
        throw notFound("Investor organization was not found.");
      }

      const investor = investorResult.data as BodyRecord;
      if (readStringField(investor, "party_type") !== "INVESTOR" || readStringField(investor, "status") !== "ACTIVE") {
        throw forbidden("Investor organization must be active.");
      }

      const duplicateResult = await client
        .from("funding_commitments")
        .select("id")
        .eq("funding_offer_id", offerId)
        .eq("investor_id", investorId)
        .maybeSingle();

      if (duplicateResult.error) {
        throw operationFailed("Check investor commitment", duplicateResult.error);
      }

      if (duplicateResult.data && typeof duplicateResult.data === "object") {
        throw duplicateCommitment("Investor already has a commitment for this offer.");
      }

      const commitmentRecord = await unwrap<BodyRecord>(
        "Create funding commitment",
        insertRow(client, "funding_commitments", {
          funding_offer_id: offerId,
          investor_id: investorId,
          committed_amount: committedAmount,
          offered_rate: offeredRate,
          status: requiredString(body, "status") ?? "PLEDGED",
          commitment_tx_ref: commitmentTxRef
        })
      );

      if (options.auditEvents) {
        await emitDomainAuditEvent(client, auth, {
          aggregateType: "FUNDING_COMMITMENT",
          aggregateId: requireString(commitmentRecord, "id"),
          eventType: "FUNDING_COMMITMENT_CREATED",
          payload: {
            offerId,
            investorId,
            committedAmount,
            status: requiredString(body, "status") ?? "PLEDGED"
          }
        });
      }

      return commitmentRecord;
    }
  };
}
