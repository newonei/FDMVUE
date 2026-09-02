import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getOrderExpenseGenerationOptions,
  materializeOrderExpenseGeneration,
  startOrderExpenseGeneration,
  updateOrderExpenseDraft,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fDM 外贸订单费用 API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('按来源身份和版本读取当前公司可用模型', async () => {
    await getOrderExpenseGenerationOptions({
      expectedSourceVersion: 4,
      sourceId: '9223372036854775806',
      sourceType: 'FDM_WAIMAO_SHIPMENT',
    });

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmwaimao/order-expense/generation/options',
      {
        params: {
          expectedSourceVersion: 4,
          sourceId: '9223372036854775806',
          sourceType: 'FDM_WAIMAO_SHIPMENT',
        },
      },
    );
  });

  it('启动生成时保留 Long 字符串且不上传金额、汇率和分类结果', async () => {
    const command = {
      expectedSourceVersion: 4,
      idempotencyKey: 'expense-generate-1',
      instruction: '识别可能存在的物流费用',
      modelId: '9007199254740997',
      sourceId: '9223372036854775806',
      sourceType: 'FDM_WAIMAO_SHIPMENT' as const,
    };
    await startOrderExpenseGeneration(command);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/order-expense/generation/start',
      command,
    );
    expect(command).not.toHaveProperty('amount');
    expect(command).not.toHaveProperty('currency');
    expect(command).not.toHaveProperty('currencyToCnyRate');
    expect(command).not.toHaveProperty('categoryRef');
  });

  it('物化只提交 READY 运行的身份和冻结快照', async () => {
    const command = {
      attachmentIds: ['9223372036854775805'],
      expectedRunVersion: '7',
      expectedSourceSnapshotHash: 'a'.repeat(64),
      generationRunId: '9223372036854775807',
      idempotencyKey: 'expense-materialize-1',
      proposalVersion: 2,
    };
    await materializeOrderExpenseGeneration(command);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/order-expense/generation/materialize',
      command,
    );
    expect(command).not.toHaveProperty('lines');
    expect(command).not.toHaveProperty('proposal');
  });

  it('人工补金额仍不允许浏览器提交汇率或人民币金额', async () => {
    const command = {
      currency: 'USD',
      expectedVersion: 0,
      expenseDate: '2026-08-31',
      id: '12',
      idempotencyKey: 'expense-update-12-0',
      lines: [
        {
          amount: '120.50',
          categoryRef: 'category:freight',
          description: '国际运输费',
          id: '91',
        },
      ],
    };
    await updateOrderExpenseDraft(command);

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmwaimao/order-expense/update-draft',
      command,
    );
    expect(command).not.toHaveProperty('rate');
    expect(command.lines[0]).not.toHaveProperty('amountCny');
  });
});
