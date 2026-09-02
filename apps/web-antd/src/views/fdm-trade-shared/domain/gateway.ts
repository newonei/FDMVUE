import type { SnapshotSource } from './migration';
import type { DecimalValue } from './money';
import type {
  AuditEvent,
  ContractOrder,
  CreateOrderDraftInput,
  CustomsReadinessResult,
  DemandAnalysis,
  DemandConfirmationResult,
  DemandSplitUpdate,
  DocumentRelation,
  DocumentType,
  EntityId,
  FactoryTask,
  FollowUpTask,
  OkkiCustomer,
  OutboundDocument,
  PurchaseRequisition,
  PurchaseRequisitionLine,
  QuantityString,
  ReceiptWriteOffInput,
  ReceiptWriteOffResult,
  ReceivableSummary,
  ShipmentDraftInput,
  ShipmentDraftResult,
  SupplierAdoptionResult,
  SupplierSuggestion,
  TradePrototypeState,
} from './types';

import { parseStoredJson, resolvePrototypeSnapshot } from './migration';
import { createTradePrototypeSeed } from './mock-data';
import {
  add,
  asBigNumber,
  clampToZero,
  equals,
  isGreaterThan,
  isNegative,
  money,
  multiply,
  quantity,
  rate,
  sum,
} from './money';

export type TradePrototypeErrorCode =
  | 'NOT_FOUND'
  | 'RULE_VIOLATION'
  | 'VALIDATION_ERROR';

export class TradePrototypeDomainError extends Error {
  readonly code: TradePrototypeErrorCode;

  constructor(code: TradePrototypeErrorCode, message: string) {
    super(message);
    this.name = 'TradePrototypeDomainError';
    this.code = code;
  }
}

export interface TradePrototypeGatewayOptions {
  initialState?: TradePrototypeState;
  now?: () => Date;
}

export interface TradePrototypeGatewayContract {
  adoptSupplierSuggestion(
    requisitionId: EntityId,
    requisitionLineId: EntityId,
    supplierId: EntityId,
    actor?: string,
  ): Promise<SupplierAdoptionResult>;
  checkCustomsReadiness(taskId: EntityId): Promise<CustomsReadinessResult>;
  confirmDemandSplit(
    analysisId: EntityId,
    actor?: string,
  ): Promise<DemandConfirmationResult>;
  createOrderDraft(
    input: CreateOrderDraftInput,
    actor?: string,
  ): Promise<ContractOrder>;
  createShipmentDraft(
    input: ShipmentDraftInput,
    actor?: string,
  ): Promise<ShipmentDraftResult>;
  generateDemandDraft(orderId: EntityId): Promise<DemandAnalysis>;
  getOrderRelations(orderId: EntityId): Promise<DocumentRelation[]>;
  getReceivableSummary(orderId: EntityId): Promise<ReceivableSummary>;
  importTradingCustomer(
    okkiCustomerId: EntityId,
    actor?: string,
  ): Promise<TradePrototypeState['customers'][number]>;
  loadSnapshot(
    v2Candidate?: unknown,
    legacyCandidate?: unknown,
  ): Promise<TradePrototypeState>;
  recordReceiptAndWriteOff(
    input: ReceiptWriteOffInput,
  ): Promise<ReceiptWriteOffResult>;
  reset(): Promise<TradePrototypeState>;
  searchOkkiCustomers(query: string): Promise<OkkiCustomer[]>;
  updateFactoryTaskProgress(
    taskId: EntityId,
    completedQty: QuantityString,
    actor?: string,
  ): Promise<FactoryTask>;
  updateDemandSplit(
    analysisId: EntityId,
    lineId: EntityId,
    update: DemandSplitUpdate,
    actor?: string,
  ): Promise<DemandAnalysis>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeCandidate(value: unknown): unknown {
  return typeof value === 'string' ? parseStoredJson(value) : value;
}

function requireEntity<T extends { id: EntityId }>(
  values: T[],
  id: EntityId,
  label: string,
): T {
  const value = values.find((item) => item.id === id);
  if (!value) {
    throw new TradePrototypeDomainError('NOT_FOUND', `${label} ${id} 不存在`);
  }
  return value;
}

function requireNonNegative(value: DecimalValue, label: string): void {
  if (isNegative(value)) {
    throw new TradePrototypeDomainError(
      'VALIDATION_ERROR',
      `${label}不能小于 0`,
    );
  }
}

function requirePositive(value: DecimalValue, label: string): void {
  if (!isGreaterThan(value, 0)) {
    throw new TradePrototypeDomainError(
      'VALIDATION_ERROR',
      `${label}必须大于 0`,
    );
  }
}

function documentNodeKey(type: DocumentType, id: EntityId): string {
  return `${type}:${id}`;
}

export class TradePrototypeGateway implements TradePrototypeGatewayContract {
  lastLoadSource: SnapshotSource = 'seed';
  private idCounter = 0;
  private readonly now: () => Date;

  private state: TradePrototypeState;

