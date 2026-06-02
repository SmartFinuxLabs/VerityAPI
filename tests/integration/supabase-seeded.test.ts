import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, afterAll } from "@jest/globals";
import type { AuthContext } from "../../src/services/auth-token.js";
import { createSupabasePhase1DomainService } from "../../src/services/phase1-domain.js";
import { createSupabaseWorkspaceService } from "../../src/services/workspace-state.js";

const runSeededSupabase = process.env.VERITY_SUPABASE_INTEGRATION === "1";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SupabaseAdminClient = ReturnType<typeof createClient>;

const ids = {
  users: [] as string[],
  organizations: [] as string[],
  relationships: [] as string[],
  invoices: [] as string[],
  invoiceResolutions: [] as string[],
  financeabilityRecords: [] as string[],
  fundingOffers: [] as string[],
  fundingCommitments: [] as string[],
  auditEvents: [] as string[]
};

function requireSupabaseConfig() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Seeded Supabase integration tests require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return { supabaseUrl, serviceRoleKey };
}

async function createSeedUser(client: SupabaseAdminClient, label: string) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `verity-${label}-${unique}@example.test`;
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: `Verity-${unique}-P1!`,
    email_confirm: true
  });

  if (error || !data.user) {
    throw new Error(`Create ${label} seed user failed: ${error?.message ?? "missing user"}`);
  }

  ids.users.push(data.user.id);
  return { id: data.user.id, email };
}

function authFor(userId: string, participantRole: AuthContext["participantRole"]): AuthContext {
  return {
    userId,
    participantRole,
    organizationRole: "SUPER_USER"
  };
}

function readId(record: unknown): string {
  if (typeof record !== "object" || record === null || !("id" in record)) {
    throw new Error("Expected persisted record with id.");
  }
  const id = (record as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Expected persisted record id to be a string.");
  }
  return id;
}

async function deleteRows(client: SupabaseAdminClient, table: string, values: string[]) {
  await deleteRowsByColumn(client, table, "id", values);
}

async function deleteRowsByColumn(
  client: SupabaseAdminClient,
  table: string,
  column: string,
  values: string[]
) {
  if (values.length === 0) return;
  const { error } = await client.from(table).delete().in(column, values);
  if (error) {
    throw new Error(`Cleanup ${table} failed: ${error.message}`);
  }
}

