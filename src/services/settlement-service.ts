import type { AuthContext } from "./auth-token.js";
import { emitAuditEvent } from "./audit-service.js";
import {
  type BodyRecord,
  type SupabaseDomainClientProvider,
  badRequest,
  idempotencyConflict,
  insertRow,
  invalidSettlementConfiguration,
  notFound,
  numberOrUndefined,
  operationFailed,
  providerTimeout,
  requireAssetCode,
  requirePositiveNumber,
  requireString,
  requiredString,
  unwrap,
  updateRow,
  walletReferenceInvalid
} from "./domain-service-utils.js";
import { validateSettlementInstructionCommand, validateSettlementStatusCommand } from "./domain-validation-layer.js";

export interface SettlementService {
  createSettlementInstruction(auth: AuthContext, body: BodyRecord): Promise<unknown>;
  getSettlementStatus(auth: AuthContext, settlementId: string): Promise<unknown>;
}

export type AdapterExecutionStatus =
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "UNKNOWN_STATUS"
  | "PROVIDER_TIMEOUT";

export interface SettlementAdapterSubmission {
  instructionId: string;
  idempotencyKey: string;
  asset: string;
  amount: number;
  sourceWalletRef: string;
  destinationWalletRef: string;
  destinationRef: string;
  networkRef: string;
}

export interface SettlementAdapterStatusRequest {
  instructionId: string;
  providerReference: string;
}

export interface SettlementAdapterResult {
  providerReference: string;
  executionStatus: AdapterExecutionStatus;
  settledAmount?: number;
  txHashOrReference?: string;
  settledAt?: string;
  reasonCode?: string;
  failureMessage?: string;
  rawPayload?: unknown;
}

export interface SettlementAdapter {
  submitInstruction(instruction: SettlementAdapterSubmission): Promise<SettlementAdapterResult>;
  getInstructionStatus(request: SettlementAdapterStatusRequest): Promise<SettlementAdapterResult>;
}

interface SettlementServiceOptions {
  adapter?: SettlementAdapter;
  auditEvents?: boolean;
}

const instructionKinds = new Set([
  "FUND_ESCROW",
  "ADVANCE_TO_SUPPLIER",
  "BUYER_REPAYMENT",
  "INVESTOR_PAYOUT",
  "PLATFORM_FEE",
  "SUPPLIER_RESIDUAL",
  "RESERVE_RELEASE"
]);

const activeCommitmentStatuses = new Set(["PLEDGED", "CONFIRMED"]);
const activeContractStatuses = new Set(["ACTIVE"]);
const finalSettlementStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function readStringField(record: BodyRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readPositiveRecordAmount(record: BodyRecord, key: string, message: string): number {
  const value = numberOrUndefined(record[key]);
  if (value === undefined || value <= 0) {
    throw operationFailed("Read settlement state", { message });
  }
  return value;
}

function requireInstructionKind(body: BodyRecord): string {
  const instructionKind = requireString(body, "instructionKind");
  if (!instructionKinds.has(instructionKind)) {
    throw badRequest("instructionKind is not supported for Phase 1 settlement.");
  }
  return instructionKind;
}

function requireWalletReferences(body: BodyRecord) {
  for (const key of ["sourceWalletRef", "destinationWalletRef", "networkRef", "destinationRef"]) {
    if (!requiredString(body, key)) {
      throw walletReferenceInvalid(`${key} is required for settlement instructions.`);
    }
  }
}

function isSameInstruction(existing: BodyRecord, expected: BodyRecord): boolean {
  return (
    existing.funding_commitment_id === expected.funding_commitment_id &&
    existing.contract_id === expected.contract_id &&
    numberOrUndefined(existing.amount) === expected.amount &&
    existing.asset === expected.asset
  );
}

function adapterStatusToInstructionStatus(status: AdapterExecutionStatus): "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" {
  if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
    return status;
  }
  return "PROCESSING";
}

function summarizeReconciliation(provider: string, result: SettlementAdapterResult) {
  return {
    provider,
    providerStatus: result.executionStatus,
    status:
      result.executionStatus === "UNKNOWN_STATUS"
        ? "RECONCILIATION_PENDING"
        : result.executionStatus === "COMPLETED"
          ? "MATCHED"
          : result.executionStatus
  };
}

