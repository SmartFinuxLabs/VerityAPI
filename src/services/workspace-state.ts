import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import type { AuthContext } from "./auth-token.js";

export interface BuyerWorkspaceState {
  invoices: unknown[];
  fundingRequests: unknown[];
  liquidity: {
    availableLiquidity: number;
    walletAddress: string;
    walletName: string;
    isConnected: boolean;
  };
}

export interface SupplierWorkspaceState {
  supplierOrganizationId: string | null;
  invoices: unknown[];
  registeredBuyers: RegisteredBuyerOption[];
  availableLiquidity: number;
  escrowValue: number;
  onChainCredit: number;
  walletConnected: boolean;
  walletAddress: string | null;
}

export interface SupplierAnalyticsState {
  volumeByStatus: { status: string; count: number; totalAmount: number }[];
  timeTrends: { period: string; createdVolume: number; settledVolume: number }[];
  cashFlowProjections: { date: string; expectedAmount: number; factoredAmount: number }[];
  financialHealth: {
    disputeRatio: number;
    onChainCreditScore: number;
  };
}

export interface InvestorWorkspaceState {
  invoices: unknown[];
  settlements: unknown[];
  ledgerRows: unknown[];
  totalCommitted: number;
  activeInvestments: number;
  availableCapital: number;
  projectedYield: number;
  ytdEarned: number;
}

export interface RegisteredBuyerOption {
  buyerId: string;
  buyerName: string;
  buyerStatus?: string;
}

export interface WorkspaceService {
  getBuyerWorkspaceState(auth: AuthContext): Promise<BuyerWorkspaceState>;
  getSupplierWorkspaceState(auth: AuthContext): Promise<SupplierWorkspaceState>;
  getSupplierAnalytics(auth: AuthContext): Promise<SupplierAnalyticsState>;
  getInvestorWorkspaceState(auth: AuthContext): Promise<InvestorWorkspaceState>;
}

interface SupabaseError {
  message?: string;
}

interface SupabaseQueryResult<T> {
  data?: T[] | null;
  error?: SupabaseError | null;
}

interface SupabaseSingleResult<T> {
  data?: T | null;
  error?: SupabaseError | null;
}

type QueryBuilder<T = Record<string, unknown>> = {
  select(columns?: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): Promise<SupabaseQueryResult<T>>;
  maybeSingle(): Promise<SupabaseSingleResult<T>>;
};

export interface SupabaseWorkspaceClient {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
}

export type SupabaseWorkspaceClientFactory = (url: string, key: string) => SupabaseWorkspaceClient;

interface SupabaseWorkspaceServiceOptions {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  createClient?: SupabaseWorkspaceClientFactory;
}

function notConfigured(): ApiError {
  return new ApiError({
    statusCode: 500,
    code: "supabase_not_configured",
    message: "Supabase workspace state requires SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY with a verified user access token.",
    reasonCode: "ERR_INTERNAL_SERVER_ERROR"
  });
}

