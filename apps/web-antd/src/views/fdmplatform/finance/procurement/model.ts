import type {
  ProcurementFinanceRecord,
  ProcurementFinanceType,
} from '#/api/fdmplatform/procurement-finance';

import BigNumber from 'bignumber.js';
export const financeTitles: Record<ProcurementFinanceType, string> = {
  PAYMENT_PLAN: '付款计划',
  REQUEST: '采购请款单',
  PAYMENT: '采购付款记录',
  REIMBURSEMENT: '费用报销单',
  COST_ALLOCATION: '采购成本归集',
};
export const financeRoutes: Record<ProcurementFinanceType, string> = {
  PAYMENT_PLAN: '/caiwu/platform-procurement-requests',
  REQUEST: '/caiwu/platform-procurement-requests',
  PAYMENT: '/caiwu/platform-procurement-payments',
  REIMBURSEMENT: '/caiwu/platform-procurement-reimbursements',
  COST_ALLOCATION: '/caiwu/platform-procurement-costs',
};
export const actionNames: Record<string, string> = {
  COMPLETE_MIGRATED_PAYMENT: '补齐原付款资料',
  UPDATE: '保存草稿',
  SUBMIT: '提交审批',
  APPROVE: '批准',
  REJECT: '退回修改',
  WITHDRAW: '撤回并编辑',
  CANCEL: '取消单据',
  CONFIRM: '确认',
  REVERSE: '退款 / 冲销',
  REDUCE_REMAINING: '调整未付款余额',
};
export interface PeriodDraft {
  id?: string;
  name: string;
  payerEntityId: string;
  amount: string;
  dueDate: string;
  condition: string;
}
export interface ExpenseDraft {
  id?: string;
  sourceKey?: string;
  contractId: string;
  orderId: string;
  contractItemId: string;
  category: string;
  amount: string;
  expenseDate: string;
  evidenceRef: string;
  remark: string;
}
export interface AllocationDraft {
  entityId: string;
  amount: string;
  percentage: string;
}
export interface GroupDraft {
  sourceLineId: string;
  mode: 'AMOUNT' | 'PERCENT';
  baseAmount?: string;
  allocations: AllocationDraft[];
}
export interface FinanceDraft {
  name: string;
  contractId: string;
  orderId: string;
  currency: string;
  amount: string;
  payerEntityId: string;
  remark: string;
  evidenceRefs: string[];
  planId: string;
  periodId: string;
  dueDate: string;
  payeeName: string;
  payeeAccount: string;
  agencyReason: string;
  advanceUserName: string;
  sourceDocumentId: string;
  paidAt: string;
  payerAccount: string;
  sourceType: 'PURCHASE_ORDER' | 'REIMBURSEMENT';
  costScope: 'ORDER' | 'PRODUCT';
  costDate: string;
  taxTreatment: string;
  policyVersion: string;
  periods: PeriodDraft[];
  expenses: ExpenseDraft[];
  groups: GroupDraft[];
}
const strings = [
  'name',
  'contractId',
  'orderId',
  'currency',
  'amount',
  'payerEntityId',
  'remark',
  'planId',
  'periodId',
  'dueDate',
  'payeeName',
  'payeeAccount',
  'agencyReason',
  'advanceUserName',
  'sourceDocumentId',
  'paidAt',
  'payerAccount',
  'costDate',
  'taxTreatment',
  'policyVersion',
] as const;
export function newExpense(): ExpenseDraft {
  return {
    contractId: '',
    orderId: '',
    contractItemId: '',
    category: 'TRANSPORT',
    amount: '',
    expenseDate: '',
    evidenceRef: '',
    remark: '',
  };
}
export function newGroup(): GroupDraft {
  return {
    sourceLineId: '',
    mode: 'AMOUNT',
    allocations: [{ entityId: '', amount: '', percentage: '' }],
  };
}
export function financeDraft(
  value: Record<string, unknown> = {},
): FinanceDraft {
  const result = Object.fromEntries(
    strings.map((key) => [key, String(value[key] ?? '')]),
  ) as unknown as FinanceDraft;
  result.currency ||= 'CNY';
  result.sourceType =
    value.sourceType === 'REIMBURSEMENT' ? 'REIMBURSEMENT' : 'PURCHASE_ORDER';
  result.costScope = value.costScope === 'PRODUCT' ? 'PRODUCT' : 'ORDER';
  result.evidenceRefs = Array.isArray(value.evidenceRefs)
    ? value.evidenceRefs.map(String)
    : [];
  result.periods = (Array.isArray(value.periods) ? value.periods : []).map(
    (row) => ({
      ...row,
      amount: String(row.amount ?? ''),
      dueDate: row.dueDate ?? '',
      condition: row.condition ?? '',
    }),
  );
  result.expenses = (Array.isArray(value.expenses) ? value.expenses : []).map(
    (row) => ({ ...newExpense(), ...row, amount: String(row.amount ?? '') }),
  );
  result.groups = (Array.isArray(value.groups) ? value.groups : []).map(
    (row) => ({
      ...newGroup(),
      ...row,
      baseAmount:
        row.baseAmount === undefined ? undefined : String(row.baseAmount),
      allocations: (row.allocations ?? []).map(
        (entry: Record<string, unknown>) => ({
          entityId: String(entry.entityId ?? ''),
          amount: String(entry.amount ?? ''),
          percentage: String(entry.percentage ?? ''),
        }),
      ),
    }),
  );
  return result;
}
export function financePayload(
  type: ProcurementFinanceType,
  value: FinanceDraft,
): Record<string, unknown> {
  const base = {
    name: value.name,
    contractId: value.contractId || undefined,
    orderId: value.orderId || undefined,
    currency: value.currency,
    payerEntityId: value.payerEntityId || undefined,
    remark: value.remark,
    evidenceRefs: value.evidenceRefs,
  };
  if (type === 'PAYMENT_PLAN')
    return {
      ...base,
      periods: value.periods.map((period) => ({
        id: period.id,
        name: period.name,
        condition: period.condition,
        amount: period.amount || undefined,
        dueDate: period.dueDate || undefined,
        payerEntityId: period.payerEntityId || undefined,
      })),
    };
  if (type === 'REQUEST')
    return {
      ...base,
      planId: value.planId || undefined,
      periodId: value.periodId || undefined,
      amount: value.amount || undefined,
      dueDate: value.dueDate || undefined,
      payeeName: value.payeeName,
      payeeAccount: value.payeeAccount,
      agencyReason: value.agencyReason,
    };
  if (type === 'PAYMENT')
    return {
      ...base,
      sourceDocumentId: value.sourceDocumentId,
      amount: value.amount || undefined,
      paidAt: value.paidAt || undefined,
      payerAccount: value.payerAccount,
      payeeName: value.payeeName,
      payeeAccount: value.payeeAccount,
    };
  if (type === 'REIMBURSEMENT')
    return {
      ...base,
      advanceUserName: value.advanceUserName,
      payeeName: value.payeeName,
      payeeAccount: value.payeeAccount,
      expenses: value.expenses.map((row) => ({
        id: row.id,
        sourceKey: row.sourceKey,
        category: row.category,
        evidenceRef: row.evidenceRef,
        remark: row.remark,
        amount: row.amount || undefined,
        contractId: row.contractId || undefined,
        orderId: row.orderId || undefined,
        contractItemId: row.contractItemId || undefined,
        expenseDate: row.expenseDate || undefined,
      })),
    };
  return {
    ...base,
    sourceType: value.sourceType,
    sourceDocumentId: value.sourceDocumentId || undefined,
    costScope: value.costScope,
    costDate: value.costDate || undefined,
    taxTreatment: value.taxTreatment,
    policyVersion: value.policyVersion,
    groups: value.groups.map((group) => ({
      sourceLineId: group.sourceLineId || undefined,
      mode: group.mode,
      allocations: group.allocations.map((row) => ({
        entityId: row.entityId,
        ...(group.mode === 'AMOUNT'
          ? { amount: row.amount || undefined }
          : { percentage: row.percentage || undefined }),
      })),
    })),
  };
}
export function allocationDifference(group: GroupDraft, baseAmount?: unknown) {
  const base = new BigNumber(String(baseAmount ?? group.baseAmount ?? 0));
  let total = new BigNumber(0);
  for (const row of group.allocations)
    total = total.plus(
      group.mode === 'AMOUNT' ? row.amount || 0 : row.percentage || 0,
    );
  const difference = (
    group.mode === 'AMOUNT' ? base : new BigNumber(100)
  ).minus(total);
  return difference.isFinite()
    ? difference.toFixed(difference.decimalPlaces() ?? 0)
    : '无效数字';
}
export function payableBalance(record: ProcurementFinanceRecord) {
  return String(record.summary?.availablePaymentAmount ?? '未计算');
}
export function financeRecordRoute(record: ProcurementFinanceRecord) {
  return {
    path: financeRoutes[record.type],
    query: {
      financeId: record.id,
      ...(record.type === 'PAYMENT_PLAN' ? { type: 'PAYMENT_PLAN' } : {}),
      ...(record.contractId ? { contractId: record.contractId } : {}),
      ...(record.orderId ? { orderId: record.orderId } : {}),
    },
  };
}