  constructor(options: TradePrototypeGatewayOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.state = clone(options.initialState ?? createTradePrototypeSeed());
  }

  async adoptSupplierSuggestion(
    requisitionId: EntityId,
    requisitionLineId: EntityId,
    supplierId: EntityId,
    actor = '当前用户',
  ): Promise<SupplierAdoptionResult> {
    const requisition = requireEntity(
      this.state.purchaseRequisitions,
      requisitionId,
      '采购申请',
    );
    const line = requireEntity(
      requisition.lines,
      requisitionLineId,
      '采购申请产品行',
    );
    const suggestion = line.suggestions.find(
      (item) => item.supplierId === supplierId,
    );
    if (!suggestion) {
      throw new TradePrototypeDomainError(
        'VALIDATION_ERROR',
        '只能采纳当前产品行已有的供应商建议',
      );
    }
    const supplier = requireEntity(this.state.suppliers, supplierId, '供应商');
    if (supplier.status !== 'APPROVED') {
      throw new TradePrototypeDomainError(
        'RULE_VIOLATION',
        '供应商尚未审核通过，不能生成采购订单草稿',
      );
    }
    const quote = supplier.quotes.find((item) => item.sku === line.sku);
    if (!quote) {
      throw new TradePrototypeDomainError(
        'VALIDATION_ERROR',
        '供应商没有该 SKU 的有效报价',
      );
    }

    line.selectedSupplierId = supplierId;
    requisition.status = requisition.lines.every(
      (item) => item.selectedSupplierId,
    )
      ? 'SOURCED'
      : 'PARTIALLY_SOURCED';

    let purchaseOrder = this.state.purchaseOrders.find(
      (item) =>
        item.requisitionId === requisition.id &&
        item.supplierId === supplierId &&
        item.status === 'DRAFT',
    );
    const itemAmount = money(multiply(line.quantity, quote.unitPrice));
    const purchaseOrderItem = {
      id: this.nextId('POI'),
      amount: itemAmount,
      orderLineId: line.orderLineId,
      productName: line.productName,
      quantity: quantity(line.quantity),
      requisitionLineId: line.id,
      sku: line.sku,
      unit: line.unit,
      unitPrice: money(quote.unitPrice),
    };
    if (purchaseOrder) {
      purchaseOrder.items = purchaseOrder.items.filter(
        (item) => item.requisitionLineId !== line.id,
      );
      purchaseOrder.items.push(purchaseOrderItem);
      purchaseOrder.totalAmount = money(
        sum(purchaseOrder.items, (item) => item.amount),
      );
    } else {
      purchaseOrder = {
        id: this.nextId('PO'),
        currency: quote.currency,
        expectedAt: requisition.requiredAt,
        invoicedAmount: '0.00',
        items: [purchaseOrderItem],
        orderId: requisition.orderId,
        paidAmount: '0.00',
        requisitionId: requisition.id,
        status: 'DRAFT',
        supplierId,
        totalAmount: itemAmount,
      };
      this.state.purchaseOrders.unshift(purchaseOrder);
      this.addRelation(
        'PURCHASE_ORDER',
        purchaseOrder.id,
        '来源采购申请',
        'PURCHASE_REQUISITION',
        requisition.id,
      );
      this.addRelation(
        'PURCHASE_ORDER',
        purchaseOrder.id,
        '服务订单',
        'ORDER',
        requisition.orderId,
      );
    }
    this.addAudit({
      action: `采纳 ${supplier.name} 的供应商建议`,
      actor,
      entityId: purchaseOrder.id,
      entityType: 'PURCHASE_ORDER',
      result: '已生成人工待确认的采购订单 DRAFT，未自动下单',
      type: 'HUMAN_CONFIRMATION',
    });
    return clone({ purchaseOrder, requisition });
  }

  async checkCustomsReadiness(
    taskId: EntityId,
  ): Promise<CustomsReadinessResult> {
    const task = requireEntity(
      this.state.followUpTasks,
      taskId,
      '跟单报关任务',
    );
    const missingDocumentIds = task.customsDocuments
      .filter((document) => document.status === 'MISSING')
      .map((document) => document.id);
    task.aiReadiness = missingDocumentIds.length > 0 ? 'BLOCKED' : 'READY';
    task.aiReadinessMessage =
      missingDocumentIds.length > 0
        ? `仍缺少 ${missingDocumentIds.length} 项报关资料，请人工补齐并确认`
        : 'AI 检查未发现缺项，仍需跟单人员正式确认';
    task.lastAiCheckedAt = this.timestamp();
    this.addAudit({
      action: `AI 检查 ${task.id} 的报关资料齐套性`,
      actor: 'AI 报关助手',
      entityId: task.id,
      entityType: 'FOLLOW_UP_TASK',
      result: `${task.aiReadinessMessage}；任务状态保持 ${task.status}`,
      type: 'AI_SUGGESTION',
    });
    return clone({
      missingDocumentIds,
      readiness: task.aiReadiness,
      task,
    });
  }

