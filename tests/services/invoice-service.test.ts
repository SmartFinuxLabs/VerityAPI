import { describe, expect, it, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import type { AuthContext } from "../../src/services/auth-token.js";
import { createInvoiceService } from "../../src/services/invoice-service.js";

const auth: AuthContext = {
  userId: "user-1",
  participantRole: "BUYER",
  organizationRole: "MEMBER"
};

function createInvoiceClient({
  invoiceData = { id: "invoice-1" },
  relationshipData = {
    id: "rel-1",
    buyer_id: "buyer-org-1",
    supplier_id: "supplier-org-1",
    status: "ACTIVE"
  }
}: {
  invoiceData?: unknown;
  relationshipData?: unknown;
} = {}) {
  const invoiceMaybeSingle = jest.fn(async () => ({ data: invoiceData, error: null }));
  const invoiceSelect = jest.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
  const insert = jest.fn(() => ({ select: invoiceSelect }));
  const update = jest.fn(() => ({
    eq: jest.fn(() => ({ select: invoiceSelect }))
  }));

  const relationshipMaybeSingle = jest.fn(async () => ({ data: relationshipData, error: null }));
  const relationshipEq = jest.fn(() => ({ maybeSingle: relationshipMaybeSingle }));
  const relationshipSelect = jest.fn(() => ({ eq: relationshipEq }));

  const from = jest.fn((table: string) => {
    if (table === "relationships") {
      return { select: relationshipSelect };
    }
    return { insert, update };
  });
  const client = { rpc: jest.fn(), from };

  return { client, insert, relationshipEq };
}

function createService(client: ReturnType<typeof createInvoiceClient>["client"]) {
  return createInvoiceService(() => client);
}

function createResolutionClient({
  invoiceData = {
    id: "invoice-1",
    state: "SUBMITTED",
    gross_amount: 25000
  },
  resolutionData = {
    id: "resolution-1",
    invoice_id: "invoice-1",
    decision_state: "ACCEPTED",
    accepted_amount: 25000
  },
  updatedInvoiceData = {
    id: "invoice-1",
    state: "ACCEPTED"
  }
}: {
  invoiceData?: unknown;
  resolutionData?: unknown;
  updatedInvoiceData?: unknown;
} = {}) {
  const invoiceReadMaybeSingle = jest.fn(async () => ({ data: invoiceData, error: null }));
  const invoiceReadEq = jest.fn(() => ({ maybeSingle: invoiceReadMaybeSingle }));
  const invoiceReadSelect = jest.fn(() => ({ eq: invoiceReadEq }));

  const invoiceUpdateMaybeSingle = jest.fn(async () => ({ data: updatedInvoiceData, error: null }));
  const invoiceUpdateSelect = jest.fn(() => ({ maybeSingle: invoiceUpdateMaybeSingle }));
  const invoiceUpdateEq = jest.fn(() => ({ select: invoiceUpdateSelect }));
  const invoiceUpdate = jest.fn(() => ({ eq: invoiceUpdateEq }));

  const resolutionMaybeSingle = jest.fn(async () => ({ data: resolutionData, error: null }));
  const resolutionSelect = jest.fn(() => ({ maybeSingle: resolutionMaybeSingle }));
  const resolutionInsert = jest.fn(() => ({ select: resolutionSelect }));

  const from = jest.fn((table: string) => {
    if (table === "invoices") {
      return {
        select: invoiceReadSelect,
        update: invoiceUpdate
      };
    }
    return { insert: resolutionInsert };
  });
  const client = { rpc: jest.fn(), from };

  return {
    client,
    invoiceReadEq,
    invoiceUpdate,
    resolutionInsert
  };
}

function createHashRegistrationClient({
  updatedInvoiceData = {
    id: "invoice-1",
    hash_digest: "digest-1",
    canonical_payload: "payload-1"
  },
  existingDuplicateData = null,
  currentInvoiceData = {
    id: "invoice-1",
    hash_digest: null,
    canonical_payload: null
  }
}: {
  updatedInvoiceData?: unknown;
  existingDuplicateData?: unknown;
  currentInvoiceData?: unknown;
} = {}) {
  const currentInvoiceMaybeSingle = jest.fn(async () => ({ data: currentInvoiceData, error: null }));
  const currentInvoiceEq = jest.fn(() => ({ maybeSingle: currentInvoiceMaybeSingle }));
  const currentInvoiceSelect = jest.fn(() => ({ eq: currentInvoiceEq }));

  const duplicateMaybeSingle = jest.fn(async () => ({ data: existingDuplicateData, error: null }));
  const duplicateNeq = jest.fn(() => ({ maybeSingle: duplicateMaybeSingle }));
  const duplicateEq = jest.fn(() => ({ neq: duplicateNeq }));
  const duplicateSelect = jest.fn(() => ({ eq: duplicateEq }));

  const updateMaybeSingle = jest.fn(async () => ({ data: updatedInvoiceData, error: null }));
  const updateSelect = jest.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateEq = jest.fn(() => ({ select: updateSelect }));
  const update = jest.fn(() => ({ eq: updateEq }));

  let selectCount = 0;
  const from = jest.fn(() => ({
    select: jest.fn((columns: string) => {
      selectCount += 1;
      if (columns === "id,hash_digest,canonical_payload") {
        return currentInvoiceSelect();
      }
      return duplicateSelect();
    }),
    update
  }));
  const client = { rpc: jest.fn(), from };

  return {
    client,
    update,
    duplicateEq,
    duplicateNeq
  };
}

function sha256(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function createFinanceabilityClient({
  invoiceData = {
    id: "invoice-1",
    relationship_id: "rel-1",
    state: "ACCEPTED",
    accepted_amount: 25000
  },
  riskProfileData = {
    id: "risk-1",
    relationship_id: "rel-1",
    recourse_type: "WITH_RECOURSE",
    risk_mode: "LOW",
    is_complete: true
  },
  financeabilityData = {
    id: "financeability-1",
    invoice_id: "invoice-1",
    accepted_amount: 25000,
    eligible_amount: 25000,
    risk_mode: "LOW",
    status: "ELIGIBLE",
    reason_code: "FINANCEABLE_ACCEPTED_VALUE",
    is_duplicate_blocked: false
  }
}: {
  invoiceData?: unknown;
  riskProfileData?: unknown;
  financeabilityData?: unknown;
} = {}) {
  const invoiceMaybeSingle = jest.fn(async () => ({ data: invoiceData, error: null }));
  const invoiceEq = jest.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
  const invoiceSelect = jest.fn(() => ({ eq: invoiceEq }));

  const riskProfileMaybeSingle = jest.fn(async () => ({ data: riskProfileData, error: null }));
  const riskProfileEq = jest.fn(() => ({ maybeSingle: riskProfileMaybeSingle }));
  const riskProfileSelect = jest.fn(() => ({ eq: riskProfileEq }));

  const financeabilityMaybeSingle = jest.fn(async () => ({ data: financeabilityData, error: null }));
  const financeabilitySelect = jest.fn(() => ({ maybeSingle: financeabilityMaybeSingle }));
  const financeabilityInsert = jest.fn(() => ({ select: financeabilitySelect }));

  const from = jest.fn((table: string) => {
    if (table === "invoices") {
      return { select: invoiceSelect };
    }
    if (table === "risk_profiles") {
      return { select: riskProfileSelect };
    }
    return { insert: financeabilityInsert };
  });
  const client = { rpc: jest.fn(), from };

  return {
    client,
    invoiceEq,
    riskProfileEq,
    financeabilityInsert
  };
}

describe("invoice service", () => {
  const validInvoicePayload = {
    relationshipId: "rel-1",
    supplierId: "supplier-org-1",
    buyerId: "buyer-org-1",
    invoiceNumber: "INV-2026-001",
    issueDate: "2026-06-01",
    dueDate: "2026-07-01",
    currency: "USDC",
    grossAmount: 25000.5,
    acceptedAmount: 20000,
    sourceSystemReference: "erp-invoice-1",
    metadata: { purchaseOrder: "PO-1" }
  };

  it("registers supplier invoices in SUBMITTED state after validation", async () => {
    const { client, insert, relationshipEq } = createInvoiceClient({
      invoiceData: {
        id: "invoice-1",
        state: "SUBMITTED"
      }
    });
    const service = createService(client);

    await expect(service.createInvoice(auth, validInvoicePayload)).resolves.toEqual({
      id: "invoice-1",
      state: "SUBMITTED"
    });

    expect(relationshipEq).toHaveBeenCalledWith("id", "rel-1");
    expect(client.from).toHaveBeenCalledWith("invoices");
    expect(insert).toHaveBeenCalledWith({
      relationship_id: "rel-1",
      supplier_id: "supplier-org-1",
      buyer_id: "buyer-org-1",
      invoice_number: "INV-2026-001",
      issue_date: "2026-06-01",
      due_date: "2026-07-01",
      currency: "USDC",
      gross_amount: 25000.5,
      accepted_amount: 20000,
      source_system_reference: "erp-invoice-1",
      state: "SUBMITTED",
      metadata: { purchaseOrder: "PO-1" },
      created_by: "user-1",
      updated_by: "user-1"
    });
  });

  it("rejects missing required invoice fields before persistence", async () => {
    const { client, insert } = createInvoiceClient();
    const service = createService(client);

    await expect(
      service.createInvoice(auth, {
        ...validInvoicePayload,
        invoiceNumber: ""
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "bad_request",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects invoices with non-positive gross amounts", async () => {
    const { client, insert } = createInvoiceClient();
    const service = createService(client);

    await expect(
      service.createInvoice(auth, {
        ...validInvoicePayload,
        grossAmount: 0
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "bad_request",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects invalid invoice date ordering", async () => {
    const { client, insert } = createInvoiceClient();
    const service = createService(client);

    await expect(
      service.createInvoice(auth, {
        ...validInvoicePayload,
        issueDate: "2026-07-01",
        dueDate: "2026-07-01"
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "bad_request",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects accepted amounts above gross amount", async () => {
    const { client, insert } = createInvoiceClient();
    const service = createService(client);

    await expect(
      service.createInvoice(auth, {
        ...validInvoicePayload,
        acceptedAmount: 30000
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "bad_request",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects non-USDC invoice currency in Phase 1", async () => {
    const { client, insert } = createInvoiceClient();
    const service = createService(client);

    await expect(
      service.createInvoice(auth, {
        ...validInvoicePayload,
        currency: "USD"
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "bad_request",
      reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects invoices when the relationship does not exist", async () => {
    const { client, insert } = createInvoiceClient({ relationshipData: null });
    const service = createService(client);

    await expect(service.createInvoice(auth, validInvoicePayload)).rejects.toMatchObject({
      statusCode: 404,
      code: "not_found",
      reasonCode: "ERR_NOT_FOUND"
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects invoices when the relationship is not active", async () => {
    const { client, insert } = createInvoiceClient({
      relationshipData: {
        id: "rel-1",
        buyer_id: "buyer-org-1",
        supplier_id: "supplier-org-1",
        status: "SUSPENDED"
      }
    });
    const service = createService(client);

    await expect(service.createInvoice(auth, validInvoicePayload)).rejects.toMatchObject({
      statusCode: 400,
      code: "invalid_relationship_mode",
      reasonCode: "ERR_INVALID_RELATIONSHIP_MODE"
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects invoices when buyer and supplier do not match the relationship", async () => {
    const { client, insert } = createInvoiceClient({
      relationshipData: {
        id: "rel-1",
        buyer_id: "another-buyer",
        supplier_id: "supplier-org-1",
        status: "ACTIVE"
      }
    });
    const service = createService(client);

    await expect(service.createInvoice(auth, validInvoicePayload)).rejects.toMatchObject({
      statusCode: 400,
      code: "invalid_relationship_mode",
      reasonCode: "ERR_INVALID_RELATIONSHIP_MODE"
    });
    expect(insert).not.toHaveBeenCalled();
  });

  describe("buyer resolution actions", () => {
    const validResolutionPayload = {
      decisionState: "ACCEPTED",
      acceptedAmount: 25000,
      decisionReason: "Buyer accepted invoice",
      reasonCode: "BUYER_APPROVED"
    };

    it("accepts invoices when acceptedAmount equals grossAmount and updates invoice state", async () => {
      const { client, invoiceReadEq, invoiceUpdate, resolutionInsert } = createResolutionClient();
      const service = createService(client);

      await expect(service.createInvoiceResolution(auth, "invoice-1", validResolutionPayload)).resolves.toEqual({
        resolution: {
          id: "resolution-1",
          invoice_id: "invoice-1",
          decision_state: "ACCEPTED",
          accepted_amount: 25000
        },
        invoice: {
          id: "invoice-1",
          state: "ACCEPTED"
        }
      });

      expect(invoiceReadEq).toHaveBeenCalledWith("id", "invoice-1");
      expect(resolutionInsert).toHaveBeenCalledWith({
        invoice_id: "invoice-1",
        decision_state: "ACCEPTED",
        accepted_amount: 25000,
        reviewer_id: "user-1",
        decision_reason: "Buyer accepted invoice",
        reason_code: "BUYER_APPROVED"
      });
      expect(invoiceUpdate).toHaveBeenCalledWith({
        state: "ACCEPTED",
        accepted_amount: 25000,
        updated_by: "user-1",
        updated_at: expect.any(String)
      });
    });

    it("partially accepts invoices only when acceptedAmount is greater than zero and below grossAmount", async () => {
      const { client, invoiceUpdate, resolutionInsert } = createResolutionClient({
        resolutionData: {
          id: "resolution-1",
          invoice_id: "invoice-1",
          decision_state: "PARTIALLY_ACCEPTED",
          accepted_amount: 12000
        },
        updatedInvoiceData: {
          id: "invoice-1",
          state: "PARTIALLY_ACCEPTED"
        }
      });
      const service = createService(client);

      await expect(
        service.createInvoiceResolution(auth, "invoice-1", {
          ...validResolutionPayload,
          decisionState: "PARTIALLY_ACCEPTED",
          acceptedAmount: 12000
        })
      ).resolves.toEqual({
        resolution: {
          id: "resolution-1",
          invoice_id: "invoice-1",
          decision_state: "PARTIALLY_ACCEPTED",
          accepted_amount: 12000
        },
        invoice: {
          id: "invoice-1",
          state: "PARTIALLY_ACCEPTED"
        }
      });

      expect(resolutionInsert).toHaveBeenCalledWith(expect.objectContaining({
        decision_state: "PARTIALLY_ACCEPTED",
        accepted_amount: 12000
      }));
      expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({
        state: "PARTIALLY_ACCEPTED",
        accepted_amount: 12000
      }));
    });

    it("rejects accepted decisions when acceptedAmount does not equal grossAmount", async () => {
      const { client, resolutionInsert, invoiceUpdate } = createResolutionClient();
      const service = createService(client);

      await expect(
        service.createInvoiceResolution(auth, "invoice-1", {
          ...validResolutionPayload,
          acceptedAmount: 24999
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "bad_request",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
      });
      expect(resolutionInsert).not.toHaveBeenCalled();
      expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it("rejects partial decisions when acceptedAmount is not below grossAmount", async () => {
      const { client, resolutionInsert, invoiceUpdate } = createResolutionClient();
      const service = createService(client);

      await expect(
        service.createInvoiceResolution(auth, "invoice-1", {
          ...validResolutionPayload,
          decisionState: "PARTIALLY_ACCEPTED",
          acceptedAmount: 25000
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "bad_request",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
      });
      expect(resolutionInsert).not.toHaveBeenCalled();
      expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it("rejects decisions with acceptedAmount above grossAmount", async () => {
      const { client, resolutionInsert, invoiceUpdate } = createResolutionClient();
      const service = createService(client);

      await expect(
        service.createInvoiceResolution(auth, "invoice-1", {
          ...validResolutionPayload,
          acceptedAmount: 30000
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "bad_request",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
      });
      expect(resolutionInsert).not.toHaveBeenCalled();
      expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it("marks rejected invoices non-financeable with zero accepted amount", async () => {
      const { client, invoiceUpdate, resolutionInsert } = createResolutionClient({
        resolutionData: {
          id: "resolution-1",
          invoice_id: "invoice-1",
          decision_state: "REJECTED",
          accepted_amount: 0
        },
        updatedInvoiceData: {
          id: "invoice-1",
          state: "REJECTED"
        }
      });
      const service = createService(client);

      await expect(
        service.createInvoiceResolution(auth, "invoice-1", {
          ...validResolutionPayload,
          decisionState: "REJECTED",
          acceptedAmount: 0
        })
      ).resolves.toEqual({
        resolution: {
          id: "resolution-1",
          invoice_id: "invoice-1",
          decision_state: "REJECTED",
          accepted_amount: 0
        },
        invoice: {
          id: "invoice-1",
          state: "REJECTED"
        }
      });

      expect(resolutionInsert).toHaveBeenCalledWith(expect.objectContaining({
        decision_state: "REJECTED",
        accepted_amount: 0
      }));
      expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({
        state: "REJECTED",
        accepted_amount: 0
      }));
    });

    it("rejects buyer resolution when invoice is already finalized", async () => {
      const { client, resolutionInsert, invoiceUpdate } = createResolutionClient({
        invoiceData: {
          id: "invoice-1",
          state: "FACTORED",
          gross_amount: 25000
        }
      });
      const service = createService(client);

      await expect(
        service.createInvoiceResolution(auth, "invoice-1", validResolutionPayload)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "invalid_invoice_state",
        reasonCode: "ERR_CONFLICT",
        details: {
          currentState: "FACTORED",
          requestedState: "ACCEPTED",
          allowedSourceStates: ["SUBMITTED", "UNDER_REVIEW"]
        }
      });
      expect(resolutionInsert).not.toHaveBeenCalled();
      expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it.each(["ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED", "DISPUTED", "HELD", "CANCELLED", "FACTORED", "SETTLED"])(
      "rejects resolution transitions from %s with stable reason-code details",
      async (state) => {
        const { client, resolutionInsert, invoiceUpdate } = createResolutionClient({
          invoiceData: {
            id: "invoice-1",
            state,
            gross_amount: 25000
          }
        });
        const service = createService(client);

        await expect(
          service.createInvoiceResolution(auth, "invoice-1", validResolutionPayload)
        ).rejects.toMatchObject({
          statusCode: 409,
          code: "invalid_invoice_state",
          reasonCode: "ERR_CONFLICT",
          details: {
            currentState: state,
            requestedState: "ACCEPTED",
            allowedSourceStates: ["SUBMITTED", "UNDER_REVIEW"]
          }
        });
        expect(resolutionInsert).not.toHaveBeenCalled();
        expect(invoiceUpdate).not.toHaveBeenCalled();
      }
    );
  });

  describe("deterministic invoice hash registration", () => {
    const hashPayload = {
      supplierEntityId: " supplier_001 ",
      buyerEntityId: "buyer_001",
      invoiceNumber: " inv-2026-0001 ",
      invoiceIssueDate: "2026-05-31",
      invoiceCurrency: "usdc",
      grossInvoiceAmount: "100000",
      acceptedAmountAtRegistration: 100000,
      dueDate: "2026-06-30",
      relationshipId: "rel-0001",
      sourceSystemReference: " erp-a-ref-7781 "
    };
    const canonicalPayload =
      "SUPPLIER_001|BUYER_001|INV-2026-0001|2026-05-31|USDC|100000.00|100000.00|2026-06-30|REL-0001|ERP-A-REF-7781";
    const hashDigest = sha256(canonicalPayload);

    it("computes deterministic canonical invoice hash payloads and registers them on the invoice", async () => {
      const { client, update, duplicateEq, duplicateNeq } = createHashRegistrationClient({
        updatedInvoiceData: {
          id: "invoice-1",
          hash_digest: hashDigest,
          canonical_payload: canonicalPayload
        }
      });
      const service = createService(client);

      await expect(service.registerInvoiceHash(auth, "invoice-1", hashPayload)).resolves.toEqual({
        hashDigest,
        canonicalPayload,
        duplicateDetected: false,
        duplicateOfInvoiceId: null
      });

      expect(duplicateEq).toHaveBeenCalledWith("hash_digest", hashDigest);
      expect(duplicateNeq).toHaveBeenCalledWith("id", "invoice-1");
      expect(update).toHaveBeenCalledWith({
        canonical_payload: canonicalPayload,
        hash_digest: hashDigest,
        hash_registered_at: expect.any(String)
      });
    });

    it("returns the same digest for whitespace and case variants", async () => {
      const { client } = createHashRegistrationClient({
        updatedInvoiceData: {
          id: "invoice-1",
          hash_digest: hashDigest,
          canonical_payload: canonicalPayload
        }
      });
      const service = createService(client);

      await expect(
        service.registerInvoiceHash(auth, "invoice-1", {
          ...hashPayload,
          supplierEntityId: "SUPPLIER_001",
          invoiceNumber: "INV-2026-0001",
          invoiceCurrency: "USDC",
          sourceSystemReference: "ERP-A-REF-7781"
        })
      ).resolves.toMatchObject({
        hashDigest,
        canonicalPayload
      });
    });

    it("returns the same digest for semantically identical numeric precision variants", async () => {
      const { client } = createHashRegistrationClient({
        updatedInvoiceData: {
          id: "invoice-1",
          hash_digest: hashDigest,
          canonical_payload: canonicalPayload
        }
      });
      const service = createService(client);

      await expect(
        service.registerInvoiceHash(auth, "invoice-1", {
          ...hashPayload,
          grossInvoiceAmount: "100000.0",
          acceptedAmountAtRegistration: 100000.004
        })
      ).resolves.toMatchObject({
        hashDigest,
        canonicalPayload
      });
    });

    it("rejects invalid hash dates before persistence", async () => {
      const { client, update } = createHashRegistrationClient();
      const service = createService(client);

      await expect(
        service.registerInvoiceHash(auth, "invoice-1", {
          ...hashPayload,
          invoiceIssueDate: "05/31/2026"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "hash_validation_failed",
        reasonCode: "HASH_INVALID_DATE_FORMAT"
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("blocks exact duplicate digest registration with stable duplicate reason code", async () => {
      const { client, update } = createHashRegistrationClient({
        existingDuplicateData: {
          id: "invoice-original"
        }
      });
      const service = createService(client);

      await expect(service.registerInvoiceHash(auth, "invoice-1", hashPayload)).rejects.toMatchObject({
        statusCode: 409,
        code: "duplicate_hash_detected",
        reasonCode: "HASH_DUPLICATE_DETECTED",
        details: {
          duplicateOfInvoiceId: "invoice-original",
          hashDigest,
          canonicalPayload
        }
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("rejects attempts to change an already registered invoice hash", async () => {
      const { client, update } = createHashRegistrationClient({
        currentInvoiceData: {
          id: "invoice-1",
          hash_digest: "another-digest",
          canonical_payload: "ANOTHER|PAYLOAD"
        }
      });
      const service = createService(client);

      await expect(service.registerInvoiceHash(auth, "invoice-1", hashPayload)).rejects.toMatchObject({
        statusCode: 409,
        code: "duplicate_hash_registered",
        reasonCode: "ERR_DUPLICATE_HASH_REGISTERED"
      });
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe("financeability computation", () => {
    it("computes eligible amount from an accepted invoice accepted amount", async () => {
      const { client, invoiceEq, riskProfileEq, financeabilityInsert } = createFinanceabilityClient();
      const service = createService(client);

      await expect(
        service.evaluateInvoiceFinanceability(auth, "invoice-1", {
          resolutionId: "resolution-1",
          riskMode: "LOW"
        })
      ).resolves.toEqual({
        id: "financeability-1",
        invoice_id: "invoice-1",
        accepted_amount: 25000,
        eligible_amount: 25000,
        risk_mode: "LOW",
        status: "ELIGIBLE",
        reason_code: "FINANCEABLE_ACCEPTED_VALUE",
        is_duplicate_blocked: false
      });

      expect(invoiceEq).toHaveBeenCalledWith("id", "invoice-1");
      expect(riskProfileEq).toHaveBeenCalledWith("relationship_id", "rel-1");
      expect(financeabilityInsert).toHaveBeenCalledWith({
        invoice_id: "invoice-1",
        resolution_id: "resolution-1",
        accepted_amount: 25000,
        eligible_amount: 25000,
        risk_mode: "LOW",
        status: "ELIGIBLE",
        reason_code: "FINANCEABLE_ACCEPTED_VALUE",
        is_duplicate_blocked: false,
        policy_snapshot: {
          riskProfileId: "risk-1",
          recourseType: "WITH_RECOURSE",
          riskMode: "LOW"
        }
      });
    });

    it("allows requested eligible amount below accepted amount", async () => {
      const { client, financeabilityInsert } = createFinanceabilityClient({
        financeabilityData: {
          id: "financeability-1",
          invoice_id: "invoice-1",
          accepted_amount: 25000,
          eligible_amount: 20000,
          risk_mode: "MEDIUM",
          status: "ELIGIBLE",
          reason_code: "FINANCEABLE_ACCEPTED_VALUE",
          is_duplicate_blocked: false
        }
      });
      const service = createService(client);

      await expect(
        service.evaluateInvoiceFinanceability(auth, "invoice-1", {
          resolutionId: "resolution-1",
          eligibleAmount: 20000,
          riskMode: "MEDIUM"
        })
      ).resolves.toMatchObject({
        eligible_amount: 20000,
        accepted_amount: 25000
      });
      expect(financeabilityInsert).toHaveBeenCalledWith(expect.objectContaining({
        accepted_amount: 25000,
        eligible_amount: 20000,
        risk_mode: "MEDIUM"
      }));
    });

    it("computes financeability from partially accepted invoice accepted amount", async () => {
      const { client, financeabilityInsert } = createFinanceabilityClient({
        invoiceData: {
          id: "invoice-1",
          relationship_id: "rel-1",
          state: "PARTIALLY_ACCEPTED",
          accepted_amount: 12000
        },
        financeabilityData: {
          id: "financeability-1",
          invoice_id: "invoice-1",
          accepted_amount: 12000,
          eligible_amount: 12000,
          risk_mode: "LOW",
          status: "ELIGIBLE",
          reason_code: "FINANCEABLE_ACCEPTED_VALUE",
          is_duplicate_blocked: false
        }
      });
      const service = createService(client);

      await expect(
        service.evaluateInvoiceFinanceability(auth, "invoice-1", {
          resolutionId: "resolution-1",
          riskMode: "LOW"
        })
      ).resolves.toMatchObject({
        accepted_amount: 12000,
        eligible_amount: 12000
      });
      expect(financeabilityInsert).toHaveBeenCalledWith(expect.objectContaining({
        accepted_amount: 12000,
        eligible_amount: 12000
      }));
    });

    it("rejects financeability for non-accepted invoice states", async () => {
      const { client, financeabilityInsert } = createFinanceabilityClient({
        invoiceData: {
          id: "invoice-1",
          relationship_id: "rel-1",
          state: "REJECTED",
          accepted_amount: 0
        }
      });
      const service = createService(client);

      await expect(
        service.evaluateInvoiceFinanceability(auth, "invoice-1", {
          resolutionId: "resolution-1",
          riskMode: "LOW"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "not_financeable_state",
        reasonCode: "ERR_NOT_FINANCEABLE_STATE"
      });
      expect(financeabilityInsert).not.toHaveBeenCalled();
    });

    it("rejects eligible amounts above accepted amount", async () => {
      const { client, financeabilityInsert } = createFinanceabilityClient();
      const service = createService(client);

      await expect(
        service.evaluateInvoiceFinanceability(auth, "invoice-1", {
          resolutionId: "resolution-1",
          eligibleAmount: 30000,
          riskMode: "LOW"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "bad_request",
        reasonCode: "ERR_MISSING_REQUIRED_FIELDS"
      });
      expect(financeabilityInsert).not.toHaveBeenCalled();
    });

    it("rejects financeability when the relationship risk profile is missing", async () => {
      const { client, financeabilityInsert } = createFinanceabilityClient({
        riskProfileData: null
      });
      const service = createService(client);

      await expect(
        service.evaluateInvoiceFinanceability(auth, "invoice-1", {
          resolutionId: "resolution-1",
          riskMode: "LOW"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "incomplete_risk_profile",
        reasonCode: "ERR_INCOMPLETE_RISK_PROFILE"
      });
      expect(financeabilityInsert).not.toHaveBeenCalled();
    });

    it("rejects financeability when the relationship risk profile is incomplete", async () => {
      const { client, financeabilityInsert } = createFinanceabilityClient({
        riskProfileData: {
          id: "risk-1",
          relationship_id: "rel-1",
          recourse_type: "WITH_RECOURSE",
          risk_mode: "LOW",
          is_complete: false
        }
      });
      const service = createService(client);

      await expect(
        service.evaluateInvoiceFinanceability(auth, "invoice-1", {
          resolutionId: "resolution-1",
          riskMode: "LOW"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "incomplete_risk_profile",
        reasonCode: "ERR_INCOMPLETE_RISK_PROFILE"
      });
      expect(financeabilityInsert).not.toHaveBeenCalled();
    });

    it("blocks duplicate-marked invoices from progressing to eligible financeability", async () => {
      const { client, financeabilityInsert } = createFinanceabilityClient();
      const service = createService(client);

      await expect(
        service.evaluateInvoiceFinanceability(auth, "invoice-1", {
          resolutionId: "resolution-1",
          riskMode: "LOW",
          isDuplicateBlocked: true
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "duplicate_hash_detected",
        reasonCode: "HASH_DUPLICATE_DETECTED",
        details: {
          invoiceId: "invoice-1"
        }
      });
      expect(financeabilityInsert).not.toHaveBeenCalled();
    });
  });
});
