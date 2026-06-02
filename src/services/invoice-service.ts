import { createHash } from "node:crypto";
import type { AuthContext } from "./auth-token.js";
import { emitAuditEvent } from "./audit-service.js";
import {
  type BodyRecord,
  type SupabaseDomainClientProvider,
  badRequest,
  conflict,
  duplicateHashRegistered,
  hashValidationError,
  incompleteRiskProfile,
  insertRow,
  invalidRelationshipMode,
  notFinanceableState,
  notFound,
  numberOrUndefined,
  operationFailed,
  optionalNonNegativeNumber,
  requireAssetCode,
  requireIsoDate,
  requirePositiveNumber,
  requiredString,
  requireString,
  unwrap,
  updateRow,
  validateDueDateAfterIssue
} from "./domain-service-utils.js";

export interface InvoiceService {
  createInvoice(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  createInvoiceResolution(auth: AuthContext, invoiceId: string, body: BodyRecord): Promise<unknown>;
  registerInvoiceHash(auth: AuthContext, invoiceId: string, body: BodyRecord): Promise<unknown>;
  evaluateInvoiceFinanceability(auth: AuthContext, invoiceId: string, body: BodyRecord): Promise<unknown>;
}

interface InvoiceServiceOptions {
  auditEvents?: boolean;
}

function readRelationshipField(relationship: BodyRecord, key: string): string | undefined {
  const value = relationship[key];
  return typeof value === "string" ? value : undefined;
}

function readStringField(record: BodyRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

const decisionStates = new Set(["ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED", "DISPUTED", "HELD"]);
const resolvableInvoiceStates = new Set(["SUBMITTED", "UNDER_REVIEW"]);
const financeableInvoiceStates = new Set(["ACCEPTED", "PARTIALLY_ACCEPTED"]);

function requireDecisionState(body: BodyRecord): string {
  const decisionState = requireString(body, "decisionState");
  if (!decisionStates.has(decisionState)) {
    throw badRequest("decisionState must be one of ACCEPTED, PARTIALLY_ACCEPTED, REJECTED, DISPUTED, HELD.");
  }
  return decisionState;
}

function requireResolutionAmount(body: BodyRecord): number {
  const acceptedAmount = numberOrUndefined(body.acceptedAmount);
  if (acceptedAmount === undefined || acceptedAmount < 0) {
    throw badRequest("acceptedAmount must be a non-negative number.");
  }
  return acceptedAmount;
}

function validateResolutionAmount(decisionState: string, acceptedAmount: number, grossAmount: number) {
  if (acceptedAmount > grossAmount) {
    throw badRequest("acceptedAmount cannot exceed grossAmount.");
  }

  if (decisionState === "ACCEPTED" && acceptedAmount !== grossAmount) {
    throw badRequest("ACCEPTED requires acceptedAmount to equal grossAmount.");
  }

  if (decisionState === "PARTIALLY_ACCEPTED" && (acceptedAmount <= 0 || acceptedAmount >= grossAmount)) {
    throw badRequest("PARTIALLY_ACCEPTED requires acceptedAmount greater than zero and less than grossAmount.");
  }

  if (["REJECTED", "DISPUTED", "HELD"].includes(decisionState) && acceptedAmount !== 0) {
    throw badRequest(`${decisionState} requires acceptedAmount to be 0.`);
  }
}

function requireHashString(body: BodyRecord, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw hashValidationError("HASH_MISSING_REQUIRED_INPUT", `${key} is required for invoice hash registration.`);
  }

  return value.trim().toUpperCase();
}

function requireHashDate(body: BodyRecord, key: string): string {
  const value = requireHashString(body, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw hashValidationError("HASH_INVALID_DATE_FORMAT", `${key} must use YYYY-MM-DD format.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw hashValidationError("HASH_INVALID_DATE_FORMAT", `${key} must be a valid calendar date.`);
  }

  return value;
}

function requireHashAmount(body: BodyRecord, key: string): string {
  const value = numberOrUndefined(body[key]);
  if (value === undefined) {
    throw hashValidationError("HASH_INVALID_AMOUNT_FORMAT", `${key} must be a valid amount.`);
  }

  return value.toFixed(2);
}

function canonicalizeInvoiceHash(body: BodyRecord) {
  const fields = [
    requireHashString(body, "supplierEntityId"),
    requireHashString(body, "buyerEntityId"),
    requireHashString(body, "invoiceNumber"),
    requireHashDate(body, "invoiceIssueDate"),
    requireHashString(body, "invoiceCurrency"),
    requireHashAmount(body, "grossInvoiceAmount"),
    requireHashAmount(body, "acceptedAmountAtRegistration"),
    requireHashDate(body, "dueDate"),
    requireHashString(body, "relationshipId"),
    requireHashString(body, "sourceSystemReference")
  ];
  const canonicalPayload = fields.join("|");
  const hashDigest = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");

  return { canonicalPayload, hashDigest };
}

export function createInvoiceService(getClient: SupabaseDomainClientProvider, options: InvoiceServiceOptions = {}): InvoiceService {
  return {
    async createInvoice(auth, body) {
      const relationshipId = requireString(body, "relationshipId");
      const supplierId = requireString(body, "supplierId");
      const buyerId = requireString(body, "buyerId");
      const invoiceNumber = requireString(body, "invoiceNumber");
      const issueDate = requireIsoDate(body, "issueDate");
      const dueDate = requireIsoDate(body, "dueDate");
      const currency = requireAssetCode(body, "currency");
      const grossAmount = requirePositiveNumber(body, "grossAmount");
      const acceptedAmount = optionalNonNegativeNumber(body, "acceptedAmount");

      validateDueDateAfterIssue(issueDate, dueDate);

      if (acceptedAmount !== undefined && acceptedAmount > grossAmount) {
        throw badRequest("acceptedAmount cannot exceed grossAmount.");
      }

      const client = getClient();
      const relationshipResult = await client
        .from("relationships")
        .select("id,buyer_id,supplier_id,status")
        .eq("id", relationshipId)
        .maybeSingle();

      if (relationshipResult.error) {
        throw operationFailed("Read relationship", relationshipResult.error);
      }

      if (!relationshipResult.data || typeof relationshipResult.data !== "object") {
        throw notFound("Relationship was not found.");
      }

      const relationship = relationshipResult.data as BodyRecord;
      if (readRelationshipField(relationship, "status") !== "ACTIVE") {
        throw invalidRelationshipMode("Relationship must be active for invoice intake.");
      }

      if (
        readRelationshipField(relationship, "buyer_id") !== buyerId ||
        readRelationshipField(relationship, "supplier_id") !== supplierId
      ) {
        throw invalidRelationshipMode("Invoice buyerId and supplierId must match the relationship.");
      }

      const invoice = await unwrap<BodyRecord>(
        "Create invoice",
        insertRow(client, "invoices", {
          relationship_id: relationshipId,
          supplier_id: supplierId,
          buyer_id: buyerId,
          invoice_number: invoiceNumber,
          issue_date: issueDate,
          due_date: dueDate,
          currency,
          gross_amount: grossAmount,
          accepted_amount: acceptedAmount,
          source_system_reference: requiredString(body, "sourceSystemReference"),
          state: "SUBMITTED",
          metadata: body.metadata ?? {},
          created_by: auth.userId,
          updated_by: auth.userId
        })
      );

      if (options.auditEvents) {
        await emitAuditEvent(client, auth, {
          aggregateType: "INVOICE",
          aggregateId: requireString(invoice, "id"),
          eventType: "INVOICE_SUBMITTED",
          payload: {
            relationshipId,
            supplierId,
            buyerId,
            invoiceNumber,
            state: "SUBMITTED"
          }
        });
      }

      return invoice;
    },

    async createInvoiceResolution(auth, invoiceId, body) {
      const decisionState = requireDecisionState(body);
      const acceptedAmount = requireResolutionAmount(body);
      const client = getClient();

      const invoiceResult = await client
        .from("invoices")
        .select("id,state,gross_amount")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invoiceResult.error) {
        throw operationFailed("Read invoice", invoiceResult.error);
      }

      if (!invoiceResult.data || typeof invoiceResult.data !== "object") {
        throw notFound("Invoice was not found.");
      }

      const invoice = invoiceResult.data as BodyRecord;
      const invoiceState = readStringField(invoice, "state");
      if (!invoiceState || !resolvableInvoiceStates.has(invoiceState)) {
        throw conflict("Invoice is not in a resolvable state.");
      }

      const grossAmount = numberOrUndefined(invoice.gross_amount);
      if (grossAmount === undefined || grossAmount <= 0) {
        throw operationFailed("Read invoice", { message: "Invoice gross_amount is invalid." });
      }

      validateResolutionAmount(decisionState, acceptedAmount, grossAmount);

      const resolution = await unwrap(
        "Create invoice resolution",
        insertRow(client, "invoice_resolutions", {
          invoice_id: invoiceId,
          decision_state: decisionState,
          accepted_amount: acceptedAmount,
          reviewer_id: auth.userId,
          decision_reason: requiredString(body, "decisionReason"),
          reason_code: requiredString(body, "reasonCode")
        })
      );

      const updatedInvoice = await unwrap(
        "Update invoice resolution state",
        updateRow(client, "invoices", invoiceId, {
          state: decisionState,
          accepted_amount: acceptedAmount,
          updated_by: auth.userId,
          updated_at: new Date().toISOString()
        })
      );

      if (options.auditEvents) {
        await emitAuditEvent(client, auth, {
          aggregateType: "INVOICE",
          aggregateId: invoiceId,
          eventType: "INVOICE_RESOLVED",
          reasonCode: requiredString(body, "reasonCode"),
          payload: {
            resolutionId: requiredString(resolution as BodyRecord, "id"),
            decisionState,
            acceptedAmount,
            previousState: invoiceState,
            state: decisionState
          }
        });
      }

      return {
        resolution,
        invoice: updatedInvoice
      };
    },

    async registerInvoiceHash(auth, invoiceId, body) {
      const { canonicalPayload, hashDigest } = canonicalizeInvoiceHash(body);
      const client = getClient();

      const currentInvoiceResult = await client
        .from("invoices")
        .select("id,hash_digest,canonical_payload")
        .eq("id", invoiceId)
        .maybeSingle();

      if (currentInvoiceResult.error) {
        throw operationFailed("Read invoice hash state", currentInvoiceResult.error);
      }

      if (!currentInvoiceResult.data || typeof currentInvoiceResult.data !== "object") {
        throw notFound("Invoice was not found.");
      }

      const currentInvoice = currentInvoiceResult.data as BodyRecord;
      const existingDigest = readStringField(currentInvoice, "hash_digest");
      const existingPayload = readStringField(currentInvoice, "canonical_payload");
      if (existingDigest || existingPayload) {
        if (existingDigest === hashDigest && existingPayload === canonicalPayload) {
          return {
            hashDigest,
            canonicalPayload,
            duplicateDetected: false,
            duplicateOfInvoiceId: null
          };
        }

        throw duplicateHashRegistered("Invoice hash and canonical payload are already registered.");
      }

      const duplicateResult = await client
        .from("invoices")
        .select("id")
        .eq("hash_digest", hashDigest)
        .neq("id", invoiceId)
        .maybeSingle();

      if (duplicateResult.error) {
        throw operationFailed("Check duplicate invoice hash", duplicateResult.error);
      }

      const duplicateInvoice =
        duplicateResult.data && typeof duplicateResult.data === "object" ? (duplicateResult.data as BodyRecord) : null;
      const duplicateOfInvoiceId = duplicateInvoice ? readStringField(duplicateInvoice, "id") ?? null : null;
      if (duplicateOfInvoiceId) {
        return {
          hashDigest,
          canonicalPayload,
          duplicateDetected: true,
          duplicateOfInvoiceId
        };
      }

      await unwrap(
        "Register invoice hash",
        updateRow(client, "invoices", invoiceId, {
          canonical_payload: canonicalPayload,
          hash_digest: hashDigest,
          hash_registered_at: new Date().toISOString()
        })
      );

      if (options.auditEvents) {
        await emitAuditEvent(client, auth, {
          aggregateType: "INVOICE",
          aggregateId: invoiceId,
          eventType: "INVOICE_HASH_REGISTERED",
          payload: {
            hashDigest,
            duplicateDetected: false
          }
        });
      }

      return {
        hashDigest,
        canonicalPayload,
        duplicateDetected: false,
        duplicateOfInvoiceId: null
      };
    },

    async evaluateInvoiceFinanceability(auth, invoiceId, body) {
      const client = getClient();
      const invoiceResult = await client
        .from("invoices")
        .select("id,relationship_id,state,accepted_amount")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invoiceResult.error) {
        throw operationFailed("Read invoice financeability state", invoiceResult.error);
      }

      if (!invoiceResult.data || typeof invoiceResult.data !== "object") {
        throw notFound("Invoice was not found.");
      }

      const invoice = invoiceResult.data as BodyRecord;
      const invoiceState = readStringField(invoice, "state");
      if (!invoiceState || !financeableInvoiceStates.has(invoiceState)) {
        throw notFinanceableState("Only ACCEPTED or PARTIALLY_ACCEPTED invoices can become ELIGIBLE.");
      }

      const acceptedAmount = numberOrUndefined(invoice.accepted_amount);
      if (acceptedAmount === undefined || acceptedAmount <= 0) {
        throw notFinanceableState("Invoice accepted amount must be positive before financeability evaluation.");
      }

      const relationshipId = readStringField(invoice, "relationship_id");
      if (!relationshipId) {
        throw incompleteRiskProfile("Invoice relationship is required before financeability evaluation.");
      }

      const riskProfileResult = await client
        .from("risk_profiles")
        .select("id,relationship_id,recourse_type,risk_mode,is_complete")
        .eq("relationship_id", relationshipId)
        .maybeSingle();

      if (riskProfileResult.error) {
        throw operationFailed("Read relationship risk profile", riskProfileResult.error);
      }

      if (!riskProfileResult.data || typeof riskProfileResult.data !== "object") {
        throw incompleteRiskProfile("Complete relationship risk profile is required before financeability evaluation.");
      }

      const riskProfile = riskProfileResult.data as BodyRecord;
      if (riskProfile.is_complete !== true) {
        throw incompleteRiskProfile("Complete relationship risk profile is required before financeability evaluation.");
      }

      const riskMode = requiredString(body, "riskMode");
      const profileRiskMode = readStringField(riskProfile, "risk_mode");
      const recourseType = readStringField(riskProfile, "recourse_type");

      const requestedEligibleAmount = numberOrUndefined(body.eligibleAmount);
      const eligibleAmount = requestedEligibleAmount ?? acceptedAmount;
      if (eligibleAmount <= 0 || eligibleAmount > acceptedAmount) {
        throw badRequest("eligibleAmount must be greater than zero and cannot exceed accepted amount.");
      }

      const financeability = await unwrap<BodyRecord>(
        "Evaluate invoice financeability",
        insertRow(client, "financeability_records", {
          invoice_id: invoiceId,
          resolution_id: requiredString(body, "resolutionId"),
          accepted_amount: acceptedAmount,
          eligible_amount: eligibleAmount,
          risk_mode: riskMode,
          status: requiredString(body, "status") ?? "ELIGIBLE",
          reason_code: requiredString(body, "reasonCode") ?? "FINANCEABLE_ACCEPTED_VALUE",
          is_duplicate_blocked: Boolean(body.isDuplicateBlocked),
          policy_snapshot: body.policySnapshot ?? {
            riskProfileId: readStringField(riskProfile, "id"),
            recourseType,
            riskMode: profileRiskMode
          }
        })
      );

      if (options.auditEvents) {
        await emitAuditEvent(client, auth, {
          aggregateType: "FINANCEABILITY",
          aggregateId: requireString(financeability, "id"),
          eventType: "FINANCEABILITY_EVALUATED",
          reasonCode: requiredString(body, "reasonCode") ?? "FINANCEABLE_ACCEPTED_VALUE",
          payload: {
            invoiceId,
            acceptedAmount,
            eligibleAmount,
            status: requiredString(body, "status") ?? "ELIGIBLE"
          }
        });
      }

      return financeability;
    }
  };
}