  async confirmDemandSplit(
    analysisId: EntityId,
    actor = '当前用户',
  ): Promise<DemandConfirmationResult> {
    const analysis = requireEntity(
      this.state.demandAnalyses,
      analysisId,
      '需求分析',
    );
    if (analysis.status !== 'AI_DRAFT') {
      throw new TradePrototypeDomainError(
        'RULE_VIOLATION',
        '只有 AI 草稿可以由人员确认',
      );
    }
    const order = requireEntity(
      this.state.orders,
      analysis.orderId,
      '合同订单',
    );
    if (analysis.lines.length !== order.lines.length) {
      throw new TradePrototypeDomainError(
        'VALIDATION_ERROR',
        '需求分析必须覆盖合同订单的每一条产品明细',
      );
    }

    for (const orderLine of order.lines) {
      const lines = analysis.lines.filter(
        (line) => line.orderLineId === orderLine.id,
      );
      if (lines.length !== 1) {
        throw new TradePrototypeDomainError(
          'VALIDATION_ERROR',
          `${orderLine.productName} 必须且只能有一条需求拆分`,
        );
      }
      const line = lines[0]!;
      requireNonNegative(line.stockQty, `${orderLine.productName} 库存数量`);
      requireNonNegative(line.factoryQty, `${orderLine.productName} 工厂数量`);
      requireNonNegative(line.purchaseQty, `${orderLine.productName} 外采数量`);
      const splitTotal = add(line.stockQty, line.factoryQty, line.purchaseQty);
      if (!equals(splitTotal, orderLine.quantity)) {
        this.addAudit({
          action: `确认 ${analysis.id} 的需求拆分`,
          actor,
          entityId: analysis.id,
          entityType: 'DEMAND_ANALYSIS',
          result: `${orderLine.productName} 拆分合计 ${splitTotal}，订单数量 ${orderLine.quantity}，规则已拦截`,
          type: 'RULE_BLOCK',
        });
        throw new TradePrototypeDomainError(
          'RULE_VIOLATION',
          `${orderLine.productName} 的库存 + 工厂 + 外采必须等于订单数量`,
        );
      }
    }

    analysis.status = 'CONFIRMED';
    analysis.confirmedAt = this.timestamp();
    analysis.confirmedBy = actor;

    const factoryTasks: FactoryTask[] = [];
    const requisitionLines: PurchaseRequisitionLine[] = [];
    for (const analysisLine of analysis.lines) {
      const orderLine = requireEntity(
        order.lines,
        analysisLine.orderLineId,
        '合同订单产品行',
      );
      if (isGreaterThan(analysisLine.factoryQty, 0)) {
        const task: FactoryTask = {
          id: this.nextId('FT'),
          completedQty: '0',
          estimatedReadyAt: order.requiredShipAt,
          factory: '黄石飞德慕工厂',
          orderId: order.id,
          orderLineId: orderLine.id,
          owner: '待分配',
          requiredAt: order.requiredShipAt,
          requiredQty: quantity(analysisLine.factoryQty),
          status: 'DRAFT',
        };
        this.state.factoryTasks.unshift(task);
        factoryTasks.push(task);
        this.addRelation(
          'FACTORY_TASK',
          task.id,
          '来源订单',
          'ORDER',
          order.id,
        );
      }
      if (isGreaterThan(analysisLine.purchaseQty, 0)) {
        requisitionLines.push({
          id: this.nextId('PRL'),
          orderLineId: orderLine.id,
          productName: orderLine.productName,
          quantity: quantity(analysisLine.purchaseQty),
          sku: orderLine.sku,
          suggestions: this.supplierSuggestionsFor(orderLine.sku),
          unit: orderLine.unit,
        });
      }
    }

    const purchaseRequisitions: PurchaseRequisition[] = [];
    if (requisitionLines.length > 0) {
      const requisition: PurchaseRequisition = {
        id: this.nextId('PR'),
        createdAt: this.timestamp(),
        lines: requisitionLines,
        orderId: order.id,
        requiredAt: order.requiredShipAt,
        risk: requisitionLines.some((line) => line.suggestions.length === 0)
          ? '存在产品没有已审核供应商报价'
          : 'AI 推荐仅供采购人员确认',
        status: 'DRAFT',
      };
      this.state.purchaseRequisitions.unshift(requisition);
      purchaseRequisitions.push(requisition);
      this.addRelation(
        'PURCHASE_REQUISITION',
        requisition.id,
        '来源订单',
        'ORDER',
        order.id,
      );
    }

    this.addAudit({
      action: `人工确认 ${analysis.id} 的需求拆分`,
      actor,
      entityId: analysis.id,
      entityType: 'DEMAND_ANALYSIS',
      result: `生成 ${factoryTasks.length} 张工厂任务草稿、${purchaseRequisitions.length} 张采购申请草稿`,
      type: 'HUMAN_CONFIRMATION',
    });
    return clone({ analysis, factoryTasks, purchaseRequisitions });
  }

