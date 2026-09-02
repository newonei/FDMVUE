import type {
  ContractOrder,
  Customer,
  DemandAnalysis,
  FactoryTask,
  FollowUpTask,
  InboundDocument,
  OrderExpense,
  OutboundDocument,
  Payment,
  PurchaseOrder,
  PurchaseRequisition,
  Receipt,
  Shipment,
  Supplier,
  SupplierInvoice,
  TradePrototypeState,
  WriteOffItem,
} from './domain/types';
import type { TradePageKey, TradePageRow } from './page-config';

import { statusLabel } from './status';

function decimalText(value?: string) {
  if (!value) return '0';
  const [integer = '0', fraction] = value.split('.');
  const withGrouping = integer.replaceAll(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${withGrouping}.${fraction}` : withGrouping;
}

export function moneyText(currency?: string, value?: string) {
  if (!value) return '—';
  return `${currency ?? ''} ${decimalText(value)}`.trim();
}

function dateText(value?: string) {
  if (!value) return undefined;
  const [date, time] = value.split('T');
  return time ? `${date} ${time.slice(0, 5)}` : value;
}

function findCustomer(state: TradePrototypeState, customerId: string) {
  return state.customers.find((customer) => customer.id === customerId);
}

function findOrder(state: TradePrototypeState, orderId: string) {
  return state.orders.find((order) => order.id === orderId);
}

function findSupplier(state: TradePrototypeState, supplierId?: string) {
  if (!supplierId) return undefined;
  return state.suppliers.find((supplier) => supplier.id === supplierId);
}

function raw(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function customerRow(customer: Customer): TradePageRow {
  return {
    id: customer.id,
    primary: customer.name,
    secondary: customer.country,
    source: customer.okkiSerialId
      ? `${customer.okkiSerialId} · ${statusLabel(customer.syncStatus)}`
      : '中台创建',
    amount: customer.transactionAmount,
    currency: 'USD',
    progress: `未回款 ${moneyText('USD', customer.outstandingAmount)} · ${customer.orderCount} 张合同`,
    owner: customer.owner,
    risk: customer.level === 'C' ? 'MEDIUM' : 'LOW',
    status: customer.syncStatus,
    statusLabel: statusLabel(customer.syncStatus),
    raw: raw(customer),
    rawType: 'CUSTOMER',
  };
}

function orderRow(
  state: TradePrototypeState,
  order: ContractOrder,
): TradePageRow {
  const customer = findCustomer(state, order.customerId);
  const analysis = state.demandAnalyses.find(
    (item) => item.orderId === order.id,
  );
  const shipmentCount = state.shipments.filter(
    (item) => item.orderId === order.id,
  ).length;
  const receiptCount = state.receiptAllocations.filter(
    (item) => item.orderId === order.id && item.status === 'CONFIRMED',
  ).length;

  return {
    id: order.id,
    primary: order.id,
    partner: customer?.name ?? order.customerId,
    secondary: order.type === 'BULK' ? '大货订单' : '样品订单',
    amount: order.totalAmount,
    currency: order.currency,
    date: dateText(order.requiredShipAt),
    progress: `回款 ${receiptCount} · 供给 ${statusLabel(analysis?.status)} · 发货 ${shipmentCount} 批`,
    owner: order.owner,
    risk: order.risk,
    status: order.status,
    statusLabel: statusLabel(order.status),
    raw: raw(order),
    rawType: 'ORDER',
  };
}

function demandRow(
  state: TradePrototypeState,
  analysis: DemandAnalysis,
): TradePageRow {
  const order = findOrder(state, analysis.orderId);
  const lineSummary = analysis.lines
    .slice(0, 2)
    .map(
      (line) => `${line.stockQty} / ${line.factoryQty} / ${line.purchaseQty}`,
    )
    .join('；');

  return {
    id: analysis.id,
    primary: analysis.id,
    source: analysis.orderId,
    quantity: `${analysis.lines.length} 个产品行`,
    progress: lineSummary || '等待 AI 生成拆分草稿',
    risk: analysis.status === 'CONFIRMED' ? '数量守恒已通过' : '等待人工确认',
    owner: analysis.confirmedBy ?? order?.owner ?? '外贸业务员',
    date: dateText(analysis.confirmedAt ?? analysis.generatedAt),
    status: analysis.status,
    statusLabel: statusLabel(analysis.status),
    raw: raw(analysis),
    rawType: 'DEMAND_ANALYSIS',
  };
}

function supplierRow(supplier: Supplier): TradePageRow {
  const quote = supplier.quotes[0];
  return {
    id: supplier.id,
    primary: supplier.name,
    secondary: supplier.categories.join('、'),
    amount: quote?.unitPrice,
    currency: quote?.currency,
    date: quote ? `${quote.leadTimeDays} 天` : '—',
    progress: `准时 ${supplier.onTimeRate}% · 合格 ${supplier.qualityRate}%`,
    quantity: supplier.currentLoad,
    risk: supplier.risk,
    status: supplier.status,
    statusLabel: statusLabel(supplier.status),
    raw: raw(supplier),
    rawType: 'SUPPLIER',
  };
}

function requisitionRow(
  state: TradePrototypeState,
  requisition: PurchaseRequisition,
): TradePageRow {
  const selectedSupplierId = requisition.lines.find(
    (line) => line.selectedSupplierId,
  )?.selectedSupplierId;
  const suggestionId = requisition.lines[0]?.suggestions[0]?.supplierId;
  const supplier = findSupplier(state, selectedSupplierId ?? suggestionId);
  return {
    id: requisition.id,
    primary: requisition.id,
    source: requisition.orderId,
    secondary:
      requisition.lines.map((line) => line.productName).join('、') || '—',
    quantity: requisition.lines
      .map((line) => `${line.quantity}${line.unit}`)
      .join('、'),
    partner: supplier?.name ?? '等待采购选择',
    risk: requisition.risk,
    owner: '采购专员',
    date: dateText(requisition.requiredAt),
    status: requisition.status,
    statusLabel: statusLabel(requisition.status),
    raw: raw(requisition),
    rawType: 'PURCHASE_REQUISITION',
  };
}

function purchaseOrderRow(
  state: TradePrototypeState,
  order: PurchaseOrder,
): TradePageRow {
  const supplier = findSupplier(state, order.supplierId);
  return {
    id: order.id,
    primary: order.id,
    partner: supplier?.name ?? order.supplierId,
    source: order.orderId,
    amount: order.totalAmount,
    currency: order.currency,
    date: dateText(order.expectedAt),
    progress: `已付 ${moneyText(order.currency, order.paidAmount)} · 发票 ${moneyText(order.currency, order.invoicedAmount)}`,
    risk: order.status === 'IN_PRODUCTION' ? '关注交期' : 'LOW',
    status: order.status,
    statusLabel: statusLabel(order.status),
    raw: raw(order),
    rawType: 'PURCHASE_ORDER',
  };
}

function followUpRow(task: FollowUpTask): TradePageRow {
  const readyCount = task.customsDocuments.filter(
    (document) => document.status === 'READY',
  ).length;
  return {
    id: task.id,
    primary: task.id,
    source: [...task.purchaseOrderIds, task.shipmentId]
      .filter(Boolean)
      .join('、'),
    secondary: statusLabel(task.stage),
    progress: `${readyCount}/${task.customsDocuments.length} 项资料齐套`,
    risk: task.aiReadinessMessage || statusLabel(task.aiReadiness),
    owner: task.owner,
    date: dateText(task.lastAiCheckedAt),
    status: task.status,
    statusLabel: statusLabel(task.status),
    raw: raw(task),
    rawType: 'FOLLOW_UP_TASK',
  };
}

function factoryTaskRow(
  state: TradePrototypeState,
  task: FactoryTask,
): TradePageRow {
  const order = findOrder(state, task.orderId);
  const line = order?.lines.find((item) => item.id === task.orderLineId);
  return {
    id: task.id,
    primary: task.id,
    source: task.orderId,
    partner: task.factory,
    secondary: line?.productName ?? task.orderLineId,
    quantity: `${task.requiredQty} / ${task.completedQty}`,
    progress: `${task.completedQty} / ${task.requiredQty} ${line?.unit ?? ''}`,
    date: dateText(task.estimatedReadyAt),
    owner: task.owner,
    status: task.status,
    statusLabel: statusLabel(task.status),
    raw: raw(task),
    rawType: 'FACTORY_TASK',
  };
}

function inboundRow(document: InboundDocument): TradePageRow {
  return {
    id: document.id,
    primary: document.id,
    source: document.purchaseOrderId,
    partner: document.warehouse,
    secondary: `${document.items.length} 个采购明细`,
    quantity: document.items.map((item) => item.quantity).join('、'),
    progress: document.receivedAt ? '已完成收货 / 验收' : '等待收货 / 验收',
    date: dateText(document.receivedAt),
    status: document.status,
    statusLabel: statusLabel(document.status),
    raw: raw(document),
    rawType: 'INBOUND_DOCUMENT',
  };
}

function shipmentRow(
  state: TradePrototypeState,
  shipment: Shipment,
): TradePageRow {
  const order = findOrder(state, shipment.orderId);
  const customer = order && findCustomer(state, order.customerId);
  const outboundCount = state.outboundDocuments.filter(
    (document) => document.shipmentId === shipment.id,
  ).length;
  return {
    id: shipment.id,
    primary: shipment.id,
    source: shipment.orderId,
    partner: customer?.name ?? shipment.orderId,
    secondary: shipment.batch,
    quantity: `${shipment.lines.length} 个产品行`,
    progress: `${outboundCount} 张出库单 · 报关 ${statusLabel(shipment.status)}`,
    date: dateText(shipment.etd),
    status: shipment.status,
    statusLabel: statusLabel(shipment.status),
    raw: raw(shipment),
    rawType: 'SHIPMENT',
  };
}

function outboundRow(document: OutboundDocument): TradePageRow {
  return {
    id: document.id,
    primary: document.id,
    source: `${document.orderId} / ${document.shipmentId}`,
    partner: document.location,
    secondary: `${document.items.length} 个产品明细`,
    quantity: document.items.map((item) => item.quantity).join('、'),
    progress: document.confirmedAt ? '库存已扣减' : '等待正式确认',
    date: dateText(document.confirmedAt),
    status: document.status,
    statusLabel: statusLabel(document.status),
    raw: raw(document),
    rawType: 'OUTBOUND_DOCUMENT',
  };
}

function receiptRow(
  state: TradePrototypeState,
  receipt: Receipt,
): TradePageRow {
  const allocations = state.receiptAllocations.filter(
    (item) => item.receiptId === receipt.id,
  );
  return {
    id: receipt.id,
    primary: receipt.id,
    partner: receipt.payer,
    source: allocations.map((item) => item.orderId).join('、') || '待分配',
    amount: receipt.amount,
    currency: receipt.currency,
    secondary: '真实回款',
    progress: `分配 ${allocations.length} 张合同 · CNY ${decimalText(receipt.cnyAmount)}`,
    date: dateText(receipt.receivedAt),
    status: receipt.status,
    statusLabel: statusLabel(receipt.status),
    raw: raw(receipt),
    rawType: 'RECEIPT',
  };
}

function writeOffRow(
  state: TradePrototypeState,
  item: WriteOffItem,
): TradePageRow {
  const order = findOrder(state, item.orderId);
  const customer = order && findCustomer(state, order.customerId);
  return {
    id: item.id,
    primary: item.id,
    partner: customer?.name ?? item.orderId,
    source: item.orderId,
    amount: item.amount,
    currency: order?.currency,
    secondary: writeOffKindLabel(item.kind),
    progress: item.remark,
    date: dateText(item.approvedAt),
    status: item.status,
    statusLabel: statusLabel(item.status),
    raw: raw(item),
    rawType: 'WRITE_OFF_ITEM',
  };
}

function paymentRow(
  state: TradePrototypeState,
  payment: Payment,
): TradePageRow {
  const supplier = findSupplier(state, payment.supplierId);
  return {
    id: payment.id,
    primary: payment.id,
    secondary: '采购付款',
    partner: supplier?.name ?? payment.supplierId,
    source: payment.allocations
      .map((allocation) => allocation.purchaseOrderId)
      .join('、'),
    amount: payment.amount,
    currency: payment.currency,
    progress: `分配 ${payment.allocations.length} 张采购单`,
    date: dateText(payment.paidAt),
    status: payment.status,
    statusLabel: statusLabel(payment.status),
    raw: raw(payment),
    rawType: 'PAYMENT',
  };
}

function invoiceRow(
  state: TradePrototypeState,
  invoice: SupplierInvoice,
): TradePageRow {
  const supplier = findSupplier(state, invoice.supplierId);
  return {
    id: invoice.id,
    primary: invoice.id,
    secondary: `供应商发票 ${invoice.invoiceNo}`,
    partner: supplier?.name ?? invoice.supplierId,
    source: invoice.allocations
      .map((allocation) => allocation.purchaseOrderId)
      .join('、'),
    amount: invoice.amount,
    currency: invoice.currency,
    progress: `分配 ${invoice.allocations.length} 张采购单`,
    date: dateText(invoice.issuedAt),
    status: invoice.status,
    statusLabel: statusLabel(invoice.status),
    raw: raw(invoice),
    rawType: 'SUPPLIER_INVOICE',
  };
}

function expenseRow(
  state: TradePrototypeState,
  expense: OrderExpense,
): TradePageRow {
  const order = findOrder(state, expense.orderId);
  const customer = order && findCustomer(state, order.customerId);
  return {
    id: expense.id,
    primary: expense.id,
    secondary: `订单费用 · ${expense.expenseType}`,
    partner: customer?.name ?? expense.orderId,
    source: `${expense.orderId} / ${expense.relatedId}`,
    amount: expense.amount,
    currency: expense.currency,
    progress: paymentModeLabel(expense.paymentMode),
    status: expense.status,
    statusLabel: statusLabel(expense.status),
    raw: raw(expense),
    rawType: 'ORDER_EXPENSE',
  };
}

function writeOffKindLabel(kind: WriteOffItem['kind']) {
  if (kind === 'CUSTOMER_BALANCE') return '客户余额消费';
  if (kind === 'WAIVER') return '减免 / 坏账';
  return '其他合法冲销';
}

function paymentModeLabel(mode: OrderExpense['paymentMode']) {
  if (mode === 'EMPLOYEE_REIMBURSEMENT') return '员工垫付报销';
  if (mode === 'COMPANY_DIRECT') return '公司直接付款';
  return '其他支付方式';
}

export function rowsForPage(
  state: TradePrototypeState,
  pageKey: TradePageKey,
  tab?: string,
): TradePageRow[] {
  switch (pageKey) {
    case 'contract-order': {
      return state.orders.map((order) => orderRow(state, order));
    }
    case 'customer': {
      return state.customers.map(customerRow);
    }
    case 'demand-analysis': {
      return state.demandAnalyses.map((analysis) => demandRow(state, analysis));
    }
    case 'follow-up-customs': {
      return state.followUpTasks.map(followUpRow);
    }
    case 'payable-expense': {
      if (tab === 'invoice') {
        return state.supplierInvoices.map((item) => invoiceRow(state, item));
      }
      if (tab === 'expense') {
        return state.orderExpenses.map((item) => expenseRow(state, item));
      }
      return state.payments.map((item) => paymentRow(state, item));
    }
    case 'purchase-order': {
      return state.purchaseOrders.map((item) => purchaseOrderRow(state, item));
    }
    case 'receipt-writeoff': {
      if (tab === 'writeoff') {
        return state.writeOffItems.map((item) => writeOffRow(state, item));
      }
      return state.receipts.map((item) => receiptRow(state, item));
    }
    case 'requisition': {
      return state.purchaseRequisitions.map((item) =>
        requisitionRow(state, item),
      );
    }
    case 'shipment-outbound': {
      if (tab === 'outbound') return state.outboundDocuments.map(outboundRow);
      return state.shipments.map((item) => shipmentRow(state, item));
    }
    case 'supplier': {
      return state.suppliers.map(supplierRow);
    }
    case 'supply-execution': {
      if (tab === 'inbound') return state.inboundDocuments.map(inboundRow);
      if (tab === 'direct') {
        return state.inboundDocuments
          .filter((item) => item.warehouse.includes('直发'))
          .map((item) => inboundRow(item));
      }
      return state.factoryTasks.map((item) => factoryTaskRow(state, item));
    }
  }
}

export function findPageRow(
  state: TradePrototypeState,
  pageKey: TradePageKey,
  id: string,
) {
  const pageRows = rowsForPage(state, pageKey);
  const direct = pageRows.find((row) => row.id === id);
  if (direct) return direct;

  const configTabs: Record<string, string[]> = {
    'payable-expense': ['payment', 'invoice', 'expense'],
    'receipt-writeoff': ['receipt', 'writeoff'],
    'shipment-outbound': ['shipment', 'outbound'],
    'supply-execution': ['factory', 'inbound', 'direct'],
  };
  return configTabs[pageKey]
    ?.flatMap((tab) => rowsForPage(state, pageKey, tab))
    .find((row) => row.id === id);
}

export function sourceRouteForRow(row: TradePageRow) {
  if (row.rawType === 'CUSTOMER') return '/fdmwaimao/customer';
  if (row.rawType === 'ORDER') return '/fdmwaimao/contract-order';
  if (row.rawType === 'DEMAND_ANALYSIS') return '/fdmwaimao/demand-analysis';
  if (row.rawType === 'PURCHASE_REQUISITION') return '/fdmpurchase/requisition';
  if (row.rawType === 'PURCHASE_ORDER') return '/fdmpurchase/order';
  if (row.rawType === 'FOLLOW_UP_TASK') return '/fdmpurchase/follow-up-customs';
  if (row.rawType === 'FACTORY_TASK' || row.rawType === 'INBOUND_DOCUMENT') {
    return '/fdmsupplychain/supply-execution';
  }
  if (row.rawType === 'SHIPMENT' || row.rawType === 'OUTBOUND_DOCUMENT') {
    return '/fdmsupplychain/shipment-outbound';
  }
  if (row.rawType === 'RECEIPT' || row.rawType === 'WRITE_OFF_ITEM') {
    return '/fdmtradefinance/receipt-writeoff';
  }
  return '/fdmtradefinance/payable-expense';
}