function statusResponse(instruction: BodyRecord, result?: SettlementAdapterResult) {
  if (!result) {
    return {
      instruction,
      providerReference: readStringField(instruction, "provider_reference") ?? null,
      settledAmount: numberOrUndefined(instruction.amount),
      txHashOrReference: null,
      settledAt: readStringField(instruction, "executed_at") ?? null,
      reasonCode: readStringField(instruction, "failure_code") ?? null,
      reconciliationSummary: {
        provider: readStringField(instruction, "provider") ?? "ARC",
        providerStatus: readStringField(instruction, "execution_status") ?? "PENDING",
        status: finalSettlementStatuses.has(readStringField(instruction, "execution_status") ?? "")
          ? "MATCHED"
          : "NOT_SUBMITTED"
      }
    };
  }

  return {
    instruction,
    providerReference: result.providerReference,
    settledAmount: result.settledAmount,
    txHashOrReference: result.txHashOrReference,
    settledAt: result.settledAt,
    reasonCode: result.reasonCode ?? null,
    reconciliationSummary: summarizeReconciliation(readStringField(instruction, "provider") ?? "ARC", result)
  };
}

export function createArcSettlementAdapter(): SettlementAdapter {
  return {
    async submitInstruction(instruction) {
      return {
        providerReference: `arc-${instruction.instructionId}`,
        executionStatus: "PROCESSING",
        rawPayload: {
          networkRef: instruction.networkRef,
          destinationRef: instruction.destinationRef
        }
      };
    },

    async getInstructionStatus(request) {
      return {
        providerReference: request.providerReference,
        executionStatus: "UNKNOWN_STATUS",
        reasonCode: "UNKNOWN_STATUS"
      };
    }
  };
}

