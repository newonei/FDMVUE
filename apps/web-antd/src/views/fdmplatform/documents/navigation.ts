import type { DocumentKind } from './model';

import type { BusinessRecord, Contract, DocumentRow } from '#/api/fdmplatform';

import { rows } from '../data';
import {
  currentDocument,
  documentDefinitions,
  receiptKind,
  shipmentKind,
} from './model';

export type RelatedTarget =
  | {
      contractId: string;
      documentId: string;
      kind: DocumentKind;
      type: 'document';
    }
  | { contractId: string; documentId: string; type: 'customs' }
  | { contractId: string; type: 'contract' }
  | { eventId?: string; poolId: string; type: 'stock' }
  | { id: string; type: 'customer' | 'product' | 'supplier' }
  | { id: string; type: 'procurementFinance' }
  | { kind: DocumentKind; standaloneId: string; type: 'businessDocument' }
  | { recordType: string; standaloneId: string; type: 'businessRecord' };
export interface RelatedLink {
  label: string;
  value: string;
  target: RelatedTarget;
}
export function referenceId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
export function entityTarget(
  type: 'customer' | 'product' | 'supplier',
  id: unknown,
): RelatedTarget | undefined {
  const value = referenceId(id);
  return value ? { type, id: value } : undefined;
}
export function contractTarget(id: unknown): RelatedTarget | undefined {
  const contractId = referenceId(id);
  return contractId ? { type: 'contract', contractId } : undefined;
}
export function documentTarget(
  kind: DocumentKind,
  contractId: unknown,
  id: unknown,
): RelatedTarget | undefined {
  const parent = referenceId(contractId);
  const documentId = referenceId(id);
  return parent && documentId
    ? { type: 'document', kind, contractId: parent, documentId }
    : undefined;
}
const nativeRoutes: Record<
  string,
  { path: string; query?: Record<string, string> }