  async createOrderDraft(
    input: CreateOrderDraftInput,
    actor = '当前用户',
  ): Promise<ContractOrder> {
    requireEntity(this.state.customers, input.customerId, '交易客户');
    if (input.lines.length === 0) {
      throw new TradePrototypeDomainError(
        'VALIDATION_ERROR',
        '合同订单至少需要一条产品明细',
      );
    }
    requireNonNegative(input.additionalFee, '附加费用');
    requirePositive(input.exchangeRate, '签单汇率');

    const lines = input.lines.map((line, index) => {
      requirePositive(line.quantity, `第 ${index + 1} 行数量`);
      requireNonNegative(line.unitPrice, `第 ${index + 1} 行单价`);
      const calculatedAmount = money(multiply(line.quantity, line.unitPrice));
      if (!equals(calculatedAmount, line.amount)) {
        throw new TradePrototypeDomainError(
          'VALIDATION_ERROR',
          `第 ${index + 1} 行金额必须等于数量 × 单价`,
        );
      }
      return {
        ...clone(line),
        id: this.nextId('SOL'),
        amount: calculatedAmount,
        availableStockQty: quantity(line.availableStockQty),
        quantity: quantity(line.quantity),
        suggestedFactoryQty: quantity(line.suggestedFactoryQty),
        suggestedPurchaseQty: quantity(line.suggestedPurchaseQty),
        suggestedStockQty: quantity(line.suggestedStockQty),
        unitPrice: money(line.unitPrice),
      };
    });
    const order: ContractOrder = {
      id: this.nextId('SO'),
      additionalFee: money(input.additionalFee),
      company: input.company,
      currency: input.currency,
      customerId: input.customerId,
      destinationPort: input.destinationPort,
      exchangeRate: rate(input.exchangeRate),
      incoterm: input.incoterm,
      lines,
      originPort: input.originPort,
      owner: input.owner,
      paymentTerms: input.paymentTerms,
      requiredShipAt: input.requiredShipAt,
      risk: 'LOW',
      signedAt: input.signedAt,
      status: 'DRAFT',
      totalAmount: money(
        add(
          sum(lines, (line) => line.amount),
          input.additionalFee,
        ),
      ),
      type: input.type,
    };
    this.state.orders.unshift(order);
    this.addRelation(
      'ORDER',
      order.id,
      '交易客户',
      'CUSTOMER',
      order.customerId,
    );
    this.addAudit({
      action: `创建合同订单草稿 ${order.id}`,
      actor,
      entityId: order.id,
      entityType: 'ORDER',
      result: '草稿已保存，尚未审核',
      type: 'HUMAN_CONFIRMATION',
    });
    return clone(order);
  }

