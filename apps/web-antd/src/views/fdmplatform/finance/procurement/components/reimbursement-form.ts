import type { ExpenseDraft, FinanceDraft } from '../model';

import BigNumber from 'bignumber.js';

import {
  currencyScale,
  financeDraft,
  financePayload,
  newExpense,
} from '../model';

export interface ReimbursementLine extends ExpenseDraft {
  localKey: string;
  pendingFile?: File;
}
export interface ReimbursementDraft extends FinanceDraft {
  expenseEntityId: string;
  expenses: ReimbursementLine[];
}
export interface ReimbursementError {
  field: string;
  message: string;
}
export function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function reimbursementLine(
  key: string,
  source: Partial<ExpenseDraft> = {},
): ReimbursementLine {
  return {
    ...newExpense(),
    expenseDate: localDate(),
    ...source,
    localKey: key,
  };
}
export function reimbursementDraft(
  source: Record<string, unknown>,
  nextKey: () => string,
): ReimbursementDraft {
  const draft = financeDraft(source);
  return {
    ...draft,
    expenseEntityId: String(source.expenseEntityId ?? ''),
    expenses:
      draft.expenses.length > 0
        ? draft.expenses.map((line) => reimbursementLine(nextKey(), line))
        : [
            reimbursementLine(nextKey(), {
              contractId: draft.contractId,
              orderId: draft.orderId,
            }),
          ],
  };
}
export function copyReimbursementLine(
  line: ReimbursementLine,
  key: string,
): ReimbursementLine {
  return {
    ...line,
    localKey: key,
    id: undefined,
    sourceKey: undefined,
    evidenceRef: '',
    pendingFile: undefined,
  };
}
export function reimbursementFiles(draft: ReimbursementDraft) {
  return draft.expenses.flatMap((line) =>
    line.pendingFile ? [line.pendingFile] : [],
  );
}
export function reimbursementPayload(
  draft: ReimbursementDraft,
): Record<string, unknown> {
  const payload = financePayload('REIMBURSEMENT', draft);
  let fileIndex = 0;
  return {
    ...payload,
    currency: draft.currency.trim().toUpperCase(),
    expenseEntityId: draft.expenseEntityId || undefined,
    expenses: (payload.expenses as Record<string, unknown>[]).map(
      (line, index) => ({
        ...line,
        ...(draft.expenses[index]?.pendingFile
          ? { evidenceRef: '', evidenceFileIndex: fileIndex++ }
          : {}),
      }),
    ),
  };
}
export function reimbursementTotal(draft: ReimbursementDraft) {
  let total = new BigNumber(0);
  for (const line of draft.expenses) {
    const amount = new BigNumber(line.amount || 0);
    if (
      !amount.isFinite() ||
      amount.isNegative() ||
      (amount.decimalPlaces() ?? 0) > currencyScale(draft.currency)
    )
      return '—';
    total = total.plus(amount);
  }
  return total.toFixed(currencyScale(draft.currency));
}
export function validateReimbursement(
  draft: ReimbursementDraft,
  submit: boolean,
  today = localDate(),
): ReimbursementError | undefined {
  const missing = (field: string, message: string) => ({ field, message });
  if (!/^[A-Z]{3}$/.test(draft.currency.trim().toUpperCase()))
    return missing('currency', '请选择报销币种');
  if (submit) {
    if (!draft.name.trim()) return missing('name', '请填写报销主题');
    if (!draft.expenseEntityId)
      return missing('expenseEntityId', '请选择费用所属公司');
    if (draft.expenses.length === 0)
      return missing('expenses', '请添加至少一项费用');
  }
  for (const [index, line] of draft.expenses.entries()) {
    const fail = (field: string, text: string) =>
      missing(
        `line-${line.localKey}-${field}`,
        `第 ${index + 1} 项费用：${text}`,
      );
    const amount = new BigNumber(line.amount);
    if ((submit || line.amount) && (!amount.isFinite() || !amount.gt(0)))
      return fail('amount', '金额须大于零');
    if (
      amount.isFinite() &&
      (amount.decimalPlaces() ?? 0) > currencyScale(draft.currency)
    )
      return fail(
        'amount',
        `${draft.currency} 金额最多保留 ${currencyScale(draft.currency)} 位小数`,
      );
    if (submit && !line.expenseDate) return fail('date', '请选择费用日期');
    if (line.expenseDate && line.expenseDate > today)
      return fail('date', '费用日期不能晚于今天');
    if (
      submit &&
      ![
        'CUSTOMIZATION',
        'LABOR',
        'PACKAGING',
        'PRODUCTION',
        'RETURN_LOSS',
        'TRANSPORT',
      ].includes(line.category)
    )
      return fail('category', '请选择有效费用类别；采购货款请使用采购请款');
    if (submit && line.contractId && !line.contractItemId)
      return fail('product', '关联合同时请选择归属产品');
    if (submit && !line.evidenceRef && !line.pendingFile)
      return fail('file', '请上传或选择一份报销凭证');
  }
  if (submit) {
    if (!draft.payerEntityId) return missing('payerEntityId', '请选择付款公司');
    if (!draft.advanceUserName.trim())
      return missing('advanceUserName', '请填写实际垫付人');
    if (!draft.payeeName.trim()) return missing('payeeName', '请填写收款人');
    if (!draft.payeeAccount.trim())
      return missing('payeeAccount', '请填写收款账户');
  }
}
