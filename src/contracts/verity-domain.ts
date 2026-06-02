export const partyTypes = ["SUPPLIER", "BUYER", "INVESTOR", "OPERATOR"] as const;
export const organizationRoles = ["SUPER_USER", "MEMBER", "VIEWER"] as const;
export const recordStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED", "DELETED"] as const;
export const relationshipStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED", "TERMINATED"] as const;
export const invoiceModes = ["SUPPLIER_ISSUED", "BUYER_IMPORTED", "SELF_BILLED"] as const;
export const invoiceStates = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "ACCEPTED",
  "PARTIALLY_ACCEPTED",
  "DISPUTED",
  "HELD",
  "REJECTED",
  "CANCELLED",
  "FACTORING_REQUESTED",
  "FACTORED",
  "SETTLED"
] as const;
export const decisionStates = ["ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED", "DISPUTED", "HELD"] as const;
export const financeabilityStatuses = [
  "NOT_ELIGIBLE",
  "ELIGIBLE",
  "LISTED_FOR_FUNDING",
  "FUNDED",
  "SETTLEMENT_PENDING",
  "SETTLED",
  "DEFAULT_FLAGGED",
  "CLOSED"
] as const;
export const riskModes = ["LOW", "MEDIUM", "HIGH"] as const;
export const offerStatuses = ["OPEN", "PARTIALLY_FILLED", "FILLED", "EXPIRED", "CANCELLED"] as const;
export const commitmentStatuses = ["PLEDGED", "CONFIRMED", "CANCELLED", "FAILED"] as const;
export const assetCodes = ["USDC"] as const;
export const settlementInstructionKinds = [
  "FUND_ESCROW",
  "ADVANCE_TO_SUPPLIER",
  "BUYER_REPAYMENT",
  "INVESTOR_PAYOUT",
  "PLATFORM_FEE",
  "SUPPLIER_RESIDUAL",
  "RESERVE_RELEASE"
] as const;
export const settlementStatuses = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export const invitationTypes = ["ORG_USER", "SUPPLIER_ORG"] as const;
export const invitationStatuses = ["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"] as const;

export const reasonCodes = [
  "ERR_MISSING_REQUIRED_FIELDS",
  "ERR_INVALID_RELATIONSHIP_MODE",
  "ERR_NOT_FINANCEABLE_STATE",
  "ERR_DUPLICATE_HASH_REGISTERED",
  "ERR_INCOMPLETE_RISK_PROFILE",
  "ERR_INVALID_SETTLEMENT_CONFIGURATION",
  "ERR_UNAUTHORIZED",
  "ERR_FORBIDDEN",
  "ERR_NOT_FOUND",
  "ERR_CONFLICT",
  "ERR_INTERNAL_SERVER_ERROR",
  "ERR_NOT_IMPLEMENTED",
  "HASH_MISSING_REQUIRED_INPUT",
  "HASH_INVALID_DATE_FORMAT",
  "HASH_INVALID_AMOUNT_FORMAT",
  "HASH_DUPLICATE_DETECTED",
  "PMODE_NOT_CONFIGURED",
  "PMODE_ASSET_MISMATCH",
  "PMODE_INVALID_WALLET_REFERENCE",
  "PMODE_SETTLEMENT_FAILED",
  "AUTH_FAILURE",
  "INVALID_WALLET",
  "INSUFFICIENT_BALANCE",
  "NETWORK_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "UNKNOWN_STATUS"
] as const;

export type ReasonCode = (typeof reasonCodes)[number];
