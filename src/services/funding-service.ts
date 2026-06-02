import type { AuthContext } from "./auth-token.js";
import { emitDomainAuditEvent } from "./audit-service.js";
import {
  type BodyRecord,
  type SupabaseDomainClientProvider,
  badRequest,
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
  unwrap
} from "./domain-service-utils.js";
import { validateFundingCommitmentCommand, validateFundingOfferCommand } from "./domain-validation-layer.js";

export interface FundingService {
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

export function createFundingService(getClient: SupabaseDomainClientProvider, options: FundingServiceOptions = {}): FundingService {
  return {
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
