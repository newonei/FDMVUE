import type { ProcurementOrderRow } from '#/api/fdmplatform/procurement';

import BigNumber from 'bignumber.js';

import { purchaseRowLabels } from './model';

/** 列表批量操作的一张采购单：独立采购单 contractId 为空。 */
export interface BatchOrder {
  key: string;
  contractId: string;
  orderId: string;
  code: string;
  supplierId?: string;
  supplierName: string;
  currency: string;
  unpaid: string;
  ended: boolean;
}

/** 金智迁入的历史单（补齐页）不参与批量操作。 */
export function batchSelectable(row: ProcurementOrderRow) {
  return !row.standaloneId || row.nativeStandalone === true;
}

export function batchOrders(rows: ProcurementOrderRow[]): BatchOrder[] {
  return rows
    .filter((row) => batchSelectable(row))
    .map((row) => {
      const labels = purchaseRowLabels(row);
      return {
        key: String(row.standaloneId ?? row.id),
        contractId: row.standaloneId ? '' : String(row.contractId ?? ''),
        orderId: String(row.standaloneId ?? row.id),
        code: labels.order,
        supplierId: labels.supplierId,
        supplierName: labels.supplier,
        currency: String(row.record?.currency ?? 'CNY'),
        unpaid: String(row.unpaidAmount ?? '0'),
        ended: row.operationStatus === 'ENDED',
      };
    });
}

/**
 * 集中请款、转入库要求同一供应商、同一币种（一张付款对应一个收款方）；结束不限制。
 * 返回不能一起办的原因，空串表示可以。
 */
export function batchProblem(
  orders: BatchOrder[],
  mode: 'end' | 'request' | 'stockIn',
) {
  if (orders.length === 0) return '请先勾选采购单';
  const active = orders.filter((order) => !order.ended);
  if (active.length === 0) return '选中的采购单都已结束';
  if (mode === 'end') return '';
  if (new Set(active.map((order) => order.supplierId)).size > 1)
    return '一次只能办理同一家供应商的采购单';
  if (new Set(active.map((order) => order.currency)).size > 1)
    return '选中的采购单币种不同，请分开办理';
  if (
    mode === 'request' &&
    !active.some((order) => new BigNumber(order.unpaid).gt(0))
  )
    return '选中的采购单都已付清';
  return '';
}

export interface RequestForm {
  payerEntityId?: string;
  payeeName?: string;
  payeeAccount?: string;
  remark?: string;
  evidence?: string;
  agencyReason?: string;
}

export function requestFormProblem(
  form: RequestForm,
  amounts: Record<string, string | undefined>,
) {
  if (!form.payerEntityId) return '请选择付款主体';
  if (!form.payeeName?.trim()) return '请填写收款方';
  if (!form.payeeAccount?.trim()) return '请填写收款账户';
  if (!form.remark?.trim()) return '请填写请款说明';
  if (!form.evidence?.trim()) return '请填写凭据编号（合同号、对账单号等）';
  const positive = Object.values(amounts).filter((value) =>
    new BigNumber(value ?? '').gt(0),
  );
  if (positive.length === 0) return '至少一张采购单的本次请款金额大于 0';
  return '';
}

/** 每张采购单一张请款单（和单张请款同一规则），金额为 0 或空的跳过。 */
export function requestPayloads(
  orders: BatchOrder[],
  amounts: Record<string, string | undefined>,
  form: RequestForm,
) {
  return orders
    .filter(
      (order) => !order.ended && new BigNumber(amounts[order.key] ?? '').gt(0),
    )
    .map((order) => ({
      order,
      payload: {
        contractId: order.contractId,
        orderId: order.orderId,
        name: `${order.code} 货款`,
        amount: amounts[order.key]!,
        payerEntityId: form.payerEntityId,
        payeeName: form.payeeName?.trim(),
        payeeAccount: form.payeeAccount?.trim(),
        remark: form.remark?.trim(),
        evidenceRefs: [`external:${form.evidence!.trim()}`],
        ...(form.agencyReason?.trim()
          ? { agencyReason: form.agencyReason.trim() }
          : {}),
      },
    }));
}
