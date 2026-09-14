import type { Contract } from '#/api/fdmplatform';
import type { ContractRelatedSummary } from '#/api/fdmplatform/contract-progress';

import BigNumber from 'bignumber.js';

import { rows } from '../data';
import { nativeMoney } from '../documents/migration-display';
import { shipmentKind } from '../documents/model';

function decimal(value: unknown) {
  const number = new BigNumber(String(value ?? 0));
  return number.isFinite() ? number : new BigNumber(0);
}
function text(value: BigNumber) {
  return value.toFixed(value.decimalPlaces() ?? 0);
}
export function contractItemProgress(contract: Contract | undefined) {
  return (contract?.items ?? []).map((item) => {
    let requested = new BigNumber(0);
    for (const request of contract?.requests ?? []) {
      if (request.status === 'CANCELLED') continue;
      for (const line of rows(request.items)) {
        if (line.contractItemId === item.id)
          requested = requested.plus(decimal(line.quantity));
      }
    }
    let shipped = decimal(item.openingShippedQuantity);
    for (const shipment of contract?.shipments ?? []) {
      if (shipment.contractItemId !== item.id) continue;
      shipped = shipped.plus(
        decimal(shipment.quantity).multipliedBy(
          shipmentKind(shipment) === 'RETURN' ? -1 : 1,
        ),
      );
    }
    return {
      ...item,
      requestedQuantity: text(requested),
      shippedQuantity: text(shipped),
      deliveryComplete: shipped.isGreaterThanOrEqualTo(decimal(item.quantity)),
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
      value: summary ? `${summary.receipts.total} 笔` : '暂未读取',
      description: `已入账确认金额：${nativeMoney(contract?.financeSummary?.confirmedReceipts, contract?.currency)}`,
    },
    {
      name: '关联发票',
      value: summary ? `${summary.invoices.total} 份` : '暂未读取',
      description: `已入账有效金额：${nativeMoney(contract?.financeSummary?.effectiveInvoices, contract?.currency)}`,
    },
  ];
}
