import { describe, expect, it, jest } from "@jest/globals";
import type { AuthContext } from "../../src/services/auth-token.js";
import { createSettlementService } from "../../src/services/settlement-service.js";

const auth: AuthContext = {
  userId: "user-1",
  participantRole: "INVESTOR",
  organizationRole: "MEMBER"
};

function createSettlementClient({
  commitmentData = {
    id: "commitment-1",
    status: "PLEDGED",
    committed_amount: 25000,
    funding_offer_id: "offer-1"
  },
  contractData = {
    id: "contract-1",
    invoice_id: "invoice-1",
    contract_status: "ACTIVE"
  },
  existingInstructionData = null,
  instructionData = {
    id: "instruction-1",
    execution_status: "PENDING",
    asset: "USDC",
    idempotency_key: "idem-1",
    provider: "ARC",
    provider_reference: null
  }
}: {
  commitmentData?: unknown;
  contractData?: unknown;
  existingInstructionData?: unknown;
  instructionData?: unknown;
} = {}) {
  const commitmentMaybeSingle = jest.fn(async () => ({ data: commitmentData, error: null }));
  const commitmentEq = jest.fn(() => ({ maybeSingle: commitmentMaybeSingle }));
  const commitmentSelect = jest.fn(() => ({ eq: commitmentEq }));

  const contractMaybeSingle = jest.fn(async () => ({ data: contractData, error: null }));
  const contractEq = jest.fn(() => ({ maybeSingle: contractMaybeSingle }));
  const contractSelect = jest.fn(() => ({ eq: contractEq }));

  const existingMaybeSingle = jest.fn(async () => ({ data: existingInstructionData, error: null }));
  const existingEq = jest.fn(() => ({ maybeSingle: existingMaybeSingle }));
  const existingSelect = jest.fn(() => ({ eq: existingEq }));

  const instructionMaybeSingle = jest.fn(async () => ({ data: instructionData, error: null }));
  const instructionSelect = jest.fn(() => ({ maybeSingle: instructionMaybeSingle }));
  const instructionInsert = jest.fn(() => ({ select: instructionSelect }));

  const from = jest.fn((table: string) => {
    if (table === "funding_commitments") {
      return { select: commitmentSelect };
    }
    if (table === "funding_contracts") {
      return { select: contractSelect };
    }
    if (table === "settlement_instructions") {
      return {
        select: existingSelect,
        insert: instructionInsert
      };
    }
    return {};
  });
  const client = { rpc: jest.fn(), from };

  return {
    client,
    commitmentEq,
    contractEq,
    existingEq,
    instructionInsert
  };
}

function createService(client: ReturnType<typeof createSettlementClient>["client"]) {
  return createSettlementService(() => client);
}

describe("settlement service", () => {
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

  it("creates USDC-first settlement instructions for valid commitments", async () => {
    const { client, commitmentEq, contractEq, existingEq, instructionInsert } = createSettlementClient();
    const service = createService(client);

    await expect(service.createSettlementInstruction(auth, validPayload)).resolves.toEqual({
      id: "instruction-1",
      execution_status: "PENDING",
      asset: "USDC",
      idempotency_key: "idem-1",
      provider: "ARC",
      provider_reference: null
    });

    expect(commitmentEq).toHaveBeenCalledWith("id", "commitment-1");
    expect(contractEq).toHaveBeenCalledWith("id", "contract-1");
    expect(existingEq).toHaveBeenCalledWith("idempotency_key", "idem-1");
    expect(instructionInsert).toHaveBeenCalledWith({
      funding_commitment_id: "commitment-1",
      contract_id: "contract-1",
      invoice_id: "invoice-1",
      instruction_kind: "FUND_ESCROW",
      amount: 25000,
      asset: "USDC",
      priority: 100,
      idempotency_key: "idem-1",
      destination_ref: "escrow-wallet",
      provider: "ARC",
      provider_reference: null,
      execution_status: "PENDING",
      requested_by: "user-1"
    });
  });

  it("rejects non-USDC settlement instructions", async () => {
    const { client, instructionInsert } = createSettlementClient();
    const service = createService(client);

    await expect(
      service.createSettlementInstruction(auth, {
        ...validPayload,
        asset: "USD"
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "bad_request",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
    });
    expect(instructionInsert).not.toHaveBeenCalled();
  });

  it("rejects missing wallet references before provider submission", async () => {
    const { client, instructionInsert } = createSettlementClient();
    const service = createService(client);

    await expect(
      service.createSettlementInstruction(auth, {
        ...validPayload,
        destinationWalletRef: ""
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "bad_request",
      reasonCode: "PMODE_INVALID_WALLET_REFERENCE"
    });
    expect(instructionInsert).not.toHaveBeenCalled();
  });

  it("returns existing settlement instruction for idempotent retries", async () => {
    const { client, instructionInsert } = createSettlementClient({
      existingInstructionData: {
        id: "instruction-existing",
        funding_commitment_id: "commitment-1",
        contract_id: "contract-1",
        amount: 25000,
        asset: "USDC",
        idempotency_key: "idem-1",
        execution_status: "PENDING"
      }
    });
    const service = createService(client);

    await expect(service.createSettlementInstruction(auth, validPayload)).resolves.toEqual({
      id: "instruction-existing",
      funding_commitment_id: "commitment-1",
      contract_id: "contract-1",
      amount: 25000,
      asset: "USDC",
      idempotency_key: "idem-1",
      execution_status: "PENDING"
    });
    expect(instructionInsert).not.toHaveBeenCalled();
  });

  it("rejects idempotency conflicts when the key is reused for different instruction data", async () => {
    const { client, instructionInsert } = createSettlementClient({
      existingInstructionData: {
        id: "instruction-existing",
        funding_commitment_id: "commitment-1",
        contract_id: "contract-1",
        amount: 100,
        asset: "USDC",
        idempotency_key: "idem-1",
        execution_status: "PENDING"
      }
    });
    const service = createService(client);

    await expect(service.createSettlementInstruction(auth, validPayload)).rejects.toMatchObject({
      statusCode: 409,
      code: "idempotency_conflict",
      reasonCode: "ERR_CONFLICT"
    });
    expect(instructionInsert).not.toHaveBeenCalled();
  });

  it("rejects settlement instructions for inactive commitments", async () => {
    const { client, instructionInsert } = createSettlementClient({
      commitmentData: {
        id: "commitment-1",
        status: "CANCELLED",
        committed_amount: 25000,
        funding_offer_id: "offer-1"
      }
    });
    const service = createService(client);

    await expect(service.createSettlementInstruction(auth, validPayload)).rejects.toMatchObject({
      statusCode: 400,
      code: "invalid_settlement_configuration",
      reasonCode: "ERR_INVALID_SETTLEMENT_CONFIGURATION"
    });
    expect(instructionInsert).not.toHaveBeenCalled();
  });
});
