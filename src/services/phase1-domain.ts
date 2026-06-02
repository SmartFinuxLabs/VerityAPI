import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import type { AuthContext } from "./auth-token.js";
import {
  type BodyRecord,
  type SupabaseDomainClient,
  insertRow,
  numberOrUndefined,
  requiredString,
  unwrap,
  updateRow
} from "./domain-service-utils.js";
import { createInvoiceService, type InvoiceService } from "./invoice-service.js";
import { createRelationshipService, type RelationshipService } from "./relationship-service.js";

export interface Phase1DomainService extends RelationshipService, InvoiceService {
  provisionOrganization(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  listMemberships(auth: AuthContext, organizationId: string): Promise<unknown>;
  updateMembershipRole(auth: AuthContext, membershipId: string, body: BodyRecord): Promise<unknown>;
  createOrganizationInvitation(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  acceptOrganizationInvitation(auth: AuthContext, invitationToken: string, body: BodyRecord): Promise<unknown>;
  revokeOrganizationInvitation(auth: AuthContext, invitationId: string): Promise<unknown>;
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

  const relationshipService = createRelationshipService(getClient);
  const invoiceService = createInvoiceService(getClient);

  return {
    ...relationshipService,
    ...invoiceService,

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