  async createShipmentDraft(
    input: ShipmentDraftInput,
    actor = '当前用户',
  ): Promise<ShipmentDraftResult> {
    const order = requireEntity(this.state.orders, input.orderId, '合同订单');
    const confirmedDemand = this.state.demandAnalyses.some(
      (analysis) =>
        analysis.orderId === input.orderId && analysis.status === 'CONFIRMED',
    );
    if (!confirmedDemand) {
      throw new TradePrototypeDomainError(
        'RULE_VIOLATION',
        '请先人工确认订单的供给需求拆分，再创建发货批次',
      );
    }
    if (input.lines.length === 0) {
      throw new TradePrototypeDomainError(
        'VALIDATION_ERROR',
        '发货批次至少需要一条产品明细',
      );
    }
    const shipmentLines = input.lines.map((line, lineIndex) => {
      const orderLine = requireEntity(
        order.lines,
        line.orderLineId,
        '订单产品行',
      );
      requirePositive(line.quantity, `第 ${lineIndex + 1} 行发货数量`);
      if (isGreaterThan(line.quantity, orderLine.quantity)) {
        throw new TradePrototypeDomainError(
          'RULE_VIOLATION',
          `${orderLine.productName} 本批发货数量不能超过订单数量`,
        );
      }
      const sourceTotal = sum(line.sources, (source) => source.quantity);
      if (!equals(sourceTotal, line.quantity)) {
        throw new TradePrototypeDomainError(
          'RULE_VIOLATION',
          `${orderLine.productName} 的来源分配必须等于本批发货数量`,
        );
      }
      return {
        ...clone(line),
        id: this.nextId('SHL'),
        quantity: quantity(line.quantity),
        sources: line.sources.map((source) => ({
          ...source,
          quantity: quantity(source.quantity),
        })),
      };
    });
    const shipment = {
      id: this.nextId('SH'),
      batch: input.batch,
      createdAt: this.timestamp(),
      eta: input.eta,
      etd: input.etd,
      lines: shipmentLines,
      orderId: input.orderId,
      progress: '0',
      status: 'DRAFT' as const,
    };
    this.state.shipments.unshift(shipment);

    const byLocation = new Map<
      string,
      Array<{ orderLineId: EntityId; quantity: QuantityString }>
    >();
    for (const line of shipmentLines) {
      for (const source of line.sources) {
        const items = byLocation.get(source.sourceLocation) ?? [];
        const existing = items.find(
          (item) => item.orderLineId === line.orderLineId,
        );
        if (existing) {
          existing.quantity = quantity(add(existing.quantity, source.quantity));
        } else {
          items.push({
            orderLineId: line.orderLineId,
            quantity: source.quantity,
          });
        }
        byLocation.set(source.sourceLocation, items);
      }
    }
    const outboundDocuments: OutboundDocument[] = [];
    for (const [location, items] of byLocation.entries()) {
      const document: OutboundDocument = {
        id: this.nextId('OUT'),
        items: items.map((item) => ({
          id: this.nextId('OUTI'),
          orderLineId: item.orderLineId,
          quantity: item.quantity,
        })),
        location,
        orderId: input.orderId,
        shipmentId: shipment.id,
        status: 'DRAFT',
      };
      this.state.outboundDocuments.unshift(document);
      outboundDocuments.push(document);
      this.addRelation(
        'OUTBOUND_DOCUMENT',
        document.id,
        '发货出库草稿',
        'SHIPMENT',
        shipment.id,
      );
    }

    const purchaseOrderIds = [
      ...new Set(
        shipmentLines.flatMap((line) =>
          line.sources.flatMap((source) =>
            source.sourceId &&
            this.state.purchaseOrders.some(
              (order) => order.id === source.sourceId,
            )
              ? [source.sourceId]
              : [],
          ),
        ),
      ),
    ];
    const followUpTask: FollowUpTask = {
      id: this.nextId('FUP'),
      aiReadiness: 'NOT_CHECKED',
      aiReadinessMessage: '尚未运行报关资料 AI 齐套检查',
      customsDocuments: [
        {
          id: this.nextId('DOC'),
          label: '商业发票',
          status: 'READY',
        },
        {
          id: this.nextId('DOC'),
          label: '装箱单最终版',
          status: 'MISSING',
        },
        {
          id: this.nextId('DOC'),
          label: '报关要素',
          status: 'MISSING',
        },
      ],
      milestones: [
        { id: this.nextId('MS'), label: '供应方确认', status: 'PENDING' },
        { id: this.nextId('MS'), label: '订舱', status: 'PENDING' },
        { id: this.nextId('MS'), label: '报关申报', status: 'PENDING' },
        { id: this.nextId('MS'), label: '海关放行', status: 'PENDING' },
        { id: this.nextId('MS'), label: '装船开航', status: 'PENDING' },
      ],
      orderId: input.orderId,
      owner: input.owner,
      purchaseOrderIds,
      shipmentId: shipment.id,
      stage: 'BOOKING',
      status: 'DRAFT',
    };
    this.state.followUpTasks.unshift(followUpTask);
    this.addRelation(
      'SHIPMENT',
      shipment.id,
      '发货订单',
      'ORDER',
      input.orderId,
    );
    this.addRelation(
      'FOLLOW_UP_TASK',
      followUpTask.id,
      '跟单发货批次',
      'SHIPMENT',
      shipment.id,
    );
    this.addAudit({
      action: `创建发货批次草稿 ${shipment.id}`,
      actor,
      entityId: shipment.id,
      entityType: 'SHIPMENT',
      result: `生成 ${outboundDocuments.length} 张出库草稿及 1 张跟单报关任务草稿`,
      type: 'HUMAN_CONFIRMATION',
    });
    return clone({ followUpTask, outboundDocuments, shipment });
  }

  async generateDemandDraft(orderId: EntityId): Promise<DemandAnalysis> {
    const order = requireEntity(this.state.orders, orderId, '合同订单');
    const confirmed = this.state.demandAnalyses.find(
      (analysis) =>
        analysis.orderId === orderId && analysis.status === 'CONFIRMED',
    );
    if (confirmed) {
      throw new TradePrototypeDomainError(
        'RULE_VIOLATION',
        '需求拆分已经人工确认，AI 不能覆盖正式结果',
      );
    }

    let analysis = this.state.demandAnalyses.find(
      (item) => item.orderId === orderId,
    );
    const draftLines = order.lines.map((line) => ({
      id: this.nextId('DAL'),
      confidence: '0.9',
      factoryQty: quantity(line.suggestedFactoryQty),
      orderLineId: line.id,
      purchaseQty: quantity(line.suggestedPurchaseQty),
      stockQty: quantity(line.suggestedStockQty),
      strategy: this.describeSupplyStrategy(line),
    }));

    if (analysis) {
      analysis.generatedAt = this.timestamp();
      analysis.lines = draftLines;
      analysis.status = 'AI_DRAFT';
    } else {
      analysis = {
        id: this.nextId('DA'),
        generatedAt: this.timestamp(),
        lines: draftLines,
        orderId,
        status: 'AI_DRAFT',
      };
      this.state.demandAnalyses.unshift(analysis);
      this.addRelation(
        'DEMAND_ANALYSIS',
        analysis.id,
        '分析订单',
        'ORDER',
        orderId,
      );
    }
    this.addAudit({
      action: `AI 生成 ${orderId} 的供给需求拆分草稿`,
      actor: 'AI 需求助手',
      entityId: analysis.id,
      entityType: 'DEMAND_ANALYSIS',
      result: '仅生成 AI_DRAFT，等待业务员检查库存、自制与外采数量',
      type: 'AI_SUGGESTION',
    });
    return clone(analysis);
  }

