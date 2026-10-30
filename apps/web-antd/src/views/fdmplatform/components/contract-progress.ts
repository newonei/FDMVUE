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
  let receiptsValue = '暂未读取';
  if (summary) {
    receiptsValue =
      summary.receipts.statusBreakdownAvailable === false
        ? '未读取或当前不可见'
        : `${summary.receipts.total} 笔`;
  }
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
      value: receiptsValue,
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

export function contractDeliveryStatus(contract: Contract | undefined) {
  const items = contractItemProgress(contract);
  if (items.length === 0 || items.some((item) => !item.quantityProgressKnown))
    return '待核对';
  if (items.every((item) => item.deliveryComplete)) return '已发齐';
  if (
    items.some((item) =>
      new BigNumber(item.shippedQuantity ?? 0).isGreaterThan(0),
    )
  )
    return '部分发货';
  return '未发货';
}

/** 每行产品的 申请 → 下单 → 到货 → 发货 数量；外采按采购单（扣取消、退货），自制按完工，库存按分派。 */
export function contractItemPipeline(contract: Contract | undefined) {
  const orders = (contract?.purchaseOrders ?? []).filter(
    (order) => order.status !== 'CANCELLED',
  );
  const lines = orders.flatMap((order) => rows(order.lines));
  const own = (contract?.assignments ?? []).filter(
    (assignment) =>
      assignment.status !== 'CANCELLED' &&
      ['MAKE', 'STOCK'].includes(String(assignment.method)),
  );
  const produced = (assignmentId: unknown) => {
    let completed = new BigNumber(0);
    for (const progress of rows(contract?.productionProgress))
      if (progress.assignmentId === assignmentId) {
        const value = decimal(progress.completedQuantity);
        if (value) completed = BigNumber.maximum(completed, value);
      }
    return completed;
  };
  return contractItemProgress(contract).map((item) => {
    let ordered = new BigNumber(0);
    let arrived = new BigNumber(0);
    for (const line of lines) {
      if (line.contractItemId !== item.id) continue;
      ordered = ordered
        .plus(decimal(line.quantity) ?? 0)
        .minus(decimal(line.cancelledQuantity) ?? 0);
      arrived = arrived
        .plus(decimal(line.arrivedQuantity) ?? 0)
        .minus(decimal(line.returnedQuantity) ?? 0);
    }
    for (const assignment of own) {
      if (assignment.contractItemId !== item.id) continue;
      const quantity = decimal(assignment.quantity) ?? new BigNumber(0);
      ordered = ordered.plus(quantity);
      arrived = arrived.plus(
        assignment.method === 'STOCK' ? quantity : produced(assignment.id),
      );
    }
    const unitPrice = decimal(item.unitPrice);
    const quantity = decimal(item.quantity);
    return {
      ...item,
      orderedQuantity: text(ordered),
      arrivedQuantity: text(arrived),
      lineAmount:
        unitPrice && quantity
          ? quantity.multipliedBy(unitPrice).toFixed(2)
          : undefined,
    };
  });
}
