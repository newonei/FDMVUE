import type {
  AuditEvent,
  ContractOrder,
  Customer,
  DemandAnalysis,
  DocumentRelation,
  FactoryTask,
  OkkiCustomer,
  OrderLine,
  PurchaseRequisition,
  Receipt,
  ReceiptAllocation,
  Shipment,
  Supplier,
  TradePrototypeState,
  WriteOffItem,
} from './types';

import { createTradePrototypeSeed } from './mock-data';
import {
  clampToZero,
  isGreaterThan,
  money,
  quantity,
  rate,
  subtract,
  sum,
} from './money';

export const TRADE_PROTOTYPE_STORAGE_KEY = 'fdm:foreign-trade-prototype:v2';
export const LEGACY_TRADE_PROTOTYPE_STORAGE_KEY =
  'fdm:foreign-trade-crm-prototype:v1';

const STATE_COLLECTIONS = [
  'auditEvents',
  'contacts',
  'customers',
  'demandAnalyses',
  'documentRelations',
  'factoryTasks',
  'followUpTasks',
  'inboundDocuments',
  'okkiCustomers',
  'orderExpenses',
  'orders',
  'outboundDocuments',
  'payments',
  'purchaseOrders',
  'purchaseRequisitions',
  'receiptAllocations',
  'receipts',
  'shipments',
  'supplierInvoices',
  'suppliers',
  'writeOffItems',
] as const satisfies ReadonlyArray<keyof TradePrototypeState>;

type PlainRecord = Record<string, unknown>;

export type SnapshotSource = 'legacy-v1' | 'seed' | 'v2';

