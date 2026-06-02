import { describe, expect, it, jest } from "@jest/globals";
import type { AuthContext } from "../../src/services/auth-token.js";
import { createSettlementService, type SettlementAdapter } from "../../src/services/settlement-service.js";

const auth: AuthContext = {
  userId: "user-1",
  participantRole: "INVESTOR",
  organizationRole: "MEMBER"
};

const pendingInstruction = {
  id: "instruction-1",
  funding_commitment_id: "commitment-1",
  contract_id: "contract-1",
  invoice_id: "invoice-1",
  instruction_kind: "FUND_ESCROW",
  amount: 25000,
  asset: "USDC",
  idempotency_key: "idem-1",
  destination_ref: "escrow-wallet",
  execution_status: "PENDING",
  provider: "ARC",
  provider_reference: null
};

function createClient({
  instructionData = pendingInstruction,
  existingInstructionData = null,
  updateData = {
    ...pendingInstruction,
    execution_status: "PROCESSING",
    provider_reference: "arc-tx-1"
  },
  statusInstructionData = {
    ...pendingInstruction,
    execution_status: "PROCESSING",
    provider_reference: "arc-tx-1"
  },
  statusUpdateData = {
    ...pendingInstruction,
    execution_status: "COMPLETED",
    provider_reference: "arc-tx-1",
    executed_at: "2026-06-02T00:00:00.000Z"
  }
}: {
  instructionData?: unknown;
  existingInstructionData?: unknown;
  updateData?: unknown;
  statusInstructionData?: unknown;
  statusUpdateData?: unknown;
} = {}) {
  const commitmentMaybeSingle = jest.fn(async () => ({
    data: {
      id: "commitment-1",
      status: "PLEDGED",
      committed_amount: 25000,
      funding_offer_id: "offer-1"
    },
    error: null
  }));
  const commitmentEq = jest.fn(() => ({ maybeSingle: commitmentMaybeSingle }));
  const commitmentSelect = jest.fn(() => ({ eq: commitmentEq }));

  const contractMaybeSingle = jest.fn(async () => ({
    data: {
      id: "contract-1",
      invoice_id: "invoice-1",
      contract_status: "ACTIVE"
    },
    error: null
  }));
  const contractEq = jest.fn(() => ({ maybeSingle: contractMaybeSingle }));
  const contractSelect = jest.fn(() => ({ eq: contractEq }));

  const idempotencyMaybeSingle = jest.fn(async () => ({ data: existingInstructionData, error: null }));
  const idempotencyEq = jest.fn(() => ({ maybeSingle: idempotencyMaybeSingle }));

  const statusMaybeSingle = jest.fn(async () => ({ data: statusInstructionData, error: null }));
  const settlementEq = jest.fn((key: string) => (key === "id" ? { maybeSingle: statusMaybeSingle } : { maybeSingle: idempotencyMaybeSingle }));
  const settlementSelect = jest.fn(() => ({ eq: settlementEq }));

  const insertMaybeSingle = jest.fn(async () => ({ data: instructionData, error: null }));
  const insertSelect = jest.fn(() => ({ maybeSingle: insertMaybeSingle }));
  const instructionInsert = jest.fn(() => ({ select: insertSelect }));

  const updateMaybeSingle = jest.fn(async () => ({ data: updateData, error: null }));
  const updateSelect = jest.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateEq = jest.fn(() => ({ select: updateSelect }));
  const instructionUpdate = jest.fn(() => ({ eq: updateEq }));

  const statusUpdateMaybeSingle = jest.fn(async () => ({ data: statusUpdateData, error: null }));
  const statusUpdateSelect = jest.fn(() => ({ maybeSingle: statusUpdateMaybeSingle }));
  const statusUpdateEq = jest.fn(() => ({ select: statusUpdateSelect }));
  const statusUpdate = jest.fn(() => ({ eq: statusUpdateEq }));

  const from = jest.fn((table: string) => {
    if (table === "funding_commitments") return { select: commitmentSelect };
    if (table === "funding_contracts") return { select: contractSelect };
    if (table === "settlement_instructions") {
      return {
        select: settlementSelect,
        insert: instructionInsert,
        update: (values: unknown) => {
          return values && typeof values === "object" && "provider_reference" in values
            ? instructionUpdate(values)
            : statusUpdate(values);
        }
      };
    }
    return {};
  });

  return {
    client: { rpc: jest.fn(), from },
    instructionUpdate,
    statusUpdate,
    settlementEq
  };
}

function createService(client: ReturnType<typeof createClient>["client"], adapter: SettlementAdapter) {
  return createSettlementService(() => client, { adapter });
}