export function financeStatus(value: unknown) {
  return (
    (
      {
        DRAFT: '草稿',
        SUBMITTED: '待审批',
        APPROVED: '已批准',
        REJECTED: '已退回',
        CONFIRMED: '已确认',
        CANCELLED: '已取消',
        REVERSED: '已冲销',
        PARTIALLY_REVERSED: '部分退款 / 冲销',
      } as Record<string, string>
    )[String(value)] ?? String(value ?? '—')
  );
}
export function allocationPreview(
  group: GroupDraft,
  baseValue: unknown,
  currency: string,
) {
  const base = new BigNumber(String(baseValue ?? group.baseAmount ?? 0));
  let scale = 2;
  try {
    scale =
      new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    scale = 2;
  }
  let sum = new BigNumber(0);
  let percentages = new BigNumber(0);
  for (const entry of group.allocations)
    percentages = percentages.plus(entry.percentage || 0);
  return group.allocations.map((entry, index) => {
    const raw =
      group.mode === 'PERCENT'
        ? base
            .multipliedBy(entry.percentage || 0)
            .dividedBy(100)
            .decimalPlaces(scale, BigNumber.ROUND_HALF_UP)
        : new BigNumber(entry.amount || 0);
    const amount =
      group.mode === 'PERCENT' &&
      index === group.allocations.length - 1 &&
      percentages.eq(100)
        ? base.minus(sum)
        : raw;
    sum = sum.plus(amount);
    const percentage =
      group.mode === 'PERCENT'
        ? new BigNumber(entry.percentage || 0)
        : base.isZero()
          ? new BigNumber(0)
          : amount.multipliedBy(100).dividedBy(base).decimalPlaces(8);
    return {
      amount: amount.isFinite() ? amount.toFixed(scale) : '—',
      percentage: percentage.isFinite()
        ? percentage.toFixed(percentage.decimalPlaces() ?? 0)
        : '—',
      roundingAdjustment: amount.minus(raw).isFinite()
        ? amount.minus(raw).toFixed(scale)
        : '—',
    };
  });
}
export function currencyScale(currency: string) {
  try {
    return (
      new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}
export function procurementLineAmount(
  line: Record<string, unknown>,
  currency = 'CNY',
) {
  const amount = new BigNumber(String(line.quantity ?? 0))
    .minus(String(line.cancelledQuantity ?? 0))
    .multipliedBy(String(line.unitPrice ?? 0));
  return amount.toFixed(currencyScale(currency), BigNumber.ROUND_HALF_UP);
}
export function procurementOrderAmount(
  lines: Record<string, unknown>[],
  currency: string,
) {
  let total = new BigNumber(0);
  for (const line of lines)
    total = total.plus(procurementLineAmount(line, currency));
  return total.toFixed(currencyScale(currency));
}
export function hasPayableBalance(value: unknown) {
  const amount = new BigNumber(String(value ?? 0));
  return amount.isFinite() && amount.gt(0);
}

export function allocationGroupsAfterSourceChange(
  groups: GroupDraft[],
  previousId: string,
  nextId: string,
) {
  return previousId === nextId ? groups : [newGroup()];
}