> = {
  PURCHASE_REQUEST: { path: '/fdmwaimao/platform-requests' },
  PURCHASE_ORDER: { path: '/fdmprocurement/platform-orders' },
  ARRIVAL: { path: '/fdmprocurement/platform-arrivals' },
  SHIPMENT: { path: '/fdmwaimao/platform-shipments' },
  RECEIPT: { path: '/caiwu/platform-receipts' },
  REFUND: { path: '/caiwu/platform-refunds' },
  SALES_INVOICE: { path: '/caiwu/platform-invoices' },
  PURCHASE_INVOICE: {
    path: '/caiwu/platform-invoices',
    query: { invoiceType: 'PURCHASE' },
  },
  PURCHASE_PAYMENT: { path: '/caiwu/platform-procurement-payments' },
  STOCK_IN: {
    path: '/gongchang/platform-stock',
    query: { inventoryType: 'stock-ins' },
  },
  STOCK_OUT: {
    path: '/gongchang/platform-stock',
    query: { inventoryType: 'stock-outs' },
  },
  STOCKTAKE: {
    path: '/gongchang/platform-stock',
    query: { inventoryType: 'stocktakes' },
  },
};
export function businessRecordTarget(
  recordType: unknown,
  id: unknown,
): RelatedTarget | undefined {
  const standaloneId = referenceId(id);
  return typeof recordType === 'string' &&
    nativeRoutes[recordType] &&
    standaloneId
    ? { type: 'businessRecord', recordType, standaloneId }
    : undefined;
}
export function businessDocumentTarget(
  kind: DocumentKind,
  id: unknown,
): RelatedTarget | undefined {
  const standaloneId = referenceId(id);
  return standaloneId
    ? { type: 'businessDocument', kind, standaloneId }
    : undefined;
}
export function standaloneLocation(
  query: Record<string, unknown>,
): string | undefined {
  const id = referenceId(query.standaloneId);
  if (query.standaloneId !== undefined && !id)
    throw new Error('单据链接无效，请从单据列表重新打开');
  if (id && query.documentId !== undefined)
    throw new Error('单据链接包含冲突的定位，请从单据列表重新打开');
  return id;
}
export function stockTarget(
  poolId: unknown,
  eventId?: unknown,
): RelatedTarget | undefined {
  const pool = referenceId(poolId);
  const event = referenceId(eventId);
  if (!pool || (eventId !== undefined && !event)) return undefined;
  return { type: 'stock', poolId: pool, ...(event ? { eventId: event } : {}) };
}
export function navigationRoute(target: RelatedTarget): {
  path: string;
  query: Record<string, string>;
} {
  if (target.type === 'procurementFinance')
    return {
      path: '/caiwu/platform-procurement-payments',
      query: { financeId: target.id },
    };
  if (target.type === 'businessRecord') {
    const location = nativeRoutes[target.recordType];
    if (!location) throw new Error('没有可用的业务单据入口');
    return {
      path: location.path,
      query: { ...location.query, standaloneId: target.standaloneId },
    };
  }
  if (target.type === 'businessDocument')
    return {
      path: documentDefinitions[target.kind].route,
      query: { standaloneId: target.standaloneId },
    };
  if (target.type === 'contract')
    return {
      path: '/fdmwaimao/platform-contracts',
      query: { contractId: target.contractId },
    };
  if (target.type === 'document')
    return {
      path: documentDefinitions[target.kind].route,
      query: {
        contractId: target.contractId,
        documentId: target.documentId,
        ...(target.kind === 'tasks' ? { queue: 'tasks' } : {}),
      },
    };
  if (target.type === 'stock')
    return {
      path: '/gongchang/platform-stock',
      query: {
        poolId: target.poolId,
        ...(target.eventId ? { eventId: target.eventId } : {}),
      },
    };
  if (target.type === 'customs')
    return {
      path: '/fdmprocurement/platform-customs',
      query: { contractId: target.contractId, documentId: target.documentId },
    };
  const paths = {
    customer: '/fdmwaimao/platform-customers',
    supplier: '/fdmprocurement/platform-suppliers',
    product: '/fdmproducts/catalog',
  };
  return {
    path: paths[target.type],
    query: { [`${target.type}Id`]: target.id },
  };
}
export function detailLocation(
  query: Record<string, unknown>,
): undefined | { contractId: string; documentId: string } {
  const documentId = referenceId(query.documentId);
  if (!documentId) {
    if (query.documentId !== undefined)
      throw new Error('单据链接无效，请从关联单据重新打开');
    return undefined;
  }
  const contractId = referenceId(query.contractId);
  if (!contractId)
    throw new Error('单据链接缺少关联合同，请从来源单据重新打开');
  return { contractId, documentId };
}
export function withoutDetailQuery<T extends Record<string, unknown>>(
  query: T,
  key = 'documentId',
) {
  const next = { ...query };
  Reflect.deleteProperty(next, key);
  Reflect.deleteProperty(next, 'standaloneId');
  return next;
}
export function resolveDocumentRow(
  contract: Contract,
  kind: DocumentKind,
  id: string,
): DocumentRow {
  const record = currentDocument(contract, kind, id);
  return {
    id: record.id,
    contractId: contract.id,
    contractCode: contract.code,
    contractName: contract.name,
    contractVersion: contract.version,
    companyId: contract.companyId,
    customerName: contract.customerName,
    contractStatus: contract.status,
    allowedActions: contract.allowedActions,
    record,
  };
}
export function relatedDocumentLinks(
  contract: Contract,
  kind: DocumentKind,
  record: BusinessRecord,
): RelatedLink[] {
  const result: RelatedLink[] = [];
  const added = new Set<string>();
  function add(
    label: string,
    value: unknown,
    target: RelatedTarget | undefined,
  ) {
    if (!target) return;
    const key = JSON.stringify(target);
    if (added.has(key)) return;
    added.add(key);
    result.push({ label, value: String(value || label), target });
  }
  function doc(
    label: string,
    type: DocumentKind,
    id: unknown,
    value?: unknown,
  ) {
    if (type === kind && id === record.id) return;
    add(label, value, documentTarget(type, contract.id, id));
  }
  const find = (list: BusinessRecord[] | undefined, id: unknown) =>
    list?.find((entry) => entry.id === id);
  function item(id: unknown) {
    const line = contract.items.find((entry) => entry.id === id);
    if (line) add('产品', line.skuName, entityTarget('product', line.skuId));
  }
  function request(id: unknown) {
    const current = find(contract.requests, id);
    doc('来源申请', 'requests', id, current?.name);
  }
  function assignment(id: unknown) {
    const current = find(contract.assignments, id);
    doc(
      '来源履约任务',
      'tasks',
      id,
      current
        ? `${contract.items.find((entry) => entry.id === current.contractItemId)?.skuName ?? '履约任务'} · ${current.method === 'BUY' ? '外采' : current.method === 'MAKE' ? '自产' : '库存'} ${current.quantity}`
        : undefined,
    );
    if (current) {
      request(current.requestId);
      item(current.contractItemId);
    }
  }
  function quote(id: unknown) {
    const current = find(contract.quotes, id);
    doc(
      '来源报价',
      'quotes',
      id,
      current
        ? `${current.supplierName} · ${current.currency} ${current.unitPrice}`
        : undefined,
    );
    if (current) {
      add(
        '供应商',
        current.supplierName,
        entityTarget('supplier', current.supplierId),
      );
      assignment(current.assignmentId);
    }
  }
  function plan(id: unknown) {
    const current = find(contract.plans, id);
    doc('来源方案', 'plans', id, current?.name);
    if (current) request(current.requestId);
  }
  function order(id: unknown) {
    const current = find(contract.purchaseOrders, id);
    doc(
      '来源采购单',
      'orders',
      id,
      current?.supplierName ? `${current.supplierName} · 采购单` : undefined,
    );
    if (current) {
      plan(current.planId);
      request(current.requestId);
      add(
        '供应商',
        current.supplierName,
        entityTarget('supplier', current.supplierId),
      );
    }
  }
  add(
    '关联合同',
    `${contract.code} · ${contract.name}`,
    contractTarget(contract.id),
  );
  add(
    '客户',
    contract.customerName,
    entityTarget('customer', contract.customerId),
  );
  request(record.requestId);
  assignment(record.assignmentId);
  quote(record.quoteId);
  plan(record.planId);
  order(record.orderId);
  item(record.contractItemId);
  add(
    '供应商',
    record.supplierName,
    entityTarget('supplier', record.supplierId),
  );
  for (const line of rows(record.lines ?? record.items)) {
    item(line.contractItemId);
    assignment(line.assignmentId);
    quote(line.quoteId);
  }
  if (kind === 'orders') {
    plan(record.planId);
    for (const line of rows(record.lines)) assignment(line.assignmentId);
  }
  if (record.arrivalId) {
    const arrival = find(rows(contract.arrivals), record.arrivalId);
    doc('原到货单', 'arrivals', record.arrivalId, arrival?.batchNo);
    if (arrival) {
      order(arrival.orderId);
      item(arrival.contractItemId);
    }
  }
  if (record.previousQuoteId) quote(record.previousQuoteId);
  if (record.originalShipmentId) {
    const shipment = find(contract.shipments, record.originalShipmentId);
    doc(
      '原发货单',
      'shipments',
      record.originalShipmentId,
      shipment
        ? `发货 ${shipment.quantity} · ${shipment.occurredAt ?? ''}`
        : undefined,
    );
  }
  for (const id of [record.receiptId, record.originalReceiptId]) {
    const receipt = find(contract.finance?.receipts, id);
    doc(
      '关联回款',
      receipt && receiptKind(receipt) !== 'PAYMENT' ? 'refunds' : 'receipts',
      id,
      receipt
        ? `${receipt.receivedAt} · ${receipt.currency} ${receipt.amount}`
        : undefined,
    );
  }
  for (const id of [record.invoiceId, record.originalInvoiceId]) {
    const invoice = find(contract.finance?.invoices, id);
    doc('关联发票', 'invoices', id, invoice?.invoiceNumber);
  }
  if (record.originalAllocationId)
    doc('原核销单', 'allocations', record.originalAllocationId);
  if (record.originalCostId) doc('原成本单', 'costs', record.originalCostId);
  return result;
}
export function customsDocumentLinks(
  contract: Contract,
  batch: BusinessRecord,
): RelatedLink[] {
  const details = (batch.details ?? batch) as Record<string, unknown>;
  const links: RelatedLink[] = [];
  for (const id of Array.isArray(details.purchaseOrderIds)
    ? details.purchaseOrderIds
    : []) {
    const order = contract.purchaseOrders?.find((entry) => entry.id === id);
    const target = documentTarget('orders', contract.id, id);
    if (target)
      links.push({
        label: '关联采购单',
        value: order?.supplierName
          ? `${order.supplierName} · 采购单`
          : '采购单',
        target,
      });
  }
  for (const link of rows(details.shipments)) {
    const shipment = contract.shipments?.find(
      (entry) => entry.eventId === link.eventId,
    );
    const target =
      shipment &&
      documentTarget(
        shipmentKind(shipment) === 'RETURN' ? 'salesReturns' : 'shipments',
        contract.id,
        shipment.id,
      );
    if (target)
      links.push({
        label: '关联发货单',
        value: `发货 ${shipment?.quantity} · ${shipment?.occurredAt ?? ''}`,
        target,
      });
  }
  return links;
}

export function lineTarget(
  contract: Contract | undefined,
  key: string,
  record: Record<string, unknown>,
): RelatedTarget | undefined {
  if (!contract) return undefined;
  const assignment = contract.assignments?.find(
    (entry) => entry.id === record.assignmentId,
  );
  if (['productName', 'skuName'].includes(key)) {
    const item = contract.items.find(
      (entry) =>
        entry.id ===
        (record.contractItemId ?? assignment?.contractItemId ?? record.id),
    );
    return entityTarget('product', record.skuId ?? item?.skuId);
  }
  if (key === 'assignmentName')
    return documentTarget('tasks', contract.id, record.assignmentId);
  if (key === 'supplierName')
    return entityTarget(
      'supplier',
      record.supplierId ??
        contract.quotes?.find((entry) => entry.id === record.quoteId)
          ?.supplierId,
    );
  if (key === 'quoteId')
    return documentTarget('quotes', contract.id, record.quoteId);
  return undefined;
}
