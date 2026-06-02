import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import type { AuthContext } from "./auth-token.js";

type BodyRecord = Record<string, unknown>;

interface SupabaseError {
  message?: string;
}

type SupabaseResult<T = unknown> = {
  data?: T | null;
  error?: SupabaseError | null;
};

type SupabaseDomainClient = {
  rpc(functionName: string, params?: BodyRecord): Promise<SupabaseResult>;
  from(table: string): any;
};

export interface Phase1DomainService {
  provisionOrganization(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  listMemberships(auth: AuthContext, organizationId: string): Promise<unknown>;
  updateMembershipRole(auth: AuthContext, membershipId: string, body: BodyRecord): Promise<unknown>;
  createOrganizationInvitation(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  acceptOrganizationInvitation(auth: AuthContext, invitationToken: string, body: BodyRecord): Promise<unknown>;
  revokeOrganizationInvitation(auth: AuthContext, invitationId: string): Promise<unknown>;
  createRelationship(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  updateRelationshipInvoiceMode(auth: AuthContext, relationshipId: string, body: BodyRecord): Promise<unknown>;
  upsertRelationshipRiskProfile(auth: AuthContext, relationshipId: string, body: BodyRecord): Promise<unknown>;
  createInvoice(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  createInvoiceResolution(auth: AuthContext, invoiceId: string, body: BodyRecord): Promise<unknown>;
  registerInvoiceHash(auth: AuthContext, invoiceId: string, body: BodyRecord): Promise<unknown>;
  evaluateInvoiceFinanceability(auth: AuthContext, invoiceId: string, body: BodyRecord): Promise<unknown>;
  createFundingOffer(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  createFundingCommitment(auth: AuthContext, offerId: string, body: BodyRecord): Promise<unknown>;
  createSettlementInstruction(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  getSettlementStatus(auth: AuthContext, settlementId: string): Promise<unknown>;
  queryAuditEvents(auth: AuthContext): Promise<unknown>;
}

interface Phase1DomainServiceOptions {
  url?: string;
  serviceRoleKey?: string;
  createClient?: (url: string, key: string) => SupabaseDomainClient;
}

function notConfigured(): ApiError {
  return new ApiError({
    statusCode: 500,
    code: "supabase_not_configured",
    message: "Supabase domain operations are not configured for VerityAPI.",
    reasonCode: "ERR_INTERNAL_SERVER_ERROR"
  });
}

function operationFailed(operation: string, error?: SupabaseError | null): ApiError {
  return new ApiError({
    statusCode: 500,
    code: "domain_operation_failed",
    message: `${operation} failed.`,
    reasonCode: "ERR_INTERNAL_SERVER_ERROR",
    details: error?.message
  });
}

function badRequest(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "bad_request",
    message,
    reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
  });
}

function invalidRelationshipMode(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "invalid_relationship_mode",
    message,
    reasonCode: "ERR_INVALID_RELATIONSHIP_MODE"
  });
}

function requiredString(body: BodyRecord, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function requireString(body: BodyRecord, key: string): string {
  const value = requiredString(body, key);
  if (!value) {
    throw badRequest(`${key} is required.`);
  }

  return value;
}

const invoiceModes = new Set(["SUPPLIER_ISSUED", "BUYER_IMPORTED", "SELF_BILLED"]);

function requireInvoiceMode(body: BodyRecord): string {
  const invoiceMode = requireString(body, "invoiceMode");

  if (!invoiceModes.has(invoiceMode)) {
    throw invalidRelationshipMode(`invoiceMode must be one of ${Array.from(invoiceModes).join(", ")}.`);
  }

  return invoiceMode;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function insertRow(client: SupabaseDomainClient, table: string, values: BodyRecord) {
  return client.from(table).insert(values).select("*").maybeSingle();
}

function updateRow(client: SupabaseDomainClient, table: string, id: string, values: BodyRecord) {
  return client.from(table).update(values).eq("id", id).select("*").maybeSingle();
}

async function unwrap<T>(operation: string, result: Promise<SupabaseResult<T>>) {
  const { data, error } = await result;
  if (error) {
    throw operationFailed(operation, error);
  }
  return data ?? {};
}

export function createSupabasePhase1DomainService(options: Phase1DomainServiceOptions): Phase1DomainService {
  const createClient =
    options.createClient ??
    ((url, key) => createSupabaseClient(url, key) as unknown as SupabaseDomainClient);

  function getClient(): SupabaseDomainClient {
    if (!options.url || !options.serviceRoleKey) {
      throw notConfigured();
    }

    return createClient(options.url, options.serviceRoleKey);
  }

  return {
    provisionOrganization(auth, body) {
      return unwrap(
        "Provision organization",
        getClient().rpc("provision_organization_with_super_user", {
          p_legal_name: requiredString(body, "legalName") ?? requiredString(body, "entityName"),
          p_party_type: requiredString(body, "partyType") ?? auth.participantRole,
          p_user_id: auth.userId,
          p_email: requiredString(body, "email"),
          p_full_name: requiredString(body, "fullName"),
          p_registration_no: requiredString(body, "registrationNo"),
          p_risk_profile: body.riskProfile ?? {}
        })
      ).then((organizationId) => ({ organizationId }));
    },

    listMemberships(_auth, organizationId) {
      return unwrap(
        "List organization memberships",
        getClient()
          .from("party_memberships")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
      );
    },

    updateMembershipRole(_auth, membershipId, body) {
      return unwrap(
        "Update membership role",
        updateRow(getClient(), "party_memberships", membershipId, {
          org_role: requiredString(body, "organizationRole") ?? requiredString(body, "orgRole"),
          updated_at: new Date().toISOString()
        })
      );
    },

    createOrganizationInvitation(_auth, body) {
      return unwrap(
        "Create organization invitation",
        getClient().rpc("create_organization_invitation", {
          p_source_organization_id: requiredString(body, "sourceOrganizationId"),
          p_invitee_email: requiredString(body, "inviteeEmail"),
          p_invitation_type: requiredString(body, "invitationType") ?? "ORG_USER",
          p_target_party_type: requiredString(body, "targetPartyType"),
          p_target_org_role: requiredString(body, "targetOrgRole") ?? "MEMBER",
          p_target_organization_id: requiredString(body, "targetOrganizationId"),
          p_expires_at: requiredString(body, "expiresAt")
        })
      ).then((invitationId) => ({ invitationId }));
    },

    acceptOrganizationInvitation(auth, invitationToken, body) {
      return unwrap(
        "Accept organization invitation",
        getClient().rpc("accept_organization_invitation", {
          p_invitation_token: invitationToken,
          p_user_id: auth.userId,
          p_full_name: requiredString(body, "fullName"),
          p_legal_name: requiredString(body, "legalName"),
          p_registration_no: requiredString(body, "registrationNo"),
          p_risk_profile: body.riskProfile ?? {}
        })
      ).then((organizationId) => ({ organizationId }));
    },

    revokeOrganizationInvitation(auth, invitationId) {
      return unwrap(
        "Revoke organization invitation",
        updateRow(getClient(), "organization_invitations", invitationId, {
          status: "REVOKED",
          revoked_by_user_id: auth.userId,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      );
    },

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

    upsertRelationshipRiskProfile(_auth, relationshipId, body) {
      return unwrap(
        "Update relationship risk profile",
        insertRow(getClient(), "risk_profiles", {
          relationship_id: relationshipId,
          recourse_type: requiredString(body, "recourseType") ?? "WITH_RECOURSE",
          warranty_flags: body.warrantyFlags ?? [],
          delinquency_terms: body.delinquencyTerms ?? {},
          concentration_limit: numberOrUndefined(body.concentrationLimit),
          credit_ceiling: numberOrUndefined(body.creditCeiling),
          risk_mode: requiredString(body, "riskMode"),
          is_complete: Boolean(body.isComplete)
        })
      );
    },

    createInvoice(auth, body) {
      return unwrap(
        "Create invoice",
        insertRow(getClient(), "invoices", {
          relationship_id: requiredString(body, "relationshipId"),
          supplier_id: requiredString(body, "supplierId"),
          buyer_id: requiredString(body, "buyerId"),
          invoice_number: requiredString(body, "invoiceNumber"),
          issue_date: requiredString(body, "issueDate"),
          due_date: requiredString(body, "dueDate"),
          currency: requiredString(body, "currency") ?? "USDC",
          gross_amount: numberOrUndefined(body.grossAmount),
          accepted_amount: numberOrUndefined(body.acceptedAmount),
          source_system_reference: requiredString(body, "sourceSystemReference"),
          metadata: body.metadata ?? {},
          created_by: auth.userId,
          updated_by: auth.userId
        })
      );
    },

    createInvoiceResolution(auth, invoiceId, body) {
      return unwrap(
        "Create invoice resolution",
        insertRow(getClient(), "invoice_resolutions", {
          invoice_id: invoiceId,
          decision_state: requiredString(body, "decisionState"),
          accepted_amount: numberOrUndefined(body.acceptedAmount),
          reviewer_id: auth.userId,
          decision_reason: requiredString(body, "decisionReason"),
          reason_code: requiredString(body, "reasonCode")
        })
      );
    },

    async registerInvoiceHash(_auth, invoiceId, body) {
      const hashData = await unwrap(
        "Compute invoice hash",
        getClient().rpc("compute_invoice_hash", {
          p_supplier_entity_id: requiredString(body, "supplierEntityId"),
          p_buyer_entity_id: requiredString(body, "buyerEntityId"),
          p_invoice_number: requiredString(body, "invoiceNumber"),
          p_invoice_issue_date: requiredString(body, "invoiceIssueDate"),
          p_invoice_currency: requiredString(body, "invoiceCurrency") ?? "USDC",
          p_gross_invoice_amount: numberOrUndefined(body.grossInvoiceAmount),
          p_accepted_amount_at_registration: numberOrUndefined(body.acceptedAmountAtRegistration),
          p_due_date: requiredString(body, "dueDate"),
          p_relationship_id: requiredString(body, "relationshipId"),
          p_source_system_reference: requiredString(body, "sourceSystemReference")
        })
      );
      const firstHash = Array.isArray(hashData) ? hashData[0] : hashData;
      const hashRecord = firstHash && typeof firstHash === "object" ? (firstHash as BodyRecord) : {};

      return unwrap(
        "Register invoice hash",
        updateRow(getClient(), "invoices", invoiceId, {
          canonical_payload: hashRecord.canonical_payload,
          hash_digest: hashRecord.hash_digest,
          hash_registered_at: new Date().toISOString()
        })
      );
    },

    evaluateInvoiceFinanceability(_auth, invoiceId, body) {
      return unwrap(
        "Evaluate invoice financeability",
        insertRow(getClient(), "financeability_records", {
          invoice_id: invoiceId,
          resolution_id: requiredString(body, "resolutionId"),
          accepted_amount: numberOrUndefined(body.acceptedAmount),
          eligible_amount: numberOrUndefined(body.eligibleAmount),
          risk_mode: requiredString(body, "riskMode"),
          status: requiredString(body, "status") ?? "ELIGIBLE",
          reason_code: requiredString(body, "reasonCode"),
          is_duplicate_blocked: Boolean(body.isDuplicateBlocked),
          policy_snapshot: body.policySnapshot ?? {}
        })
      );
    },

    createFundingOffer(auth, body) {
      return unwrap(
        "Create funding offer",
        insertRow(getClient(), "funding_offers", {
          financeability_id: requiredString(body, "financeabilityId"),
          offered_amount: numberOrUndefined(body.offeredAmount),
          yield_apr: numberOrUndefined(body.yieldApr),
          reserve_rate: numberOrUndefined(body.reserveRate) ?? 0,
          settlement_currency: requiredString(body, "settlementCurrency") ?? "USDC",
          status: requiredString(body, "status") ?? "OPEN",
          expires_at: requiredString(body, "expiresAt"),
          created_by: auth.userId
        })
      );
    },

    createFundingCommitment(_auth, offerId, body) {
      return unwrap(
        "Create funding commitment",
        insertRow(getClient(), "funding_commitments", {
          funding_offer_id: offerId,
          investor_id: requiredString(body, "investorId"),
          committed_amount: numberOrUndefined(body.committedAmount),
          offered_rate: numberOrUndefined(body.offeredRate),
          status: requiredString(body, "status") ?? "PLEDGED",
          commitment_tx_ref: requiredString(body, "commitmentTxRef")
        })
      );
    },

    createSettlementInstruction(auth, body) {
      return unwrap(
        "Create settlement instruction",
        insertRow(getClient(), "settlement_instructions", {
          funding_commitment_id: requiredString(body, "fundingCommitmentId"),
          contract_id: requiredString(body, "contractId"),
          invoice_id: requiredString(body, "invoiceId"),
          instruction_kind: requiredString(body, "instructionKind"),
          amount: numberOrUndefined(body.amount),
          asset: requiredString(body, "asset") ?? "USDC",
          priority: numberOrUndefined(body.priority) ?? 100,
          idempotency_key: requiredString(body, "idempotencyKey"),
          destination_ref: requiredString(body, "destinationRef"),
          provider: requiredString(body, "provider") ?? "ARC",
          requested_by: auth.userId
        })
      );
    },

    getSettlementStatus(_auth, settlementId) {
      return unwrap(
        "Read settlement status",
        getClient()
          .from("settlement_instructions")
          .select("*")
          .eq("id", settlementId)
          .maybeSingle()
      );
    },

    queryAuditEvents(_auth) {
      return unwrap(
        "Query audit events",
        getClient().from("audit_events").select("*").order("created_at", { ascending: false })
      );
    }
  };
}

export const supabasePhase1DomainService = createSupabasePhase1DomainService({
  url: env.supabase.url,
  serviceRoleKey: env.supabase.serviceRoleKey
});
