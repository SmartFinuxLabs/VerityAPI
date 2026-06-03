import { ApiError } from "../errors/api-error.js";
import type { AuthContext } from "./auth-token.js";

export type BodyRecord = Record<string, unknown>;

export interface SupabaseError {
  message?: string;
}

export type SupabaseResult<T = unknown> = {
  data?: T | null;
  error?: SupabaseError | null;
};

export type SupabaseDomainClient = {
  rpc(functionName: string, params?: BodyRecord): Promise<SupabaseResult>;
  from(table: string): any;
};

export type SupabaseDomainClientProvider = (auth?: AuthContext) => SupabaseDomainClient;

export function operationFailed(operation: string, error?: SupabaseError | null): ApiError {
  return new ApiError({
    statusCode: 500,
    code: "domain_operation_failed",
    message: `${operation} failed.`,
    reasonCode: "ERR_INTERNAL_SERVER_ERROR",
    details: error?.message
  });
}

export function badRequest(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "bad_request",
    message,
    reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
  });
}

export function invalidRelationshipMode(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "invalid_relationship_mode",
    message,
    reasonCode: "ERR_INVALID_RELATIONSHIP_MODE"
  });
}

export function notFound(message: string): ApiError {
  return new ApiError({
    statusCode: 404,
    code: "not_found",
    message,
    reasonCode: "ERR_NOT_FOUND"
  });
}

export function conflict(message: string, details?: unknown): ApiError {
  return new ApiError({
    statusCode: 409,
    code: "invalid_invoice_state",
    message,
    reasonCode: "ERR_CONFLICT",
    details
  });
}

export function hashValidationError(reasonCode: "HASH_MISSING_REQUIRED_INPUT" | "HASH_INVALID_DATE_FORMAT" | "HASH_INVALID_AMOUNT_FORMAT", message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "hash_validation_failed",
    message,
    reasonCode
  });
}

export function duplicateHashDetected(message: string, details?: unknown): ApiError {
  return new ApiError({
    statusCode: 409,
    code: "duplicate_hash_detected",
    message,
    reasonCode: "HASH_DUPLICATE_DETECTED",
    details
  });
}

export function duplicateHashRegistered(message: string): ApiError {
  return new ApiError({
    statusCode: 409,
    code: "duplicate_hash_registered",
    message,
    reasonCode: "ERR_DUPLICATE_HASH_REGISTERED"
  });
}

export function notFinanceableState(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "not_financeable_state",
    message,
    reasonCode: "ERR_NOT_FINANCEABLE_STATE"
  });
}

export function incompleteRiskProfile(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "incomplete_risk_profile",
    message,
    reasonCode: "ERR_INCOMPLETE_RISK_PROFILE"
  });
}

export function forbidden(message: string): ApiError {
  return new ApiError({
    statusCode: 403,
    code: "forbidden",
    message,
    reasonCode: "ERR_FORBIDDEN"
  });
}

export function duplicateCommitment(message: string): ApiError {
  return new ApiError({
    statusCode: 409,
    code: "duplicate_commitment",
    message,
    reasonCode: "ERR_CONFLICT"
  });
}

export function invalidSettlementConfiguration(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "invalid_settlement_configuration",
    message,
    reasonCode: "ERR_INVALID_SETTLEMENT_CONFIGURATION"
  });
}

export function walletReferenceInvalid(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: "bad_request",
    message,
    reasonCode: "PMODE_INVALID_WALLET_REFERENCE"
  });
}

export function idempotencyConflict(message: string): ApiError {
  return new ApiError({
    statusCode: 409,
    code: "idempotency_conflict",
    message,
    reasonCode: "ERR_CONFLICT"
  });
}

export function providerTimeout(message: string): ApiError {
  return new ApiError({
    statusCode: 503,
    code: "provider_timeout",
    message,
    reasonCode: "PROVIDER_TIMEOUT"
  });
}

export function requiredString(body: BodyRecord, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function requireString(body: BodyRecord, key: string): string {
  const value = requiredString(body, key);
  if (!value) {
    throw badRequest(`${key} is required.`);
  }

  return value;
}

export function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function requirePositiveNumber(body: BodyRecord, key: string): number {
  const value = numberOrUndefined(body[key]);
  if (value === undefined || value <= 0) {
    throw badRequest(`${key} must be a positive number.`);
  }

  return value;
}

export function optionalNonNegativeNumber(body: BodyRecord, key: string): number | undefined {
  const value = numberOrUndefined(body[key]);
  if (value === undefined) {
    return undefined;
  }

  if (value < 0) {
    throw badRequest(`${key} cannot be negative.`);
  }

  return value;
}

export function requireIsoDate(body: BodyRecord, key: string): string {
  const value = requireString(body, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${key} must use YYYY-MM-DD format.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw badRequest(`${key} must be a valid calendar date.`);
  }

  return value;
}

export function validateDueDateAfterIssue(issueDate: string, dueDate: string) {
  if (new Date(`${dueDate}T00:00:00.000Z`).getTime() <= new Date(`${issueDate}T00:00:00.000Z`).getTime()) {
    throw badRequest("dueDate must be after issueDate.");
  }
}

export function requireAssetCode(body: BodyRecord, key: string, fallback = "USDC"): string {
  const value = requiredString(body, key) ?? fallback;
  if (value !== "USDC") {
    throw badRequest(`${key} must be USDC for Phase 1.`);
  }

  return value;
}

export function insertRow(client: SupabaseDomainClient, table: string, values: BodyRecord) {
  return client.from(table).insert(values).select("*").maybeSingle();
}

export function upsertRow(client: SupabaseDomainClient, table: string, values: BodyRecord, onConflict: string) {
  return client.from(table).upsert(values, { onConflict }).select("*").maybeSingle();
}

export function updateRow(client: SupabaseDomainClient, table: string, id: string, values: BodyRecord) {
  return client.from(table).update(values).eq("id", id).select("*").maybeSingle();
}

export async function unwrap<T>(operation: string, result: Promise<SupabaseResult<T>>) {
  const { data, error } = await result;
  if (error) {
    throw operationFailed(operation, error);
  }
  return data ?? {};
}
