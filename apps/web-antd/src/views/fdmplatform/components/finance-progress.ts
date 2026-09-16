/** Pure display policy: amounts always come from the server ledger summary. */
export type MoneyFormatter = (value: unknown, currency: unknown) => string;
type Summary = Record<string, unknown> | undefined;

function validAmount(value: unknown): value is number | string {
  if (typeof value === 'number') return Number.isFinite(value);
  return (
    typeof value === 'string' &&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) &&
    Number.isFinite(Number(value))
  );
}

function amountText(
  summary: Summary,
  key: string,
  currency: unknown,
  formatMoney: MoneyFormatter,
): string {
  if (!summary) return '未读取或当前不可见';
  if (
    summary.complete === false ||
    (Array.isArray(summary.issues) && summary.issues.length > 0)
  )
    return '待核对';
  if (!validAmount(summary[key])) return '待核对';
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))
    return '币种待核对';
  return formatMoney(summary[key], currency);
}

export function receiptFinanceDescription(
  summary: Summary,
  currency: unknown,
  formatMoney: MoneyFormatter,
) {
  const fields = [
    ['pendingReceipts', '待确认金额'],
    ['confirmedReceipts', '已确认净回款'],
    ['boundAmount', '已核销发票金额'],
    ['unpaidAmount', '合同未回款'],
    ['overpaidAmount', '合同超收金额'],
  ] as const;
  return `${fields.map(([key, label]) => `${label}：${amountText(summary, key, currency, formatMoney)}`).join('；')}。登记笔数不等于入账金额；净回款已考虑退款/冲销，发票核销不等于跨订单分配。`;
}

export function invoiceFinanceDescription(
  summary: Summary,
  currency: unknown,
  formatMoney: MoneyFormatter,
) {
  return [
    ['effectiveInvoices', '有效发票净额'],
    ['boundAmount', '已核销金额'],
    ['unboundInvoiceAmount', '发票未核销金额'],
  ]
    .map(
      ([key, label]) =>
        `${label}：${amountText(summary, key!, currency, formatMoney)}`,
    )
    .join('；');
}

/** Unknown, unauthorized, or mixed-version responses must not become zero counts. */
export function receiptStatusDescription(
  counts:
    | undefined
    | {
        confirmed?: number;
        other?: number;
        pending?: number;
        statusBreakdownAvailable?: boolean;
        total: number;
      },
): string {
  if (!counts || counts.statusBreakdownAvailable !== true)
    return '状态明细未读取或当前不可见';
  const values = [counts.total, counts.pending, counts.confirmed, counts.other];
  if (values.some((value) => !Number.isSafeInteger(value) || Number(value) < 0))
    return '状态统计待核对';
  const pending = counts.pending!;
  const confirmed = counts.confirmed!;
  const other = counts.other!;
  if (pending + confirmed + other !== counts.total) return '状态统计待核对';
  return `待确认 ${pending} 笔 / 已确认 ${confirmed} 笔 / 其他待核对 ${other} 笔`;
}
