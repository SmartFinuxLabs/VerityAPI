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
  invoices: unknown[];
  availableLiquidity: number;
  escrowValue: number;
  onChainCredit: number;
  walletConnected: boolean;
  walletAddress: string | null;
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

export interface WorkspaceService {
  getBuyerWorkspaceState(auth: AuthContext): Promise<BuyerWorkspaceState>;
  getSupplierWorkspaceState(auth: AuthContext): Promise<SupplierWorkspaceState>;
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

function mapInvoiceRow(row: Record<string, unknown>) {
  return {
    id: stringValue(row.id, stringValue(row.invoice_number, "invoice")),
    invoiceNumber: stringValue(row.invoice_number),
    relationshipId: stringValue(row.relationship_id),
    supplierId: stringValue(row.supplier_id),
    buyerId: stringValue(row.buyer_id),
    amount: numberValue(row.accepted_amount, numberValue(row.gross_amount)),
    grossAmount: numberValue(row.gross_amount),
    acceptedAmount: row.accepted_amount === null ? undefined : numberValue(row.accepted_amount),
    currency: stringValue(row.currency, "USDC"),
    status: stringValue(row.state, "DRAFT"),
    issueDate: dateValue(row.issue_date),
    maturityDate: dateValue(row.due_date),
    dueDate: dateValue(row.due_date),
    hashDigest: stringValue(row.hash_digest),
    sourceSystemReference: stringValue(row.source_system_reference),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {}
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

  async function getInvoicesByParty(column: "buyer_id" | "supplier_id", auth: AuthContext) {
    const organizationIds = await getOrganizationIds(auth);

    if (organizationIds.length === 0) {
      return [];
    }

    const { data, error } = await getClient(auth)
      .from("invoices")
      .select("*")
      .in(column, organizationIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw queryFailed("Read invoices", error);
    }

    return (data ?? []).map(mapInvoiceRow);
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
      const invoices = await getInvoicesByParty("supplier_id", auth);
      return {
        invoices,
        availableLiquidity: 0,
        escrowValue: 0,
        onChainCredit: 0,
        walletConnected: false,
        walletAddress: null
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
