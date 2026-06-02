import type { AuthContext } from "./auth-token.js";
import {
  type BodyRecord,
  type SupabaseDomainClientProvider,
  insertRow,
  invalidRelationshipMode,
  badRequest,
  numberOrUndefined,
  requiredString,
  requireString,
  unwrap,
  updateRow
} from "./domain-service-utils.js";

export interface RelationshipService {
  createRelationship(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  updateRelationshipInvoiceMode(auth: AuthContext, relationshipId: string, body: BodyRecord): Promise<unknown>;
  upsertRelationshipRiskProfile(auth: AuthContext, relationshipId: string, body: BodyRecord): Promise<unknown>;
}

const invoiceModes = new Set(["SUPPLIER_ISSUED", "BUYER_IMPORTED", "SELF_BILLED"]);
const recourseTypes = new Set(["WITH_RECOURSE", "LIMITED_RECOURSE", "NON_RECOURSE"]);

function requireInvoiceMode(body: BodyRecord): string {
  const invoiceMode = requireString(body, "invoiceMode");

  if (!invoiceModes.has(invoiceMode)) {
    throw invalidRelationshipMode(`invoiceMode must be one of ${Array.from(invoiceModes).join(", ")}.`);
  }

  return invoiceMode;
}

function requireRecourseType(body: BodyRecord): string {
  const recourseType = requireString(body, "recourseType");
  if (!recourseTypes.has(recourseType)) {
    throw badRequest("recourseType must be one of WITH_RECOURSE, LIMITED_RECOURSE, NON_RECOURSE.");
  }
  return recourseType;
}

function stringArrayOrEmpty(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function hasRequiredRiskString(body: BodyRecord, key: string): boolean {
  return typeof body[key] === "string" && body[key].trim().length > 0;
}

function hasRequiredRiskNumber(body: BodyRecord, key: string): boolean {
  return numberOrUndefined(body[key]) !== undefined;
}

function isRiskProfileComplete(body: BodyRecord, warrantyFlags: string[]): boolean {
  return (
    hasRequiredRiskString(body, "recourseType") &&
    hasRequiredRiskString(body, "buyerObligationTerms") &&
    warrantyFlags.length > 0 &&
    hasRequiredRiskNumber(body, "gracePeriodDays") &&
    hasRequiredRiskString(body, "defaultTriggerPolicy") &&
    hasRequiredRiskString(body, "disputeEscalationPath") &&
    hasRequiredRiskNumber(body, "concentrationLimit") &&
    hasRequiredRiskNumber(body, "creditCeiling") &&
    hasRequiredRiskString(body, "riskMode")
  );
}

export function createRelationshipService(getClient: SupabaseDomainClientProvider): RelationshipService {
  return {
    async createRelationship(auth, body) {
      const buyerId = requireString(body, "buyerId");
      const supplierId = requireString(body, "supplierId");
      const invoiceMode = requireInvoiceMode(body);

      if (buyerId === supplierId) {
        throw invalidRelationshipMode("buyerId and supplierId must reference different organizations.");
      }

      return unwrap(
        "Create relationship",
        insertRow(getClient(), "relationships", {
          buyer_id: buyerId,
          supplier_id: supplierId,
          invoice_mode: invoiceMode,
          payment_mode: requiredString(body, "paymentMode") ?? "USDC",
          source_system_reference: requiredString(body, "sourceSystemReference"),
          created_by: auth.userId,
          updated_by: auth.userId
        })
      );
    },

    async updateRelationshipInvoiceMode(auth, relationshipId, body) {
      const invoiceMode = requireInvoiceMode(body);

      return unwrap(
        "Update relationship invoice mode",
        updateRow(getClient(), "relationships", relationshipId, {
          invoice_mode: invoiceMode,
          updated_by: auth.userId,
          updated_at: new Date().toISOString()
        })
      );
    },

    async upsertRelationshipRiskProfile(_auth, relationshipId, body) {
      const recourseType = requireRecourseType(body);
      const warrantyFlags = stringArrayOrEmpty(body.warrantyRepresentationFlags ?? body.warrantyFlags);
      const delinquencyTerms = {
        buyerObligationTerms: requiredString(body, "buyerObligationTerms"),
        gracePeriodDays: numberOrUndefined(body.gracePeriodDays),
        defaultTriggerPolicy: requiredString(body, "defaultTriggerPolicy"),
        disputeEscalationPath: requiredString(body, "disputeEscalationPath")
      };

      return unwrap(
        "Update relationship risk profile",
        insertRow(getClient(), "risk_profiles", {
          relationship_id: relationshipId,
          recourse_type: recourseType,
          warranty_flags: warrantyFlags,
          delinquency_terms: delinquencyTerms,
          concentration_limit: numberOrUndefined(body.concentrationLimit),
          credit_ceiling: numberOrUndefined(body.creditCeiling),
          risk_mode: requiredString(body, "riskMode"),
          is_complete: isRiskProfileComplete(body, warrantyFlags)
        })
      );
    }
  };
}