describe("settlement adapter and reconciliation", () => {
  const validPayload = {
    fundingCommitmentId: "commitment-1",
    contractId: "contract-1",
    instructionKind: "FUND_ESCROW",
    amount: 25000,
    asset: "USDC",
    sourceWalletRef: "wallet-source",
    destinationWalletRef: "wallet-destination",
    networkRef: "arc-testnet",
    destinationRef: "escrow-wallet",
    idempotencyKey: "idem-1"
  };

  it("submits newly created instructions through the settlement adapter and stores provider reference", async () => {
    const adapter: SettlementAdapter = {
      submitInstruction: jest.fn(async () => ({
        providerReference: "arc-tx-1",
        executionStatus: "PROCESSING",
        rawPayload: { network: "arc-testnet" }
      })),
      getInstructionStatus: jest.fn()
    };
    const { client, instructionUpdate } = createClient();
    const service = createService(client, adapter);

    await expect(service.createSettlementInstruction(auth, validPayload)).resolves.toMatchObject({
      id: "instruction-1",
      execution_status: "PROCESSING",
      provider_reference: "arc-tx-1"
    });

    expect(adapter.submitInstruction).toHaveBeenCalledWith({
      instructionId: "instruction-1",
      idempotencyKey: "idem-1",
      asset: "USDC",
      amount: 25000,
      sourceWalletRef: "wallet-source",
      destinationWalletRef: "wallet-destination",
      destinationRef: "escrow-wallet",
      networkRef: "arc-testnet"
    });
    expect(instructionUpdate).toHaveBeenCalledWith({
      provider_reference: "arc-tx-1",
      execution_status: "PROCESSING"
    });
  });

  it("reconciles completed provider status into settlement instruction status", async () => {
    const adapter: SettlementAdapter = {
      submitInstruction: jest.fn(),
      getInstructionStatus: jest.fn(async () => ({
        providerReference: "arc-tx-1",
        executionStatus: "COMPLETED",
        settledAmount: 25000,
        txHashOrReference: "0xabc",
        settledAt: "2026-06-02T00:00:00.000Z",
        rawPayload: { status: "completed" }
      }))
    };
    const { client, statusUpdate, settlementEq } = createClient();
    const service = createService(client, adapter);

    await expect(service.getSettlementStatus(auth, "instruction-1")).resolves.toEqual({
      instruction: {
        ...pendingInstruction,
        execution_status: "COMPLETED",
        provider_reference: "arc-tx-1",
        executed_at: "2026-06-02T00:00:00.000Z"
      },
      providerReference: "arc-tx-1",
      settledAmount: 25000,
      txHashOrReference: "0xabc",
      settledAt: "2026-06-02T00:00:00.000Z",
      reasonCode: null,
      reconciliationSummary: {
        provider: "ARC",
        providerStatus: "COMPLETED",
        status: "MATCHED"
      }
    });

    expect(settlementEq).toHaveBeenCalledWith("id", "instruction-1");
    expect(adapter.getInstructionStatus).toHaveBeenCalledWith({
      instructionId: "instruction-1",
      providerReference: "arc-tx-1"
    });
    expect(statusUpdate).toHaveBeenCalledWith({
      execution_status: "COMPLETED",
      executed_at: "2026-06-02T00:00:00.000Z",
      failure_code: null,
      failure_message: null
    });
  });

  it("returns reconciliation pending for unknown provider statuses", async () => {
    const adapter: SettlementAdapter = {
      submitInstruction: jest.fn(),
      getInstructionStatus: jest.fn(async () => ({
        providerReference: "arc-tx-1",
        executionStatus: "UNKNOWN_STATUS",
        reasonCode: "UNKNOWN_STATUS"
      }))
    };
    const { client } = createClient({
      statusUpdateData: {
        ...pendingInstruction,
        execution_status: "PROCESSING",
        provider_reference: "arc-tx-1",
        failure_code: "UNKNOWN_STATUS"
      }
    });
    const service = createService(client, adapter);

    await expect(service.getSettlementStatus(auth, "instruction-1")).resolves.toMatchObject({
      instruction: {
        execution_status: "PROCESSING",
        failure_code: "UNKNOWN_STATUS"
      },
      providerReference: "arc-tx-1",
      reasonCode: "UNKNOWN_STATUS",
      reconciliationSummary: {
        provider: "ARC",
        providerStatus: "UNKNOWN_STATUS",
        status: "RECONCILIATION_PENDING"
      }
    });
  });

  it("maps failed provider statuses onto failed settlement instructions", async () => {
    const adapter: SettlementAdapter = {
      submitInstruction: jest.fn(),
      getInstructionStatus: jest.fn(async () => ({
        providerReference: "arc-tx-1",
        executionStatus: "FAILED",
        reasonCode: "PMODE_SETTLEMENT_FAILED",
        failureMessage: "Provider rejected settlement instruction."
      }))
    };
    const { client, statusUpdate } = createClient({
      statusUpdateData: {
        ...pendingInstruction,
        execution_status: "FAILED",
        provider_reference: "arc-tx-1",
        failure_code: "PMODE_SETTLEMENT_FAILED",
        failure_message: "Provider rejected settlement instruction."
      }
    });
    const service = createService(client, adapter);

    await expect(service.getSettlementStatus(auth, "instruction-1")).resolves.toMatchObject({
      instruction: {
        execution_status: "FAILED",
        failure_code: "PMODE_SETTLEMENT_FAILED",
        failure_message: "Provider rejected settlement instruction."
      },
      providerReference: "arc-tx-1",
      reasonCode: "PMODE_SETTLEMENT_FAILED",
      reconciliationSummary: {
        provider: "ARC",
        providerStatus: "FAILED",
        status: "FAILED"
      }
    });
    expect(statusUpdate).toHaveBeenCalledWith({
      execution_status: "FAILED",
      executed_at: null,
      failure_code: "PMODE_SETTLEMENT_FAILED",
      failure_message: "Provider rejected settlement instruction."
    });
  });

  it("maps provider timeouts to a 503 error", async () => {
    const adapter: SettlementAdapter = {
      submitInstruction: jest.fn(),
      getInstructionStatus: jest.fn(async () => ({
        providerReference: "arc-tx-1",
        executionStatus: "PROVIDER_TIMEOUT",
        reasonCode: "PROVIDER_TIMEOUT"
      }))
    };
    const { client } = createClient();
    const service = createService(client, adapter);

    await expect(service.getSettlementStatus(auth, "instruction-1")).rejects.toMatchObject({
      statusCode: 503,
      code: "provider_timeout",
      reasonCode: "PROVIDER_TIMEOUT"
    });
  });
});
