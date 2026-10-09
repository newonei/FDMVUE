import type { FdmgongchangRawPurchaseApi as Api } from '#/api/fdmgongchang/raw-purchase';

import { toNumber } from '../stage-stock/model';

export const STATUS_LABELS: Record<Api.Status, string> = {
  CANCELLED: '已取消',
  CLOSED: '已关闭',
  ORDERED: '已下单',
  PARTIAL: '部分到货',
  RECEIVED: '已到齐',
};

export const STATUS_COLORS: Record<Api.Status, string> = {
  CANCELLED: 'default',
  CLOSED: 'default',
  ORDERED: 'blue',
  PARTIAL: 'orange',
  RECEIVED: 'green',
};

export interface DraftLine {
  key: number;
  quantity?: number;
  rawMaterialCode?: string;
  remark: string;
  unitPrice?: number;
}

let seq = 0;
export function newDraftLine(init: Partial<DraftLine> = {}): DraftLine {
  seq += 1;
  return { key: seq, remark: '', ...init };
}

/** 金额 = 数量 × 单价，四舍五入到分，与后端一致。 */
export function lineAmount(line: Pick<DraftLine, 'quantity' | 'unitPrice'>) {
  if (line.quantity === undefined || line.unitPrice === undefined) return 0;
  return Math.round(line.quantity * line.unitPrice * 100) / 100;
}

export function draftTotal(lines: DraftLine[]) {
  return Math.round(lines.reduce((t, l) => t + lineAmount(l), 0) * 100) / 100;
}

export function formatMoney(value: unknown) {
  const n = toNumber(value);
  if (n === undefined) return '—';
  return n.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

export function validateDraft(input: {
  lines: DraftLine[];
  nameOf: (code: string) => string;
  supplierId?: string;
}) {
  const problems: string[] = [];
  if (!input.supplierId) problems.push('请选择供应商。');
  if (input.lines.length === 0) problems.push('请至少添加一种原材料。');
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    const row = `第 ${index + 1} 行`;
    if (!line.rawMaterialCode) {
      problems.push(`${row}请选择原材料。`);
      return;
    }
    if (seen.has(line.rawMaterialCode))
      problems.push(`${input.nameOf(line.rawMaterialCode)}重复了，请合并成一行。`);
    seen.add(line.rawMaterialCode);
    if (!line.quantity || line.quantity <= 0)
      problems.push(`${row}请填写大于 0 的采购数量。`);
    if (line.unitPrice === undefined || line.unitPrice < 0)
      problems.push(`${row}请填写单价（可以为 0）。`);
  });
  return problems;
}

/** 还没有任何到货的已下单采购单才能修改或取消。 */
export function isUntouched(purchase: Pick<Api.Purchase, 'lines' | 'status'>) {
  return (
    purchase.status === 'ORDERED' &&
    purchase.lines.every((l) => (toNumber(l.receivedQuantity) ?? 0) === 0)
  );
}

/** 部分到货后剩下的不再到货时关闭；还没到货的用取消。 */
export function isClosable(purchase: Pick<Api.Purchase, 'status'>) {
  return purchase.status === 'PARTIAL';
}