function queryFailed(operation: string, error?: SupabaseError | null): ApiError {
  return new ApiError({
    statusCode: 500,
    code: "workspace_query_failed",
    message: `${operation} failed.`,
    reasonCode: "ERR_INTERNAL_SERVER_ERROR",
    details: error?.message
  });
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function dateValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nestedLegalName(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (Array.isArray(value)) {
    return stringValue(objectValue(value[0]).legal_name);
  }
  return stringValue(objectValue(value).legal_name);
}

function frontendInvoiceStatus(state: string, perspective: "BUYER" | "SUPPLIER"): string {
  if (perspective === "SUPPLIER") {
    if (state === "SUBMITTED" || state === "UNDER_REVIEW") return "PENDING";
    if (state === "ACCEPTED" || state === "PARTIALLY_ACCEPTED") return "ACCEPTED";
    if (state === "DISPUTED" || state === "HELD" || state === "REJECTED") return "DISPUTED";
    if (state === "SETTLED") return "SETTLED";
    if (state === "FACTORED") return "FACTORED";
    return state || "PENDING";
  } else {
    if (state === "SUBMITTED" || state === "UNDER_REVIEW") return "PENDING_VERIFICATION";
    if (state === "ACCEPTED" || state === "PARTIALLY_ACCEPTED") return "VERIFIED";
    if (state === "DISPUTED" || state === "HELD" || state === "REJECTED") return "CONTESTED";
    if (state === "SETTLED") return "SETTLED";
    if (state === "FACTORED") return "FACTORED";
    return state || "PENDING_VERIFICATION";
  }
}

function mapInvoiceRow(row: Record<string, unknown>, perspective: "BUYER" | "SUPPLIER") {
  const metadata = objectValue(row.metadata);
  const invoiceNumber = stringValue(row.invoice_number, stringValue(row.id, "invoice"));
  const supplierId = stringValue(row.supplier_id);
  const buyerId = stringValue(row.buyer_id);
  const grossAmount = numberValue(row.gross_amount);
  const acceptedAmount = row.accepted_amount === null ? undefined : numberValue(row.accepted_amount);
  const amount = numberValue(row.accepted_amount, grossAmount);
  const lineItems = arrayValue(metadata.lineItems);
  const validations = arrayValue(metadata.validations);

  return {
    id: stringValue(row.id, invoiceNumber),
    invoiceNumber,
    relationshipId: stringValue(row.relationship_id),
    supplierId,
    buyerId,
    buyer: stringValue(metadata.buyerName, nestedLegalName(row, "buyer")),
    supplierName: stringValue(metadata.supplierName, nestedLegalName(row, "supplier")),
    amount,
    grossAmount,
    acceptedAmount,
    currency: stringValue(row.currency, "USDC"),
    status: frontendInvoiceStatus(stringValue(row.state, "SUBMITTED"), perspective),
    issueDate: dateValue(row.issue_date),
    maturityDate: dateValue(row.due_date),
    dueDate: dateValue(row.due_date),
    hashDigest: stringValue(row.hash_digest),
    sourceSystemReference: stringValue(row.source_system_reference),
    poNumber: stringValue(metadata.poNumber, `PO-${invoiceNumber}`),
    goodsReceiptNumber: stringValue(metadata.goodsReceiptNumber, `GR-${invoiceNumber}`),
    walletAddress: stringValue(metadata.walletAddress, supplierId),
    lineItems: lineItems.length > 0 ? lineItems : [
      {
        description: `Invoice ${invoiceNumber}`,
        qty: 1,
        unitPrice: grossAmount,
        total: grossAmount
      }
    ],
    validations: validations.length > 0 ? validations : [
      {
        key: "invoice-format",
        name: "Invoice payload",
        status: "passed",
        detail: "Invoice payload is available from VerityAPI."
      },
      {
        key: "party-match",
        name: "Buyer and supplier",
        status: "passed",
        detail: "Buyer and supplier organization identifiers are present."
      }
    ],
    metadata
  };
}

function mapLedgerRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    invoiceId: stringValue(row.invoice_id),
    amount: numberValue(row.amount),
    asset: stringValue(row.asset, "USDC"),
    entryType: stringValue(row.entry_type),
    direction: stringValue(row.direction),
    settlementDate: dateValue(row.occurred_at),
    status: stringValue(row.reference)
  };
}

function mapSettlementRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id),
    invoiceId: stringValue(row.invoice_id),
    amount: numberValue(row.amount),
    asset: stringValue(row.asset, "USDC"),
    status: stringValue(row.execution_status, "PENDING"),
    provider: stringValue(row.provider, "ARC"),
    date: dateValue(row.requested_at)
  };
}

function mapRegisteredBuyerRow(row: Record<string, unknown>): RegisteredBuyerOption {
  return {
    buyerId: stringValue(row.id),
    buyerName: stringValue(row.legal_name, stringValue(row.id, "Registered buyer")),
    buyerStatus: stringValue(row.status, "ACTIVE")
  };
}

