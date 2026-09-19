import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { describe, expect, it } from 'vitest';

import {
  actionNames,
  allocationDifference,
  allocationGroupsAfterSourceChange,
  allocationPreview,
  financeDraft,
  financePayload,
  financeRecordRoute,
  hasPayableBalance,
  newExpense,
  newGroup,
  procurementLineAmount,
  procurementOrderAmount,
} from './model';
describe('采购财务编辑与金额口径', () => {
  it('生效历史显示中文操作名，同时保留既有审核记录的历史含义', () => {
    expect(actionNames.ACTIVATE).toBe('提交生效');
    expect(actionNames.SUBMIT).toBe('提交生效');
    expect(actionNames.APPROVE).toBe('历史批准');
    expect(actionNames.REJECT).toBe('历史退回');
  });
  it('草稿独立复制，保留费用来源身份但不修改原记录', () => {
    const source = {
      expenses: [
        { id: 'e', sourceKey: 'stable', amount: 12, evidenceRef: 'file' },
      ],
      groups: [
        {
          mode: 'AMOUNT',
          allocations: [{ entityId: 'company', amount: '12' }],
        },
      ],
    };
    const value = financeDraft(source);
    value.expenses[0]!.amount = '15';
    value.groups[0]!.allocations[0]!.amount = '15';
    expect(source.expenses[0]!.amount).toBe(12);
    expect(source.groups[0]!.allocations[0]!.amount).toBe('12');
    expect(value.expenses[0]!.sourceKey).toBe('stable');
  });
  it('采购请款保留计划期次及代付说明，不混入付款确认日期', () => {
    const body = financePayload(
      'REQUEST',
      financeDraft({
        planId: 'plan',
        periodId: 'period',
        agencyReason: '集团代付',
        paidAt: '2026-09-08',
      }),
    );
    expect(body).toMatchObject({
      planId: 'plan',
      periodId: 'period',
      agencyReason: '集团代付',
    });
    expect(body).not.toHaveProperty('paidAt');
  });
  it('付款只关联来源生效单据，不在客户端编造汇率和凭证', () => {
    const body = financePayload(
      'PAYMENT',
      financeDraft({
        sourceDocumentId: 'approved',
        amount: '0.1',
        exchangeRateToCny: 1,
      }),
    );
    expect(body).toMatchObject({
      sourceDocumentId: 'approved',
      evidenceRefs: [],
    });
    expect(body).not.toHaveProperty('exchangeRateToCny');
    expect(body).not.toHaveProperty('sourceKey');
  });
  it('先存付款草稿时省略空日期与空金额', () => {
    const body = financePayload('PAYMENT', financeDraft());
    expect(body.paidAt).toBeUndefined();
    expect(body.amount).toBeUndefined();
  });
  it('独立费用报销不强制伪造合同或采购单关系', () => {
    const value = financeDraft();
    value.expenses = [newExpense()];
    const body = financePayload('REIMBURSEMENT', value);
    expect(body.contractId).toBeUndefined();
    expect(body.orderId).toBeUndefined();
    expect((body.expenses as Record<string, unknown>[])[0]).toMatchObject({
      evidenceRef: '',
      category: 'TRANSPORT',
    });
  });
  it('只提交所选分配口径，不回传客户端金额比例双值', () => {
    const value = financeDraft();
    value.groups = [
      {
        ...newGroup(),
        mode: 'PERCENT',
        allocations: [{ entityId: 'e', percentage: '100', amount: 'wrong' }],
      },
    ];
    const body = financePayload('COST_ALLOCATION', value);
    expect(
      (body.groups as { allocations: unknown[] }[])[0]!.allocations,
    ).toEqual([{ entityId: 'e', percentage: '100' }]);
  });
  it('金额模式精确计算差额', () => {
    const group = {
      ...newGroup(),
      allocations: [
        { entityId: 'a', amount: '0.1', percentage: '' },
        { entityId: 'b', amount: '0.2', percentage: '' },
      ],
    };
    expect(allocationDifference(group, '0.3')).toBe('0');
  });
  it('比例模式将分币尾差留在最后一项并明确展示', () => {
    const group = {
      ...newGroup(),
      mode: 'PERCENT' as const,
      allocations: ['33.33', '33.33', '33.34'].map((percentage) => ({
        entityId: 'e',
        amount: '',
        percentage,
      })),
    };
    const preview = allocationPreview(group, '0.05', 'CNY');
    expect(preview.map((row) => row.amount)).toEqual(['0.02', '0.02', '0.01']);
    expect(preview[2]!.roundingAdjustment).toBe('-0.01');
  });
  it('不满100%的草稿不能被尾差调整伪装平衡', () => {
    const group = {
      ...newGroup(),
      mode: 'PERCENT' as const,
      allocations: [{ entityId: 'e', amount: '', percentage: '50' }],
    };
    expect(allocationPreview(group, '10', 'CNY')[0]!.amount).toBe('5.00');
    expect(allocationDifference(group)).toBe('50');
  });
  it('取消采购余额后按有效数量计算货款', () => {
    expect(
      procurementLineAmount(
        { quantity: '10', cancelledQuantity: '3', unitPrice: '0.115' },
        'CNY',
      ),
    ).toBe('0.81');
  });
  it('先按每行币种小数位取整再合计，而不是最终统一取整', () => {
    expect(
      procurementOrderAmount(
        [
          { quantity: '1', unitPrice: '0.105' },
          { quantity: '1', unitPrice: '0.105' },
        ],
        'CNY',
      ),
    ).toBe('0.22');
  });
  it('日元和三位小数币种使用各自最小单位', () => {
    expect(
      procurementLineAmount({ quantity: '1', unitPrice: '1.5' }, 'JPY'),
    ).toBe('2');
    expect(
      procurementLineAmount({ quantity: '1', unitPrice: '1.2345' }, 'KWD'),
    ).toBe('1.235');
  });
  it('已付清与非法余额不能再次选为付款来源', () => {
    expect(hasPayableBalance('0')).toBe(false);
    expect(hasPayableBalance('NaN')).toBe(false);
    expect(hasPayableBalance('0.01')).toBe(true);
  });
  it('付款计划精确深链保留单据ID和采购单上下文', () => {
    expect(
      financeRecordRoute({
        id: 'finance',
        type: 'PAYMENT_PLAN',
        contractId: 'contract',
        orderId: 'po',
      } as ProcurementFinanceRecord),
    ).toEqual({
      path: '/caiwu/platform-procurement-requests',
      query: {
        financeId: 'finance',
        type: 'PAYMENT_PLAN',
        contractId: 'contract',
        orderId: 'po',
      },
    });
  });
});

