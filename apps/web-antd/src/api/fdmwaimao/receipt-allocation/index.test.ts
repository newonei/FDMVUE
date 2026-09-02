import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyReceiptAllocation,
  cancelReceiptAllocation,
  createReceiptAllocationDraft,
  getReceiptAllocation,
  getReceiptAllocationGenerationJob,
  getReceiptAllocationGenerationModels,
  getReceiptAllocationPage,
  isReceiptAllocationDuplicateConfirmationError,
  materializeReceiptAllocationGeneration,
  startReceiptAllocationGeneration,
  voidReceiptAllocation,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmwaimao receipt allocation API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMocks.get.mockResolvedValue({ list: [], total: 0 });
    requestMocks.post.mockResolvedValue({
      id: '9223372036854775806',
      newlyCreated: true,
      resultVersion: 0,
      status: 'DRAFT',
    });
    requestMocks.put.mockResolvedValue({
      id: '9223372036854775806',
      newlyCreated: true,
      resultVersion: 1,
      status: 'APPLIED',
    });
  });

  it('uses string Long identities on page and detail calls', async () => {
    await getReceiptAllocationPage({
      bankReceiptId: '9223372036854775801',
      pageNo: 1,
      pageSize: 20,
    });
    await getReceiptAllocation('9223372036854775806');

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/receipt-allocation/page',
      {
        params: {
          bankReceiptId: '9223372036854775801',
          pageNo: 1,
          pageSize: 20,
        },
      },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/receipt-allocation/get',
      { params: { id: '9223372036854775806' } },
    );
  });

  it('manual draft sends only editable IDs, original-currency amounts and text', async () => {
    const draft = {
      bankReceiptId: '9223372036854775801',
      customerId: '9223372036854775802',
      expectedBankReceiptVersion: 3,
      idempotencyKey: 'allocation-create-018',
      lines: [
        {
          orderId: '9223372036854775803',
          reason: '首期款',
          sourceAmount: '800.00',
        },
        {
          orderId: '9223372036854775804',
          sourceAmount: '200.00',
        },
      ],
      remark: '人工确认分配',
    };
    await createReceiptAllocationDraft(draft);

    const sent = requestMocks.post.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    for (const forbidden of [
      'creationMode',
      'generationModelId',
      'generationProposalVersion',
      'generationRunId',
      'materializationHash',
      'sourceSnapshotHash',
    ]) {
      expect(sent).not.toHaveProperty(forbidden);
    }
    const line = (sent.lines as Array<Record<string, unknown>>)[0];
    for (const forbidden of [
      'allocatedContractAmount',
      'amountCny',
      'contractCurrencyToCnyRate',
      'rateDate',
      'rateSnapshotHash',
      'sourceCurrencyToCnyRate',
    ]) {
      expect(line).not.toHaveProperty(forbidden);
    }
  });

  it('reuses one CAS plus idempotency command shape for all transitions', async () => {
    const command = {
      confirmPotentialDuplicate: false,
      expectedVersion: 2,
      id: '9223372036854775806',
      idempotencyKey: 'allocation-action-018',
      reason: '业务确认',
    };
    await applyReceiptAllocation(command);
    await cancelReceiptAllocation(command);
    await voidReceiptAllocation(command);

    expect(requestMocks.put.mock.calls).toEqual([
      ['/fdmwaimao/receipt-allocation/apply', command],
      ['/fdmwaimao/receipt-allocation/cancel', command],
      ['/fdmwaimao/receipt-allocation/void', command],
    ]);
    expect(
      isReceiptAllocationDuplicateConfirmationError({
        data: { code: 1_206_013_006 },
      }),
    ).toBe(true);
  });

  it('exposes explicit model selection, polling and READY materialization wrappers', async () => {
    await getReceiptAllocationGenerationModels('9223372036854775801');
    await startReceiptAllocationGeneration({
      bankReceiptId: '9223372036854775801',
      expectedSourceVersion: 4,
      idempotencyKey: 'allocation-generate-018',
      instruction: '优先匹配最早到期合同',
      modelId: '9223372036854775802',
    });
    await getReceiptAllocationGenerationJob('9223372036854775807');
    await materializeReceiptAllocationGeneration({
      expectedRunVersion: '9223372036854775808',
      idempotencyKey: 'allocation-materialize-018',
      remark: '人工确认 AI 建议',
      runId: '9223372036854775807',
    });

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/receipt-allocation/generation/models',
      { params: { bankReceiptId: '9223372036854775801' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/receipt-allocation/generation/job',
      { params: { runId: '9223372036854775807' } },
    );
    expect(requestMocks.post).toHaveBeenLastCalledWith(
      '/fdmwaimao/receipt-allocation/generation/materialize',
      {
        expectedRunVersion: '9223372036854775808',
        idempotencyKey: 'allocation-materialize-018',
        remark: '人工确认 AI 建议',
        runId: '9223372036854775807',
      },
    );
  });
});