  async getOrderRelations(orderId: EntityId): Promise<DocumentRelation[]> {
    requireEntity(this.state.orders, orderId, '合同订单');
    const knownNodes = new Set([documentNodeKey('ORDER', orderId)]);
    const selected = new Set<EntityId>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const relation of this.state.documentRelations) {
        const from = documentNodeKey(relation.fromType, relation.fromId);
        const to = documentNodeKey(relation.toType, relation.toId);
        if (knownNodes.has(from) || knownNodes.has(to)) {
          if (!selected.has(relation.id)) changed = true;
          selected.add(relation.id);
          knownNodes.add(from);
          knownNodes.add(to);
        }
      }
    }
    return clone(
      this.state.documentRelations.filter((relation) =>
        selected.has(relation.id),
      ),
    );
  }

  async getReceivableSummary(orderId: EntityId): Promise<ReceivableSummary> {
    const order = requireEntity(this.state.orders, orderId, '合同订单');
    const actualReceiptAmount = money(
      sum(
        this.state.receiptAllocations.filter(
          (item) => item.orderId === orderId && item.status === 'CONFIRMED',
        ),
        (item) => item.amount,
      ),
    );
    const approvedWriteOffs = this.state.writeOffItems.filter(
      (item) => item.orderId === orderId && item.status === 'APPROVED',
    );
    const consumedBalanceAmount = money(
      sum(
        approvedWriteOffs.filter((item) => item.kind === 'CUSTOMER_BALANCE'),
        (item) => item.amount,
      ),
    );
    const waiverAmount = money(
      sum(
        approvedWriteOffs.filter((item) => item.kind !== 'CUSTOMER_BALANCE'),
        (item) => item.amount,
      ),
    );
    const writeOffAmount = money(
      add(actualReceiptAmount, consumedBalanceAmount, waiverAmount),
    );
    const outstandingAmount = money(
      clampToZero(asBigNumber(order.totalAmount).minus(writeOffAmount)),
    );
    return {
      actualReceiptAmount,
      consumedBalanceAmount,
      contractAmount: money(order.totalAmount),
      outstandingAmount,
      waiverAmount,
      writeOffAmount,
    };
  }

  getSnapshot(): TradePrototypeState {
    return clone(this.state);
  }

  async importTradingCustomer(
    okkiCustomerId: EntityId,
    actor = '当前用户',
  ): Promise<TradePrototypeState['customers'][number]> {
    const okki = requireEntity(
      this.state.okkiCustomers,
      okkiCustomerId,
      'OKKI 客户',
    );
    if (okki.mappedCustomerId) {
      const mapped = this.state.customers.find(
        (customer) => customer.id === okki.mappedCustomerId,
      );
      if (mapped) return clone(mapped);
    }

    const customerId = this.nextId('CUS');
    const customer = {
      id: customerId,
      code: `FT-CUS-${String(this.state.customers.length + 1).padStart(5, '0')}`,
      country: okki.country,
      level: 'B' as const,
      name: okki.name,
      okkiOwner: okki.owner,
      okkiSerialId: okki.serialId,
      orderCount: 0,
      outstandingAmount: '0.00',
      owner: actor,
      syncStatus: 'SYNCED' as const,
      transactionAmount: '0.00',
    };
    this.state.customers.push(customer);
    this.state.contacts.push({
      id: this.nextId('CONT'),
      customerId,
      email: okki.contactEmail,
      isPrimary: true,
      name: okki.contactName,
      phone: okki.contactPhone,
      source: 'OKKI',
    });
    okki.mappedCustomerId = customerId;
    this.addAudit({
      action: `从 OKKI 导入交易客户 ${okki.name}`,
      actor,
      entityId: customerId,
      entityType: 'CUSTOMER',
      result: '已建立 OKKI 映射，中台经营字段独立维护',
      type: 'HUMAN_CONFIRMATION',
    });
    return clone(customer);
  }

  async loadSnapshot(
    v2Candidate?: unknown,
    legacyCandidate?: unknown,
  ): Promise<TradePrototypeState> {
    const resolution = resolvePrototypeSnapshot(
      normalizeCandidate(v2Candidate),
      normalizeCandidate(legacyCandidate),
    );
    this.state = clone(resolution.snapshot);
    this.lastLoadSource = resolution.source;
    return this.getSnapshot();
  }

  async recordReceiptAndWriteOff(
    input: ReceiptWriteOffInput,
  ): Promise<ReceiptWriteOffResult> {
    const order = requireEntity(this.state.orders, input.orderId, '合同订单');
    if (input.currency !== order.currency) {
      throw new TradePrototypeDomainError(
        'VALIDATION_ERROR',
        '一期原型的回款币种必须与订单币种一致；正式系统再增加跨币种折算分配',
      );
    }
    requireNonNegative(input.actualAmount, '实际回款金额');
    requireNonNegative(input.consumedBalanceAmount, '客户余额消费金额');
    requireNonNegative(input.waiverAmount, '减免金额');
    requirePositive(input.rate, '回款日汇率');
    const appliedAmount = add(
      input.actualAmount,
      input.consumedBalanceAmount,
      input.waiverAmount,
    );
    if (equals(appliedAmount, 0)) {
      throw new TradePrototypeDomainError(
        'VALIDATION_ERROR',
        '回款、余额消费和减免不能同时为 0',
      );
    }
    const before = await this.getReceivableSummary(order.id);
    if (isGreaterThan(appliedAmount, before.outstandingAmount)) {
      throw new TradePrototypeDomainError(
        'RULE_VIOLATION',
        '本次冲销金额不能超过订单未回款金额',
      );
    }

    const receipt = {
      id: this.nextId('RC'),
      account: input.account,
      amount: money(input.actualAmount),
      cnyAmount: money(multiply(input.actualAmount, input.rate)),
      currency: input.currency,
      payer: input.payer,
      rate: rate(input.rate),
      receivedAt: input.receivedAt,
      status: 'CONFIRMED' as const,
    };
    this.state.receipts.unshift(receipt);
    const allocation = {
      id: this.nextId('RA'),
      amount: money(input.actualAmount),
      orderId: input.orderId,
      receiptId: receipt.id,
      status: 'CONFIRMED' as const,
    };
    this.state.receiptAllocations.unshift(allocation);

    const writeOffItems: TradePrototypeState['writeOffItems'] = [];
    if (isGreaterThan(input.consumedBalanceAmount, 0)) {
      writeOffItems.push({
        id: this.nextId('WO'),
        amount: money(input.consumedBalanceAmount),
        approvedAt: input.receivedAt,
        kind: 'CUSTOMER_BALANCE',
        orderId: input.orderId,
        remark: '使用客户历史预收余额',
        status: 'APPROVED',
      });
    }
    if (isGreaterThan(input.waiverAmount, 0)) {
      writeOffItems.push({
        id: this.nextId('WO'),
        amount: money(input.waiverAmount),
        approvedAt: input.receivedAt,
        kind: 'WAIVER',
        orderId: input.orderId,
        remark: '人工批准的坏账、手续费差额或商务减免',
        status: 'APPROVED',
      });
    }
    this.state.writeOffItems.unshift(...writeOffItems);
    this.addRelation('RECEIPT', receipt.id, '回款分配', 'ORDER', input.orderId);
    const summary = await this.getReceivableSummary(input.orderId);
    const customer = this.state.customers.find(
      (item) => item.id === order.customerId,
    );
    if (customer) customer.outstandingAmount = summary.outstandingAmount;
    this.addAudit({
      action: `登记回款及冲销 ${receipt.id}`,
      actor: input.actor,
      entityId: receipt.id,
      entityType: 'RECEIPT',
      result: `实际回款 ${summary.actualReceiptAmount}，累计冲销 ${summary.writeOffAmount}，未回款 ${summary.outstandingAmount}`,
      type: 'HUMAN_CONFIRMATION',
    });
    return clone({
      allocations: [allocation],
      receipt,
      summary,
      writeOffItems,
    });
  }

  async reset(): Promise<TradePrototypeState> {
    this.state = createTradePrototypeSeed();
    this.lastLoadSource = 'seed';
    this.addAudit({
      action: '重置外贸 CRM 原型数据',
      actor: '当前用户',
      result: '仅重置当前会话的 v2 原型快照',
      type: 'SYSTEM',
    });
    return this.getSnapshot();
  }

  async searchOkkiCustomers(query: string): Promise<OkkiCustomer[]> {
    const keyword = query.trim().toLocaleLowerCase();
    const matches = keyword
      ? this.state.okkiCustomers.filter((item) =>
          [
            item.name,
            item.country,
            item.serialId,
            item.contactName,
            item.contactEmail,
          ].some((value) => value.toLocaleLowerCase().includes(keyword)),
        )
      : this.state.okkiCustomers;
    return clone(matches);
  }

  async updateDemandSplit(
    analysisId: EntityId,
    lineId: EntityId,
    update: DemandSplitUpdate,
    actor = '当前用户',
  ): Promise<DemandAnalysis> {
    const analysis = requireEntity(
      this.state.demandAnalyses,
      analysisId,
      '需求分析',
    );
    if (analysis.status !== 'AI_DRAFT') {
      throw new TradePrototypeDomainError(
        'RULE_VIOLATION',
        '只有 AI 草稿可以调整拆分数量',
      );
    }
    const line = requireEntity(analysis.lines, lineId, '需求分析产品行');
    requireNonNegative(update.stockQty, '库存数量');
    requireNonNegative(update.factoryQty, '工厂数量');
    requireNonNegative(update.purchaseQty, '外采数量');
    line.stockQty = quantity(update.stockQty);
    line.factoryQty = quantity(update.factoryQty);
    line.purchaseQty = quantity(update.purchaseQty);
    line.strategy = `人工调整：库存 ${line.stockQty} + 内部工厂 ${line.factoryQty} + 外部采购 ${line.purchaseQty}`;
    this.addAudit({
      action: `调整 ${analysis.id} 的需求拆分数量`,
      actor,
      entityId: analysis.id,
      entityType: 'DEMAND_ANALYSIS',
      result: `仅更新 AI_DRAFT，未确认；拆分合计 ${add(line.stockQty, line.factoryQty, line.purchaseQty)}`,
      type: 'HUMAN_CONFIRMATION',
    });
    return clone(analysis);
  }

  async updateFactoryTaskProgress(
    taskId: EntityId,
    completedQty: QuantityString,
    actor = '当前用户',
  ): Promise<FactoryTask> {
    const task = requireEntity(this.state.factoryTasks, taskId, '工厂供货任务');
    requireNonNegative(completedQty, '实际完成数量');
    if (isGreaterThan(completedQty, task.requiredQty)) {
      throw new TradePrototypeDomainError(
        'RULE_VIOLATION',
        '实际完成数量不能超过任务要求数量',
      );
    }
    task.completedQty = quantity(completedQty);
    let nextStatus: FactoryTask['status'] = 'IN_PROGRESS';
    if (equals(completedQty, task.requiredQty)) nextStatus = 'COMPLETED';
    else if (equals(completedQty, 0)) nextStatus = 'ACCEPTED';
    task.status = nextStatus;
    this.addAudit({
      action: `更新工厂供货任务 ${task.id} 的完成进度`,
      actor,
      entityId: task.id,
      entityType: 'FACTORY_TASK',
      result: `${task.completedQty} / ${task.requiredQty}，状态 ${task.status}`,
      type: 'HUMAN_CONFIRMATION',
    });
    return clone(task);
  }

  private addAudit(event: Omit<AuditEvent, 'createdAt' | 'id'>): AuditEvent {
    const audit: AuditEvent = {
      ...event,
      id: this.nextId('AUD'),
      createdAt: this.timestamp(),
    };
    this.state.auditEvents.unshift(audit);
    return audit;
  }

  private addRelation(
    fromType: DocumentType,
    fromId: EntityId,
    relationType: string,
    toType: DocumentType,
    toId: EntityId,
  ): DocumentRelation {
    const existing = this.state.documentRelations.find(
      (relation) =>
        relation.fromType === fromType &&
        relation.fromId === fromId &&
        relation.relationType === relationType &&
        relation.toType === toType &&
        relation.toId === toId,
    );
    if (existing) return existing;
    const relation: DocumentRelation = {
      id: this.nextId('REL'),
      fromId,
      fromType,
      relationType,
      toId,
      toType,
    };
    this.state.documentRelations.unshift(relation);
    return relation;
  }

  private describeSupplyStrategy(line: ContractOrder['lines'][number]): string {
    const parts: string[] = [];
    if (isGreaterThan(line.suggestedStockQty, 0)) {
      parts.push(`库存 ${line.suggestedStockQty}`);
    }
    if (isGreaterThan(line.suggestedFactoryQty, 0)) {
      parts.push(`内部工厂 ${line.suggestedFactoryQty}`);
    }
    if (isGreaterThan(line.suggestedPurchaseQty, 0)) {
      parts.push(`外部采购 ${line.suggestedPurchaseQty}`);
    }
    return parts.length > 0 ? parts.join(' + ') : '待人工配置供给策略';
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    const stamp = this.now()
      .toISOString()
      .replaceAll(/[-:.TZ]/g, '')
      .slice(0, 14);
    return `${prefix}-${stamp}-${String(this.idCounter).padStart(4, '0')}`;
  }

  private supplierSuggestionsFor(sku: string): SupplierSuggestion[] {
    return this.state.suppliers
      .filter(
        (supplier) =>
          supplier.status === 'APPROVED' &&
          supplier.quotes.some((quote) => quote.sku === sku),
      )
      .toSorted(
        (left, right) =>
          asBigNumber(right.onTimeRate)
            .plus(right.qualityRate)
            .comparedTo(asBigNumber(left.onTimeRate).plus(left.qualityRate)) ??
          0,
      )
      .map((supplier, index) => ({
        confidence: quantity(Math.max(0.7, 0.94 - index * 0.07)),
        reason: `已审核供应商；准时交付率 ${supplier.onTimeRate}，质量合格率 ${supplier.qualityRate}，当前负载 ${supplier.currentLoad}`,
        supplierId: supplier.id,
      }));
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

export function createTradePrototypeGateway(
  options?: TradePrototypeGatewayOptions,
): TradePrototypeGateway {
  return new TradePrototypeGateway(options);
}