describe('计划撤回后编辑', () => {
  it('派生余额和付款主体快照不回传到期间写入DTO', () => {
    const value = financeDraft({
      periods: [
        {
          id: 'p',
          name: '尾款',
          payerEntityId: 'entity',
          amount: '12',
          condition: '到货后',
          dueDate: '2026-09-09',
          requestedAmount: '2',
          availableRequestAmount: '10',
          payerSnapshot: { name: '旧主体' },
        },
      ],
    });
    const payload = financePayload('PAYMENT_PLAN', value);
    expect(payload.periods).toEqual([
      {
        id: 'p',
        name: '尾款',
        payerEntityId: 'entity',
        amount: '12',
        condition: '到货后',
        dueDate: '2026-09-09',
      },
    ]);
  });
});

describe('成本来源选择', () => {
  it('切换采购单或报销来源后不能带入原来源明细与分配', () => {
    const groups = [
      {
        ...newGroup(),
        sourceLineId: 'old-po-line',
        allocations: [{ entityId: 'a', amount: '15', percentage: '100' }],
      },
    ];
    expect(allocationGroupsAfterSourceChange(groups, 'po-a', 'po-b')).toEqual([
      newGroup(),
    ]);
    expect(
      allocationGroupsAfterSourceChange(groups, 'reim-a', 'reim-b'),
    ).toEqual([newGroup()]);
  });
  it('重新选中同一来源保留用户已经填写的分配', () => {
    const groups = [{ ...newGroup(), sourceLineId: 'current-line' }];
    expect(allocationGroupsAfterSourceChange(groups, 'same', 'same')).toBe(
      groups,
    );
  });
});