if (!runSeededSupabase) {
  describe.skip("seeded Supabase Phase 1 integration", () => {
    it("reads buyer, supplier, and investor workspaces from seeded active memberships", () => {
      // Opt-in only: requires VERITY_SUPABASE_INTEGRATION=1 and live Supabase credentials.
    });
  });
} else {
describe("seeded Supabase Phase 1 integration", () => {
  const config = requireSupabaseConfig();
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const domainService = createSupabasePhase1DomainService({
    url: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey
  });
  const workspaceService = createSupabaseWorkspaceService({
    url: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey
  });

  afterAll(async () => {
    await deleteRowsByColumn(admin, "audit_events", "actor_user_id", ids.users);
    await deleteRows(admin, "audit_events", ids.auditEvents);
    await deleteRows(admin, "funding_commitments", ids.fundingCommitments);
    await deleteRows(admin, "funding_offers", ids.fundingOffers);
    await deleteRows(admin, "financeability_records", ids.financeabilityRecords);
    await deleteRows(admin, "invoice_resolutions", ids.invoiceResolutions);
    await deleteRows(admin, "invoices", ids.invoices);
    await deleteRows(admin, "risk_profiles", ids.relationships);
    await deleteRows(admin, "relationships", ids.relationships);
    await deleteRows(admin, "organizations", ids.organizations);

    for (const userId of ids.users) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("reads buyer, supplier, and investor workspaces from seeded active memberships", async () => {
    const buyerUser = await createSeedUser(admin, "buyer");
    const supplierUser = await createSeedUser(admin, "supplier");
    const investorUser = await createSeedUser(admin, "investor");
    const suffix = buyerUser.id.slice(0, 8);

    const buyerAuth = authFor(buyerUser.id, "BUYER");
    const supplierAuth = authFor(supplierUser.id, "SUPPLIER");
    const investorAuth = authFor(investorUser.id, "INVESTOR");

    const buyerOrg = await domainService.provisionOrganization(buyerAuth, {
      legalName: `Verity P1 Buyer ${suffix}`,
      partyType: "BUYER",
      email: buyerUser.email,
      fullName: "P1 Buyer Seed",
      registrationNo: `P1-BUYER-${suffix}`
    });
    const supplierOrg = await domainService.provisionOrganization(supplierAuth, {
      legalName: `Verity P1 Supplier ${suffix}`,
      partyType: "SUPPLIER",
      email: supplierUser.email,
      fullName: "P1 Supplier Seed",
      registrationNo: `P1-SUPPLIER-${suffix}`
    });
    const investorOrg = await domainService.provisionOrganization(investorAuth, {
      legalName: `Verity P1 Investor ${suffix}`,
      partyType: "INVESTOR",
      email: investorUser.email,
      fullName: "P1 Investor Seed",
      registrationNo: `P1-INVESTOR-${suffix}`
    });
    const buyerOrgId = (buyerOrg as { organizationId: string }).organizationId;
    const supplierOrgId = (supplierOrg as { organizationId: string }).organizationId;
    const investorOrgId = (investorOrg as { organizationId: string }).organizationId;
    ids.organizations.push(buyerOrgId, supplierOrgId, investorOrgId);

    const relationship = await domainService.createRelationship(buyerAuth, {
      buyerId: buyerOrgId,
      supplierId: supplierOrgId,
      invoiceMode: "SUPPLIER_ISSUED",
      paymentMode: "USDC",
      sourceSystemReference: `P1-031-REL-${suffix}`
    });
    const relationshipId = readId(relationship);
    ids.relationships.push(relationshipId);

    const riskProfile = await domainService.upsertRelationshipRiskProfile(buyerAuth, relationshipId, {
      recourseType: "WITH_RECOURSE",
      buyerObligationTerms: "NET_30_AFTER_ACCEPTANCE",
      warrantyRepresentationFlags: ["NO_DUPLICATE_ASSIGNMENT", "VALID_INVOICE"],
      gracePeriodDays: 5,
      defaultTriggerPolicy: "BUYER_NON_PAYMENT_AFTER_GRACE",
      disputeEscalationPath: "OPERATIONS_REVIEW",
      concentrationLimit: 500000,
      creditCeiling: 1000000,
      riskMode: "LOW"
    });
    expect(riskProfile).toMatchObject({ is_complete: true });

    const invoice = await domainService.createInvoice(supplierAuth, {
      relationshipId,
      supplierId: supplierOrgId,
      buyerId: buyerOrgId,
      invoiceNumber: `P1-031-INV-${suffix}`,
      issueDate: "2026-06-02",
      dueDate: "2026-07-02",
      currency: "USDC",
      grossAmount: 25000,
      sourceSystemReference: `P1-031-ERP-${suffix}`
    });
    const invoiceId = readId(invoice);
    ids.invoices.push(invoiceId);
    expect(invoice).toMatchObject({ state: "SUBMITTED" });

    const resolutionResult = await domainService.createInvoiceResolution(buyerAuth, invoiceId, {
      decisionState: "ACCEPTED",
      acceptedAmount: 25000,
      decisionReason: "Seeded buyer acceptance",
      reasonCode: "BUYER_APPROVED"
    });
    const resolution = (resolutionResult as { resolution: unknown }).resolution;
    const resolutionId = readId(resolution);
    ids.invoiceResolutions.push(resolutionId);
    expect((resolutionResult as { invoice: unknown }).invoice).toMatchObject({ state: "ACCEPTED" });

    const hashResult = await domainService.registerInvoiceHash(supplierAuth, invoiceId, {
      supplierEntityId: supplierOrgId,
      buyerEntityId: buyerOrgId,
      invoiceNumber: `P1-031-INV-${suffix}`,
      invoiceIssueDate: "2026-06-02",
      invoiceCurrency: "USDC",
      grossInvoiceAmount: 25000,
      acceptedAmountAtRegistration: 25000,
      dueDate: "2026-07-02",
      relationshipId,
      sourceSystemReference: `P1-031-ERP-${suffix}`
    });
    expect(hashResult).toMatchObject({ duplicateDetected: false });

    const financeability = await domainService.evaluateInvoiceFinanceability(buyerAuth, invoiceId, {
      resolutionId,
      riskMode: "LOW",
      reasonCode: "FINANCEABLE_ACCEPTED_VALUE"
    });
    const financeabilityId = readId(financeability);
    ids.financeabilityRecords.push(financeabilityId);
    expect(financeability).toMatchObject({
      status: "ELIGIBLE",
      is_duplicate_blocked: false
    });

    const offer = await domainService.createFundingOffer(buyerAuth, {
      financeabilityId,
      offeredAmount: 25000,
      yieldApr: 0.12,
      reserveRate: 0.05,
      settlementCurrency: "USDC",
      expiresAt: "2026-07-01T00:00:00.000Z"
    });
    const offerId = readId(offer);
    ids.fundingOffers.push(offerId);

    const commitment = await domainService.createFundingCommitment(investorAuth, offerId, {
      investorId: investorOrgId,
      committedAmount: 25000,
      offeredRate: 0.12,
      commitmentTxRef: `P1-031-TX-${suffix}`
    });
    ids.fundingCommitments.push(readId(commitment));

    const buyerWorkspace = await workspaceService.getBuyerWorkspaceState(buyerAuth);
    expect(buyerWorkspace.invoices).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: invoiceId, buyerId: buyerOrgId })])
    );

    const supplierWorkspace = await workspaceService.getSupplierWorkspaceState(supplierAuth);
    expect(supplierWorkspace.invoices).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: invoiceId, supplierId: supplierOrgId })])
    );

    const investorWorkspace = await workspaceService.getInvestorWorkspaceState(investorAuth);
    expect(investorWorkspace.totalCommitted).toBe(25000);
    expect(investorWorkspace.invoices).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: readId(commitment), investor_id: investorOrgId })])
    );

    const auditEvents = await domainService.queryAuditEvents(buyerAuth, {
      aggregateId: invoiceId
    });
    const invoiceAuditRows = auditEvents as Array<{ id: string; eventType: string }>;
    ids.auditEvents.push(...invoiceAuditRows.map((event) => event.id));
    expect(invoiceAuditRows.map((event) => event.eventType)).toContain("INVOICE_RESOLVED");
  });
});
}
