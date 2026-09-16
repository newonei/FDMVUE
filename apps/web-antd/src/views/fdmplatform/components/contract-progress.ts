import type { Contract } from '#/api/fdmplatform';
import type { ContractRelatedSummary } from '#/api/fdmplatform/contract-progress';

import BigNumber from 'bignumber.js';

import { rows } from '../data';
import { nativeMoney } from '../documents/migration-display';
import { shipmentKind } from '../documents/model';
import {
  invoiceFinanceDescription,
  receiptFinanceDescription,
  receiptStatusDescription,
} from './finance-progress';

function decimal(value: unknown): BigNumber | undefined {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    String(value).trim() === ''
  )
    return undefined;
  const number = new BigNumber(String(value));
  return number.isFinite() && !number.isNegative() ? number : undefined;
}
function text(value: BigNumber | undefined) {
  return value?.toFixed(value.decimalPlaces() ?? 0);
}
export function contractItemProgress(contract: Contract | undefined) {
  return (contract?.items ?? []).map((item) => {
    const quantity = decimal(item.quantity);
    let requested = new BigNumber(0);
    let requestsKnown = Array.isArray(contract?.requests);
    for (const request of contract?.requests ?? []) {
      if (request.status === 'CANCELLED') continue;
      if (request.status !== 'ACTIVE') requestsKnown = false;
      if (!Array.isArray(request.items)) requestsKnown = false;
      for (const line of rows(request.items)) {
        if (line.contractItemId !== item.id) continue;
        const value = decimal(line.quantity);
        if (!value || value.isZero()) requestsKnown = false;
        else requested = requested.plus(value);
      }
    }
    // Missing opening balance is the existing zero default; an explicit invalid value is unknown.
    let shipped = decimal(
      item.openingShippedQuantity === undefined
        ? 0
        : item.openingShippedQuantity,
    );
    let shipmentsKnown = Array.isArray(contract?.shipments);
    for (const shipment of contract?.shipments ?? []) {
      if (shipment.contractItemId !== item.id) continue;
      const value = decimal(shipment.quantity);
      if (!value || value.isZero()) shipmentsKnown = false;
      else if (shipped)
        shipped = shipped.plus(
          value.multipliedBy(shipmentKind(shipment) === 'RETURN' ? -1 : 1),
        );
    }
    if (!shipmentsKnown || shipped?.isNegative()) shipped = undefined;
    const ordered = quantity?.isGreaterThan(0) ? quantity : undefined;
    const remaining =
      ordered && requestsKnown
        ? BigNumber.maximum(ordered.minus(requested), 0)
        : undefined;
    return {
      ...item,
      requestedQuantity: requestsKnown ? text(requested) : undefined,
      remainingRequestQuantity: text(remaining),
      shippedQuantity: text(shipped),
      quantityProgressKnown: !!ordered && !!shipped,
      deliveryComplete:
        !!ordered && !!shipped && shipped.isGreaterThanOrEqualTo(ordered),
    };
  });
}
export function contractRelatedStages(
  summary: ContractRelatedSummary | undefined,
  contract: Contract | undefined,
) {
  return [
    {
      name: '采购申请',
      value: summary
        ? `${summary.requests.total} 份（有效 ${summary.requests.active} 份）`
        : '暂未读取',
    },
    {
      name: '采购执行',
      value: summary
        ? `${summary.purchaseOrders.received} / ${summary.purchaseOrders.total} 单到货`
        : '暂未读取',
    },
    {
      name: '发货单',
      value: summary ? `${summary.shipments.total} 份` : '暂未读取',
    },
    {
      name: '关联回款',
      value: summary
        ? summary.receipts.statusBreakdownAvailable === false
          ? '未读取或当前不可见'
          : `${summary.receipts.total} 笔`
        : '暂未读取',
      description: `${receiptStatusDescription(summary?.receipts)}；${receiptFinanceDescription(contract?.financeSummary, contract?.currency, nativeMoney)}`,
    },
    {
      name: '关联发票',
      value: summary ? `${summary.invoices.total} 份` : '暂未读取',
      description: invoiceFinanceDescription(
        contract?.financeSummary,
        contract?.currency,
        nativeMoney,
      ),
    },
  ];
}