export function createSettlementService(
  getClient: SupabaseDomainClientProvider,
  options: SettlementServiceOptions = {}
): SettlementService {
  return {
    async createSettlementInstruction(auth, body) {
      validateSettlementInstructionCommand(body);
      const fundingCommitmentId = requireString(body, "fundingCommitmentId");
      const contractId = requireString(body, "contractId");
      const instructionKind = requireInstructionKind(body);
      const amount = requirePositiveNumber(body, "amount");
      const asset = requireAssetCode(body, "asset");
      const idempotencyKey = requireString(body, "idempotencyKey");
      const destinationRef = requireString(body, "destinationRef");
      requireWalletReferences(body);

      const client = getClient();

      const commitmentResult = await client
        .from("funding_commitments")
        .select("id,status,committed_amount,funding_offer_id")
        .eq("id", fundingCommitmentId)
        .maybeSingle();

      if (commitmentResult.error) {
        throw operationFailed("Read funding commitment", commitmentResult.error);
      }

      if (!commitmentResult.data || typeof commitmentResult.data !== "object") {
        throw notFound("Funding commitment was not found.");
      }

      const commitment = commitmentResult.data as BodyRecord;
      const commitmentStatus = readStringField(commitment, "status");
      if (!commitmentStatus || !activeCommitmentStatuses.has(commitmentStatus)) {
        throw invalidSettlementConfiguration("Settlement instructions require an active funding commitment.");
      }

      const committedAmount = readPositiveRecordAmount(
        commitment,
        "committed_amount",
        "Funding commitment committed_amount is invalid."
      );
      if (amount > committedAmount) {
        throw invalidSettlementConfiguration("Settlement instruction amount cannot exceed committed amount.");
      }

      const contractResult = await client
        .from("funding_contracts")
        .select("id,invoice_id,contract_status")
        .eq("id", contractId)
        .maybeSingle();

      if (contractResult.error) {
        throw operationFailed("Read funding contract", contractResult.error);
      }

      if (!contractResult.data || typeof contractResult.data !== "object") {
        throw notFound("Funding contract was not found.");
      }

      const contract = contractResult.data as BodyRecord;
      const contractStatus = readStringField(contract, "contract_status");
      if (!contractStatus || !activeContractStatuses.has(contractStatus)) {
        throw invalidSettlementConfiguration("Settlement instructions require an active funding contract.");
      }

      const existingResult = await client
        .from("settlement_instructions")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingResult.error) {
        throw operationFailed("Check settlement idempotency", existingResult.error);
      }

      const instructionValues = {
        funding_commitment_id: fundingCommitmentId,
        contract_id: contractId,
        invoice_id: requireString(contract, "invoice_id"),
        instruction_kind: instructionKind,
        amount,
        asset,
        priority: numberOrUndefined(body.priority) ?? 100,
        idempotency_key: idempotencyKey,
        destination_ref: destinationRef,
        provider: requiredString(body, "provider") ?? "ARC",
        provider_reference: null,
        execution_status: "PENDING",
        requested_by: auth.userId
      };

      if (existingResult.data && typeof existingResult.data === "object") {
        const existingInstruction = existingResult.data as BodyRecord;
        if (isSameInstruction(existingInstruction, instructionValues)) {
          return existingInstruction;
        }
        throw idempotencyConflict("Idempotency-Key was already used for a different settlement instruction.");
      }

      const instruction = await unwrap<BodyRecord>(
        "Create settlement instruction",
        insertRow(client, "settlement_instructions", instructionValues)
      );
      const instructionId = requireString(instruction, "id");

      if (options.auditEvents) {
        await emitAuditEvent(client, auth, {
          aggregateType: "SETTLEMENT_INSTRUCTION",
          aggregateId: instructionId,
          eventType: "SETTLEMENT_INSTRUCTION_CREATED",
          payload: {
            fundingCommitmentId,
            contractId,
            invoiceId: instructionValues.invoice_id,
            instructionKind,
            amount,
            asset,
            executionStatus: "PENDING"
          }
        });
      }

      if (!options.adapter) {
        return instruction;
      }

      const submissionResult = await options.adapter.submitInstruction({
        instructionId,
        idempotencyKey,
        asset,
        amount,
        sourceWalletRef: requireString(body, "sourceWalletRef"),
        destinationWalletRef: requireString(body, "destinationWalletRef"),
        destinationRef,
        networkRef: requireString(body, "networkRef")
      });

      if (submissionResult.executionStatus === "PROVIDER_TIMEOUT") {
        throw providerTimeout("Settlement provider timed out while submitting instruction.");
      }

      return unwrap(
        "Update settlement provider submission",
        updateRow(client, "settlement_instructions", instructionId, {
          provider_reference: submissionResult.providerReference,
          execution_status: adapterStatusToInstructionStatus(submissionResult.executionStatus)
        })
      ).then(async (updatedInstruction) => {
        if (options.auditEvents) {
          await emitAuditEvent(client, auth, {
            aggregateType: "SETTLEMENT_INSTRUCTION",
            aggregateId: instructionId,
            eventType: "SETTLEMENT_PROVIDER_SUBMITTED",
            reasonCode: submissionResult.reasonCode ?? null,
            payload: {
              providerReference: submissionResult.providerReference,
              executionStatus: submissionResult.executionStatus
            }
          });
        }

        return updatedInstruction;
      });
    },

    async getSettlementStatus(_auth, settlementId) {
      validateSettlementStatusCommand(settlementId);
      const instruction = await unwrap<BodyRecord>(
        "Read settlement status",
        getClient()
          .from("settlement_instructions")
          .select("*")
          .eq("id", settlementId)
          .maybeSingle()
      );

      const providerReference = readStringField(instruction, "provider_reference");
      const executionStatus = readStringField(instruction, "execution_status");
      if (!options.adapter || !providerReference || (executionStatus && finalSettlementStatuses.has(executionStatus))) {
        return statusResponse(instruction);
      }

      const result = await options.adapter.getInstructionStatus({
        instructionId: settlementId,
        providerReference
      });

      if (result.executionStatus === "PROVIDER_TIMEOUT") {
        throw providerTimeout("Settlement provider timed out while reconciling instruction.");
      }

      const reconciledStatus = adapterStatusToInstructionStatus(result.executionStatus);
      const updatedInstruction = await unwrap<BodyRecord>(
        "Update settlement reconciliation status",
        updateRow(getClient(), "settlement_instructions", settlementId, {
          execution_status: reconciledStatus,
          executed_at: result.executionStatus === "COMPLETED" ? result.settledAt : null,
          failure_code: result.reasonCode ?? null,
          failure_message: result.failureMessage ?? null
        })
      );

      if (options.auditEvents) {
        await emitAuditEvent(getClient(), _auth, {
          aggregateType: "SETTLEMENT_INSTRUCTION",
          aggregateId: settlementId,
          eventType: "SETTLEMENT_RECONCILED",
          reasonCode: result.reasonCode ?? null,
          payload: {
            providerReference,
            executionStatus: result.executionStatus,
            reconciledStatus
          }
        });
      }

      return statusResponse(updatedInstruction, result);
    }
  };
}
