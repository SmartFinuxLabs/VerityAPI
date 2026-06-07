import {
  type BodyRecord,
  badRequest,
  hashValidationError,
  invalidRelationshipMode,
  numberOrUndefined,
  requireAssetCode,
  requireIsoDate,
  requirePositiveNumber,
  requireString,
  requiredString,
  validateDueDateAfterIssue,
  walletReferenceInvalid
} from "./domain-service-utils.js";

const invoiceModes = new Set(["SUPPLIER_ISSUED", "BUYER_IMPORTED", "SELF_BILLED"]);
const recourseTypes = new Set(["WITH_RECOURSE", "LIMITED_RECOURSE", "NON_RECOURSE"]);
const decisionStates = new Set(["ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED", "DISPUTED", "HELD"]);
const settlementInstructionKinds = new Set([
  "FUND_ESCROW",
  "ADVANCE_TO_SUPPLIER",
  "BUYER_REPAYMENT",
  "INVESTOR_PAYOUT",
  "PLATFORM_FEE",
  "SUPPLIER_RESIDUAL",
  "RESERVE_RELEASE"
]);

function requireInvoiceMode(body: BodyRecord) {
  const invoiceMode = requireString(body, "invoiceMode");
  if (!invoiceModes.has(invoiceMode)) {
    throw invalidRelationshipMode(`invoiceMode must be one of ${Array.from(invoiceModes).join(", ")}.`);
  }
}

function requireDecisionState(body: BodyRecord) {
  const decisionState = requireString(body, "decisionState");
  if (!decisionStates.has(decisionState)) {
    throw badRequest("decisionState must be one of ACCEPTED, PARTIALLY_ACCEPTED, REJECTED, DISPUTED, HELD.");
  }
}

function requireRecourseType(body: BodyRecord) {
  const recourseType = requireString(body, "recourseType");
  if (!recourseTypes.has(recourseType)) {
    throw badRequest("recourseType must be one of WITH_RECOURSE, LIMITED_RECOURSE, NON_RECOURSE.");
  }
}

function requireSettlementInstructionKind(body: BodyRecord) {
  const instructionKind = requireString(body, "instructionKind");
  if (!settlementInstructionKinds.has(instructionKind)) {
    throw badRequest("instructionKind is not supported for Phase 1 settlement.");
  }
}

function requireNonNegativeNumber(body: BodyRecord, key: string) {
  const value = numberOrUndefined(body[key]);
  if (value === undefined || value < 0) {
    throw badRequest(`${key} must be a non-negative number.`);
  }
}

function requireIsoTimestamp(body: BodyRecord, key: string) {
  const value = requireString(body, key);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw badRequest(`${key} must be a valid ISO timestamp.`);
  }
}

function requireWalletReferences(body: BodyRecord) {
  for (const key of ["sourceWalletRef", "destinationWalletRef", "networkRef", "destinationRef"]) {
    if (!requiredString(body, key)) {
      throw walletReferenceInvalid(`${key} is required for settlement instructions.`);
    }
  }
}

export function validateRelationshipCreateCommand(body: BodyRecord) {
  const buyerId = requireString(body, "buyerId");
  const supplierId = requireString(body, "supplierId");
  requireInvoiceMode(body);
  if (buyerId === supplierId) {
    throw invalidRelationshipMode("buyerId and supplierId must reference different organizations.");
  }
}

export function validateRelationshipInvoiceModeCommand(body: BodyRecord) {
  requireInvoiceMode(body);
}

export function validateRelationshipRiskProfileCommand(body: BodyRecord) {
  requireRecourseType(body);
}

export function validateInvoiceCreateCommand(body: BodyRecord) {
  requireString(body, "supplierId");
  requireString(body, "buyerId");
  requireString(body, "invoiceNumber");
  const issueDate = requireIsoDate(body, "issueDate");
  const dueDate = requireIsoDate(body, "dueDate");
  validateDueDateAfterIssue(issueDate, dueDate);
  requireAssetCode(body, "currency");
  const grossAmount = requirePositiveNumber(body, "grossAmount");
  const acceptedAmount = numberOrUndefined(body.acceptedAmount);
  if (acceptedAmount !== undefined && acceptedAmount > grossAmount) {
    throw badRequest("acceptedAmount cannot exceed grossAmount.");
  }
}

export function validateInvoiceResolutionCommand(body: BodyRecord) {
  requireDecisionState(body);
  requireNonNegativeNumber(body, "acceptedAmount");
}

export function validateInvoiceHashCommand(body: BodyRecord) {
  for (const key of ["supplierEntityId", "buyerEntityId", "invoiceNumber", "invoiceCurrency", "relationshipId", "sourceSystemReference"]) {
    if (!requiredString(body, key)) {
      throw hashValidationError("HASH_MISSING_REQUIRED_INPUT", `${key} is required for invoice hash registration.`);
    }
  }

  for (const key of ["invoiceIssueDate", "dueDate"]) {
    const value = requiredString(body, key);
    if (!value) {
      throw hashValidationError("HASH_MISSING_REQUIRED_INPUT", `${key} is required for invoice hash registration.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw hashValidationError("HASH_INVALID_DATE_FORMAT", `${key} must use YYYY-MM-DD format.`);
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw hashValidationError("HASH_INVALID_DATE_FORMAT", `${key} must be a valid calendar date.`);
    }
  }

  for (const key of ["grossInvoiceAmount", "acceptedAmountAtRegistration"]) {
    if (numberOrUndefined(body[key]) === undefined) {
      throw hashValidationError("HASH_INVALID_AMOUNT_FORMAT", `${key} must be a valid amount.`);
    }
  }
}

export function validateFinanceabilityCommand(body: BodyRecord) {
  requireString(body, "riskMode");
  requireString(body, "resolutionId");
  const eligibleAmount = numberOrUndefined(body.eligibleAmount);
  if (eligibleAmount !== undefined && eligibleAmount <= 0) {
    throw badRequest("eligibleAmount must be greater than zero.");
  }
}

export function validateFundingOfferCommand(body: BodyRecord) {
  requireString(body, "financeabilityId");
  requirePositiveNumber(body, "offeredAmount");
  requireAssetCode(body, "settlementCurrency");
  requireIsoTimestamp(body, "expiresAt");
}

export function validateMarketplaceSubmissionCommand(body: BodyRecord) {
  requirePositiveNumber(body, "offeredAmount");
  requireAssetCode(body, "settlementCurrency");
  requireIsoTimestamp(body, "expiresAt");
}

export function validateFundingCommitmentCommand(body: BodyRecord) {
  requireString(body, "investorId");
  requirePositiveNumber(body, "committedAmount");
  requireString(body, "commitmentTxRef");
}

export function validateSettlementInstructionCommand(body: BodyRecord) {
  requireString(body, "fundingCommitmentId");
  requireString(body, "contractId");
  requireSettlementInstructionKind(body);
  requirePositiveNumber(body, "amount");
  requireAssetCode(body, "asset");
  requireString(body, "idempotencyKey");
  requireWalletReferences(body);
}

export function validateSettlementStatusCommand(settlementId: string) {
  if (typeof settlementId !== "string" || settlementId.trim().length === 0) {
    throw badRequest("settlementId is required.");
  }
}