export interface SnapshotResolution {
  snapshot: TradePrototypeState;
  source: SnapshotSource;
}

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): PlainRecord[] {
  return Array.isArray(value) ? value.filter((item) => isRecord(item)) : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function numeric(value: unknown, fallback = '0'): string {
  try {
    return quantity(
      typeof value === 'number' || typeof value === 'string' ? value : fallback,
    );
  } catch {
    return fallback;
  }
}

function monetary(value: unknown, fallback = '0'): string {
  try {
    return money(
      typeof value === 'number' || typeof value === 'string' ? value : fallback,
    );
  } catch {
    return money(fallback);
  }
}

function exchangeRate(value: unknown): string {
  try {
    return rate(
      typeof value === 'number' || typeof value === 'string' ? value : '1',
    );
  } catch {
    return '1';
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function parseStoredJson(value: null | string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function isTradePrototypeState(
  value: unknown,
): value is TradePrototypeState {
  if (!isRecord(value) || value.schemaVersion !== 2) return false;
  return STATE_COLLECTIONS.every(
    (key) =>
      Array.isArray(value[key]) &&
      (value[key] as unknown[]).every((item) => isRecord(item)),
  );
}

function hasRecognizableLegacyData(value: unknown): value is PlainRecord {
  if (!isRecord(value)) return false;
  return [
    'audits',
    'customers',
    'demandLines',
    'factoryTasks',
    'okkiCustomers',
    'orders',
    'purchaseRequests',
    'receipts',
    'shipments',
    'writeOffItems',
  ].some((key) => Array.isArray(value[key]));
}

function migrateCustomers(source: PlainRecord): {
  contacts: TradePrototypeState['contacts'];
  customers: Customer[];
} {
  const contacts: TradePrototypeState['contacts'] = [];
  const customers = records(source.customers).map((legacy, index) => {
    const customerId = text(legacy.id, `CUS-MIG-${index + 1}`);
    const contactName = text(legacy.contact, '待补充联系人');
    contacts.push({
      id: `CONT-MIG-${customerId}`,
      customerId,
      email: text(legacy.email),
      isPrimary: true,
      name: contactName,
      phone: text(legacy.phone),
      source: text(legacy.okkiSerialId) ? 'OKKI' : 'MANUAL',
    });
    return {
      id: customerId,
      code: text(legacy.code, `FT-CUS-MIG-${index + 1}`),
      country: text(legacy.country, '待补充'),
      firstOrderDate: text(legacy.firstOrderDate) || undefined,
      level:
        legacy.level === 'A' || legacy.level === 'B' || legacy.level === 'C'
          ? legacy.level
          : 'B',
      name: text(legacy.name, `迁移客户 ${index + 1}`),
      okkiOwner: text(legacy.okkiOwner) || undefined,
      okkiSerialId: text(legacy.okkiSerialId) || undefined,
      orderCount: typeof legacy.orderCount === 'number' ? legacy.orderCount : 0,
      outstandingAmount: monetary(legacy.outstandingAmount),
      owner: text(legacy.owner, '待分配'),
      syncStatus: legacy.syncStatus === '已同步' ? 'SYNCED' : 'PENDING',
      transactionAmount: monetary(legacy.transactionAmount),
    } satisfies Customer;
  });
  return { contacts, customers };
}

function migrateOkkiCustomers(source: PlainRecord): OkkiCustomer[] {
  return records(source.okkiCustomers).map((legacy, index) => ({
    id: text(legacy.id, `OKKI-MIG-${index + 1}`),
    companyId: text(legacy.companyId, `company_migrated_${index + 1}`),
    contactEmail: text(legacy.email),
    contactName: text(legacy.contact, '待补充联系人'),
    contactPhone: text(legacy.phone),
    country: text(legacy.country, '待补充'),
    mappedCustomerId: text(legacy.mappedCustomerId) || undefined,
    name: text(legacy.name, `OKKI 迁移客户 ${index + 1}`),
    owner: text(legacy.owner, '待分配'),
    serialId: text(legacy.serialId, `OKKI-MIG-${index + 1}`),
    stage: text(legacy.stage, '准备下单'),
  }));
}

function migrateOrders(source: PlainRecord): {
  demandAnalyses: DemandAnalysis[];
  orders: ContractOrder[];
} {
  const legacyDemandLines = records(source.demandLines);
  const journey = isRecord(source.journey) ? source.journey : {};
  let analysisStatus: DemandAnalysis['status'] = 'PENDING';
  if (journey.analysisStatus === '已人工确认') {
    analysisStatus = 'CONFIRMED';
  } else if (journey.analysisStatus === 'AI草稿') {
    analysisStatus = 'AI_DRAFT';
  }

  const demandAnalyses: DemandAnalysis[] = [];
  const orders = records(source.orders).map((legacy, orderIndex) => {
    const orderId = text(legacy.id, `SO-MIG-${orderIndex + 1}`);
    const legacyLines = legacyDemandLines.filter(
      (line) => text(line.orderId) === orderId,
    );
    const lines: OrderLine[] = legacyLines.map((line, lineIndex) => ({
      id: text(line.id, `SOL-MIG-${orderIndex + 1}-${lineIndex + 1}`),
      amount: monetary(line.amount),
      availableStockQty: numeric(line.stockQty),
      customerSku: text(line.customerSku) || undefined,
      productName: text(line.productName, `迁移产品 ${lineIndex + 1}`),
      quantity: numeric(line.quantity),
      sku: text(line.sku, `MIG-SKU-${lineIndex + 1}`),
      specification: text(line.specification),
      suggestedFactoryQty: numeric(line.factoryQty),
      suggestedPurchaseQty: numeric(line.purchaseQty),
      suggestedStockQty: numeric(line.stockQty),
      unit: text(line.unit, '件'),
      unitPrice: monetary(line.unitPrice),
    }));

    if (lines.length > 0) {
      demandAnalyses.push({
        id: `DA-MIG-${orderId}`,
        lines: lines.map((line, lineIndex) => {
          const legacyLine = legacyLines[lineIndex] ?? {};
          return {
            id: `DAL-MIG-${line.id}`,
            confidence: numeric(legacyLine.confidence, '0'),
            factoryQty: line.suggestedFactoryQty,
            orderLineId: line.id,
            purchaseQty: line.suggestedPurchaseQty,
            stockQty: line.suggestedStockQty,
            strategy: text(legacyLine.strategy, '迁移后的原有供给拆分'),
          };
        }),
        orderId,
        status: analysisStatus,
      });
    }

    const lineAmount = sum(lines, (line) => line.amount);
    const totalAmount = monetary(legacy.totalAmount);
    let additionalFee: string;
    try {
      additionalFee = money(clampToZero(subtract(totalAmount, lineAmount)));
    } catch {
      additionalFee = '0.00';
    }
    const statusText = text(legacy.status);
    const riskText = text(legacy.risk);
    let risk: ContractOrder['risk'] = 'LOW';
    if (riskText === '高') risk = 'HIGH';
    else if (riskText === '中') risk = 'MEDIUM';
    let status: ContractOrder['status'] = 'IN_PROGRESS';
    if (statusText.includes('完成')) status = 'COMPLETED';
    else if (statusText.includes('部分发货')) status = 'PARTIALLY_SHIPPED';
    return {
      id: orderId,
      additionalFee,
      company: text(legacy.company, '飞德慕国际贸易有限公司'),
      currency: legacy.currency === 'EUR' ? 'EUR' : 'USD',
      customerId: text(legacy.customerId, 'CUS-MIG-UNKNOWN'),
      destinationPort: text(legacy.destinationPort),
      exchangeRate: exchangeRate(legacy.exchangeRate),
      incoterm: text(legacy.incoterm),
      lines,
      originPort: text(legacy.originPort),
      owner: text(legacy.owner, '待分配'),
      paymentTerms: text(legacy.paymentTerms),
      requiredShipAt: text(legacy.requiredShipAt),
      risk,
      signedAt: text(legacy.signedAt),
      status,
      totalAmount,
      type: legacy.type === '样品订单' ? 'SAMPLE' : 'BULK',
    } satisfies ContractOrder;
  });
  return { demandAnalyses, orders };
}

function migrateFactoryTasks(
  source: PlainRecord,
  orders: ContractOrder[],
): FactoryTask[] {
  return records(source.factoryTasks).flatMap((legacy, index) => {
    const orderId = text(legacy.orderId);
    const order = orders.find((item) => item.id === orderId);
    const orderLine =
      order?.lines.find(
        (line) => line.productName === text(legacy.productName),
      ) ?? order?.lines[0];
    if (!order || !orderLine) return [];
    const statusText = text(legacy.status);
    let status: FactoryTask['status'] = 'DRAFT';
    if (statusText.includes('完成')) status = 'COMPLETED';
    else if (statusText.includes('生产') || statusText.includes('进行')) {
      status = 'IN_PROGRESS';
    }
    return [
      {
        id: text(legacy.id, `FT-MIG-${index + 1}`),
        completedQty: numeric(legacy.completedQty),
        estimatedReadyAt: text(legacy.estimatedReadyAt),
        factory: text(legacy.factory, '待分配工厂'),
        orderId,
        orderLineId: orderLine.id,
        owner: text(legacy.owner, '待分配'),
        requiredAt: text(legacy.requiredAt),
        requiredQty: numeric(legacy.requiredQty),
        status,
      } satisfies FactoryTask,
    ];
  });
}

function migratePurchaseRequisitions(
  source: PlainRecord,
  orders: ContractOrder[],
  suppliers: Supplier[],
): PurchaseRequisition[] {
  return records(source.purchaseRequests).flatMap((legacy, requestIndex) => {
    const orderId = text(legacy.orderId);
    const order = orders.find((item) => item.id === orderId);
    if (!order) return [];
    const sourceLines = order.lines.filter((line) =>
      isGreaterThan(line.suggestedPurchaseQty, 0),
    );
    const orderLines =
      sourceLines.length > 0 ? sourceLines : order.lines.slice(0, 1);
    if (orderLines.length === 0) return [];

    const selectedSupplier = suppliers.find(
      (supplier) => supplier.name === text(legacy.supplier),
    );
    const lines = orderLines.map((orderLine, lineIndex) => {
      const supportingSuppliers = suppliers.filter((supplier) =>
        supplier.quotes.some((quote) => quote.sku === orderLine.sku),
      );
      return {
        id: `PRL-MIG-${requestIndex + 1}-${lineIndex + 1}`,
        orderLineId: orderLine.id,
        productName: orderLine.productName,
        quantity: isGreaterThan(orderLine.suggestedPurchaseQty, 0)
          ? orderLine.suggestedPurchaseQty
          : orderLine.quantity,
        selectedSupplierId: selectedSupplier?.quotes.some(
          (quote) => quote.sku === orderLine.sku,
        )
          ? selectedSupplier.id
          : undefined,
        sku: orderLine.sku,
        suggestions: supportingSuppliers.map((supplier) => ({
          confidence: '0.8',
          reason: '从旧版原型的已审核供应商报价中恢复',
          supplierId: supplier.id,
        })),
        unit: orderLine.unit,
      };
    });
    const statusText = text(legacy.status);
    const allSelected = lines.every((line) => line.selectedSupplierId);
    return [
      {
        id: text(legacy.id, `PR-MIG-${requestIndex + 1}`),
        createdAt: text(legacy.createdAt, new Date(0).toISOString()),
        lines,
        orderId,
        requiredAt: text(legacy.requiredAt, order.requiredShipAt),
        risk: text(legacy.risk),
        status:
          statusText.includes('已采用') && allSelected ? 'SOURCED' : 'DRAFT',
      } satisfies PurchaseRequisition,
    ];
  });
}

function migrateDocumentRelations(input: {
  demandAnalyses: DemandAnalysis[];
  factoryTasks: FactoryTask[];
  orders: ContractOrder[];
  purchaseRequisitions: PurchaseRequisition[];
  receiptAllocations: ReceiptAllocation[];
  shipments: Shipment[];
}): DocumentRelation[] {
  let relationNumber = 0;
  const relation = (value: Omit<DocumentRelation, 'id'>): DocumentRelation => ({
    ...value,
    id: `REL-MIG-${++relationNumber}`,
  });
  return [
    ...input.orders.map((order) =>
      relation({
        fromId: order.id,
        fromType: 'ORDER',
        relationType: '交易客户',
        toId: order.customerId,
        toType: 'CUSTOMER',
      }),
    ),
    ...input.demandAnalyses.map((analysis) =>
      relation({
        fromId: analysis.id,
        fromType: 'DEMAND_ANALYSIS',
        relationType: '分析订单',
        toId: analysis.orderId,
        toType: 'ORDER',
      }),
    ),
    ...input.purchaseRequisitions.map((requisition) =>
      relation({
        fromId: requisition.id,
        fromType: 'PURCHASE_REQUISITION',
        relationType: '来源订单',
        toId: requisition.orderId,
        toType: 'ORDER',
      }),
    ),
    ...input.factoryTasks.map((task) =>
      relation({
        fromId: task.id,
        fromType: 'FACTORY_TASK',
        relationType: '来源订单',
        toId: task.orderId,
        toType: 'ORDER',
      }),
    ),
    ...input.shipments.map((shipment) =>
      relation({
        fromId: shipment.id,
        fromType: 'SHIPMENT',
        relationType: '发货订单',
        toId: shipment.orderId,
        toType: 'ORDER',
      }),
    ),
    ...input.receiptAllocations.map((allocation) =>
      relation({
        fromId: allocation.receiptId,
        fromType: 'RECEIPT',
        relationType: '回款分配',
        toId: allocation.orderId,
        toType: 'ORDER',
      }),
    ),
  ];
}

function migrateShipments(source: PlainRecord): Shipment[] {
  return records(source.shipments).map((legacy, index) => ({
    id: text(legacy.id, `SH-MIG-${index + 1}`),
    batch: text(legacy.batch, `迁移批次 ${index + 1}`),
    createdAt: new Date(0).toISOString(),
    eta: text(legacy.eta),
    etd: text(legacy.etd),
    lines: [],
    orderId: text(legacy.orderId),
    progress: numeric(legacy.progress),
    status: text(legacy.status).includes('完成') ? 'COMPLETED' : 'DRAFT',
  }));
}

function migrateReceipts(source: PlainRecord): {
  receiptAllocations: ReceiptAllocation[];
  receipts: Receipt[];
} {
  const receiptAllocations: ReceiptAllocation[] = [];
  const receipts = records(source.receipts).map((legacy, index) => {
    const id = text(legacy.id, `RC-MIG-${index + 1}`);
    const amount = monetary(legacy.amount);
    receiptAllocations.push({
      id: `RA-MIG-${id}`,
      amount: monetary(legacy.allocatedAmount, amount),
      orderId: text(legacy.orderId),
      receiptId: id,
      status: 'CONFIRMED',
    });
    return {
      id,
      account: text(legacy.account),
      amount,
      cnyAmount: monetary(legacy.cnyAmount),
      currency: legacy.currency === 'EUR' ? 'EUR' : 'USD',
      payer: text(legacy.payer),
      rate: exchangeRate(legacy.rate),
      receivedAt: text(legacy.receivedAt),
      status: 'CONFIRMED',
    } satisfies Receipt;
  });
  return { receiptAllocations, receipts };
}

function migrateWriteOffItems(source: PlainRecord): WriteOffItem[] {
  return records(source.writeOffItems).map((legacy, index) => ({
    id: text(legacy.id, `WO-MIG-${index + 1}`),
    amount: monetary(legacy.amount),
    approvedAt: text(legacy.approvedAt),
    kind: legacy.type === '客户余额消费' ? 'CUSTOMER_BALANCE' : 'WAIVER',
    orderId: text(legacy.orderId),
    remark: text(legacy.remark),
    status: 'APPROVED',
  }));
}

function migrateAudits(source: PlainRecord): AuditEvent[] {
  return records(source.audits).map((legacy, index) => {
    const type = text(legacy.type);
    let eventType: AuditEvent['type'] = 'SYSTEM';
    if (type === 'AI建议') eventType = 'AI_SUGGESTION';
    else if (type === '人工确认') eventType = 'HUMAN_CONFIRMATION';
    else if (type === '规则拦截') eventType = 'RULE_BLOCK';
    return {
      id: text(legacy.id, `AUD-MIG-${index + 1}`),
      action: text(legacy.action, '迁移旧版原型记录'),
      actor: text(legacy.actor, '系统'),
      createdAt: text(legacy.time, new Date(0).toISOString()),
      result: text(legacy.result),
      type: eventType,
    } satisfies AuditEvent;
  });
}

export function migrateLegacySnapshot(value: unknown): TradePrototypeState {
  if (!hasRecognizableLegacyData(value)) return createTradePrototypeSeed();

  const migratedCustomers = migrateCustomers(value);
  const migratedOrders = migrateOrders(value);
  const migratedReceipts = migrateReceipts(value);
  const seed = createTradePrototypeSeed();
  const factoryTasks = migrateFactoryTasks(value, migratedOrders.orders);
  const purchaseRequisitions = migratePurchaseRequisitions(
    value,
    migratedOrders.orders,
    seed.suppliers,
  );
  const shipments = migrateShipments(value);
  const documentRelations = migrateDocumentRelations({
    demandAnalyses: migratedOrders.demandAnalyses,
    factoryTasks,
    orders: migratedOrders.orders,
    purchaseRequisitions,
    receiptAllocations: migratedReceipts.receiptAllocations,
    shipments,
  });

  return {
    schemaVersion: 2,
    auditEvents: migrateAudits(value),
    contacts: migratedCustomers.contacts,
    customers: migratedCustomers.customers,
    demandAnalyses: migratedOrders.demandAnalyses,
    documentRelations,
    factoryTasks,
    followUpTasks: [],
    inboundDocuments: [],
    okkiCustomers: migrateOkkiCustomers(value),
    orderExpenses: [],
    orders: migratedOrders.orders,
    outboundDocuments: [],
    payments: [],
    purchaseOrders: [],
    purchaseRequisitions,
    receiptAllocations: migratedReceipts.receiptAllocations,
    receipts: migratedReceipts.receipts,
    shipments,
    supplierInvoices: [],
    suppliers: seed.suppliers,
    writeOffItems: migrateWriteOffItems(value),
  };
}

export function resolvePrototypeSnapshot(
  v2Candidate: unknown,
  legacyCandidate?: unknown,
): SnapshotResolution {
  if (isTradePrototypeState(v2Candidate)) {
    return { snapshot: clone(v2Candidate), source: 'v2' };
  }
  if (hasRecognizableLegacyData(legacyCandidate)) {
    return {
      snapshot: migrateLegacySnapshot(legacyCandidate),
      source: 'legacy-v1',
    };
  }
  return { snapshot: createTradePrototypeSeed(), source: 'seed' };
}