export function createSupabaseWorkspaceService(options: SupabaseWorkspaceServiceOptions): WorkspaceService {
  const createClient =
    options.createClient ??
    ((url, key) => createSupabaseClient(url, key) as unknown as SupabaseWorkspaceClient);

  function getClient(auth: AuthContext): SupabaseWorkspaceClient {
    if (!options.url) {
      throw notConfigured();
    }

    if (options.serviceRoleKey) {
      return createClient(options.url, options.serviceRoleKey);
    }

    if (options.anonKey && auth.accessToken) {
      return createSupabaseClient(options.url, options.anonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${auth.accessToken}`
          }
        }
      }) as unknown as SupabaseWorkspaceClient;
    }

    throw notConfigured();
  }

  async function getOrganizationIds(auth: AuthContext) {
    const { data, error } = await getClient(auth)
      .from("party_memberships")
      .select("organization_id")
      .eq("user_id", auth.userId)
      .eq("membership_status", "ACTIVE")
      .order("updated_at", { ascending: false });

    if (error) {
      throw queryFailed("Read organization memberships", error);
    }

    return (data ?? [])
      .map((row) => stringValue(row.organization_id))
      .filter((organizationId) => organizationId.length > 0);
  }

  async function getInvoicesByPartyIds(
    column: "buyer_id" | "supplier_id",
    auth: AuthContext,
    organizationIds: string[]
  ) {
    if (organizationIds.length === 0) {
      return [];
    }

    const { data, error } = await getClient(auth)
      .from("invoices")
      .select("*,buyer:organizations!invoices_buyer_id_fkey(legal_name),supplier:organizations!invoices_supplier_id_fkey(legal_name)")
      .in(column, organizationIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw queryFailed("Read invoices", error);
    }

    const perspective = column === "buyer_id" ? "BUYER" : "SUPPLIER";
    return (data ?? []).map((row) => mapInvoiceRow(row, perspective));
  }

  async function getInvoicesByParty(column: "buyer_id" | "supplier_id", auth: AuthContext) {
    return getInvoicesByPartyIds(column, auth, await getOrganizationIds(auth));
  }

  async function getRegisteredBuyers(auth: AuthContext): Promise<RegisteredBuyerOption[]> {
    const { data, error } = await getClient(auth)
      .from("organizations")
      .select("id,legal_name,status")
      .eq("party_type", "BUYER")
      .eq("status", "ACTIVE")
      .order("legal_name", { ascending: true });

    if (error) {
      throw queryFailed("Read registered buyers", error);
    }

    return (data ?? []).map(mapRegisteredBuyerRow).filter((buyer) => buyer.buyerId.length > 0);
  }

  return {
    async getBuyerWorkspaceState(auth) {
      const invoices = await getInvoicesByParty("buyer_id", auth);
      return {
        invoices,
        fundingRequests: [],
        liquidity: {
          availableLiquidity: 0,
          walletAddress: "",
          walletName: "VerityAPI",
          isConnected: false
        }
      };
    },

    async getSupplierWorkspaceState(auth) {
      const organizationIds = await getOrganizationIds(auth);
      const invoices = await getInvoicesByPartyIds("supplier_id", auth, organizationIds);
      const registeredBuyers = await getRegisteredBuyers(auth);
      return {
        supplierOrganizationId: organizationIds[0] ?? null,
        invoices,
        registeredBuyers,
        availableLiquidity: 0,
        escrowValue: 0,
        onChainCredit: 0,
        walletConnected: false,
        walletAddress: null
      };
    },

    async getSupplierAnalytics(auth) {
      const organizationIds = await getOrganizationIds(auth);
      const invoices = await getInvoicesByPartyIds("supplier_id", auth, organizationIds) as any[];

      const volumeMap = new Map<string, { count: number; totalAmount: number }>();
      const timeMap = new Map<string, { created: number; settled: number }>();
      const cashFlowMap = new Map<string, { expected: number; factored: number }>();

      let disputedCount = 0;

      for (const inv of invoices) {
        // Volume by Status
        const stat = volumeMap.get(inv.status) || { count: 0, totalAmount: 0 };
        stat.count += 1;
        stat.totalAmount += inv.amount;
        volumeMap.set(inv.status, stat);

        if (inv.status === "DISPUTED") disputedCount++;

        // Time trends (by YYYY-MM)
        if (inv.issueDate) {
          const month = inv.issueDate.substring(0, 7);
          const tStat = timeMap.get(month) || { created: 0, settled: 0 };
          tStat.created += inv.amount;
          if (inv.status === "SETTLED") {
            tStat.settled += inv.amount;
          }
          timeMap.set(month, tStat);
        }

        // Cash flow projections (by maturity date)
        if (inv.maturityDate && ["PENDING", "ACCEPTED", "FACTORED"].includes(inv.status)) {
          const cStat = cashFlowMap.get(inv.maturityDate) || { expected: 0, factored: 0 };
          if (inv.status === "FACTORED") {
            cStat.factored += inv.amount;
          } else {
            cStat.expected += inv.amount;
          }
          cashFlowMap.set(inv.maturityDate, cStat);
        }
      }

      const volumeByStatus = Array.from(volumeMap.entries()).map(([status, data]) => ({
        status,
        ...data
      }));

      const timeTrends = Array.from(timeMap.entries())
        .map(([period, data]) => ({ period, createdVolume: data.created, settledVolume: data.settled }))
        .sort((a, b) => a.period.localeCompare(b.period));

      const cashFlowProjections = Array.from(cashFlowMap.entries())
        .map(([date, data]) => ({ date, expectedAmount: data.expected, factoredAmount: data.factored }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const disputeRatio = invoices.length > 0 ? disputedCount / invoices.length : 0;
      // Mocking onChainCreditScore calculation for now, this normally comes from a smart contract or historical ledger.
      const onChainCreditScore = invoices.length > 0 ? Math.min(850, 600 + (invoices.filter(i => i.status === "SETTLED").length * 10)) : 0;

      return {
        volumeByStatus,
        timeTrends,
        cashFlowProjections,
        financialHealth: {
          disputeRatio,
          onChainCreditScore
        }
      };
    },

    async getInvestorWorkspaceState(auth) {
      const organizationIds = await getOrganizationIds(auth);

      if (organizationIds.length === 0) {
        return {
          invoices: [],
          settlements: [],
          ledgerRows: [],
          totalCommitted: 0,
          activeInvestments: 0,
          availableCapital: 0,
          projectedYield: 0,
          ytdEarned: 0
        };
      }

      const commitmentsResult = await getClient(auth)
        .from("funding_commitments")
        .select("*")
        .in("investor_id", organizationIds)
        .order("committed_at", { ascending: false });

      if (commitmentsResult.error) {
        throw queryFailed("Read investor commitments", commitmentsResult.error);
      }

      const ledgerResult = await getClient(auth)
        .from("settlement_ledger_entries")
        .select("*")
        .in("account_party_id", organizationIds)
        .order("occurred_at", { ascending: false });

      if (ledgerResult.error) {
        throw queryFailed("Read investor ledger", ledgerResult.error);
      }

      const committedRows = commitmentsResult.data ?? [];
      const ledgerRows = (ledgerResult.data ?? []).map(mapLedgerRow);
      const totalCommitted = committedRows.reduce(
        (total, row) => total + numberValue(row.committed_amount),
        0
      );
      const ytdEarned = (ledgerResult.data ?? [])
        .filter((row) => row.entry_type === "YIELD")
        .reduce((total, row) => total + numberValue(row.amount), 0);

      return {
        invoices: committedRows,
        settlements: (ledgerResult.data ?? []).map(mapSettlementRow),
        ledgerRows,
        totalCommitted,
        activeInvestments: totalCommitted,
        availableCapital: 0,
        projectedYield: 0,
        ytdEarned
      };
    }
  };
}

export const supabaseWorkspaceService = createSupabaseWorkspaceService({
  url: env.supabase.url,
  anonKey: env.supabase.anonKey,
  serviceRoleKey: env.supabase.serviceRoleKey
});
