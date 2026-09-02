import type {
  ContractOrder,
  CurrencyCode,
  DocumentType,
  EntityId,
  PurchaseOrder,
  ReceivableSummary,
  Supplier,
  TradePrototypeState,
} from '../domain/types';
import type {
  TradeAiEvidence,
  TradeAiGuardrail,
  TradeAiPageKey,
  TradeAiRecommendation,
  TradeAiRequest,
  TradeAiResponse,
  TradeAiTone,
} from './types';

import {
  add,
  asBigNumber,
  clampToZero,
  equals,
  isGreaterThan,
  money,
  subtract,
  sum,
} from '../domain/money';
import { getTradeAiPageProfile } from './profiles';

const DATA_SCOPE_NOTICE =
  '分析仅基于当前浏览器会话中的原型数据，未连接 OKKI、ERP/WMS、银行、海关、审批或真实 AI 接口。';

const PAGE_ROUTES: Record<TradeAiPageKey, string> = {
  workbench: '/fdmwaimao/workbench',
  customer: '/fdmwaimao/customer',
  'contract-order': '/fdmwaimao/contract-order',
  'demand-analysis': '/fdmwaimao/demand-analysis',
  supplier: '/fdmpurchase/supplier',
  requisition: '/fdmpurchase/requisition',
  'purchase-order': '/fdmpurchase/order',
  'follow-up-customs': '/fdmpurchase/follow-up-customs',
  'supply-execution': '/fdmsupplychain/supply-execution',
  'shipment-outbound': '/fdmsupplychain/shipment-outbound',
  'receipt-writeoff': '/fdmtradefinance/receipt-writeoff',
  'payable-expense': '/fdmtradefinance/payable-expense',
};

interface AnalysisDraft {
  evidence: TradeAiEvidence[];
  recommendations: TradeAiRecommendation[];
  summary: string;
  title: string;
  tone: TradeAiTone;
}

function formatMoney(
  currency: CurrencyCode | undefined,
  value: string,
): string {
  return `${currency ?? 'CNY'} ${money(value)}`;
}

function formatPercent(value: string): string {
  return `${asBigNumber(value).multipliedBy(100).decimalPlaces(1).toFixed(1)}%`;
}

function maxByDecimal<T>(
  values: readonly T[],
  select: (item: T) => string,
): T | undefined {
  let current: T | undefined;
  for (const item of values) {
    if (!current || isGreaterThan(select(item), select(current))) {
      current = item;
    }
  }
  return current;
}

function receivableSummary(
  state: Readonly<TradePrototypeState>,
  order: ContractOrder,
): ReceivableSummary {
  const actualReceiptAmount = sum(
    state.receiptAllocations.filter(
      (item) => item.orderId === order.id && item.status === 'CONFIRMED',
    ),
    (item) => item.amount,
  );
  const activeWriteOffs = state.writeOffItems.filter(
    (item) => item.orderId === order.id && item.status === 'APPROVED',
  );
  const consumedBalanceAmount = sum(
    activeWriteOffs.filter((item) => item.kind === 'CUSTOMER_BALANCE'),
    (item) => item.amount,
  );
  const waiverAmount = sum(
    activeWriteOffs.filter((item) => item.kind === 'WAIVER'),
    (item) => item.amount,
  );
  const adjustments = sum(activeWriteOffs, (item) => item.amount);
  const writeOffAmount = add(actualReceiptAmount, adjustments);

  return {
    actualReceiptAmount: money(actualReceiptAmount),
    consumedBalanceAmount: money(consumedBalanceAmount),
    contractAmount: money(order.totalAmount),
    outstandingAmount: money(
      clampToZero(subtract(order.totalAmount, writeOffAmount)),
    ),
    waiverAmount: money(waiverAmount),
    writeOffAmount: money(writeOffAmount),
  };
}

function resolveOrderId(
  state: Readonly<TradePrototypeState>,
  documentId: string | undefined,
): EntityId | undefined {
  if (!documentId) return undefined;
  if (state.orders.some((item) => item.id === documentId)) return documentId;

  const demand = state.demandAnalyses.find((item) => item.id === documentId);
  if (demand) return demand.orderId;
  const requisition = state.purchaseRequisitions.find(
    (item) => item.id === documentId,
  );
  if (requisition) return requisition.orderId;
  const purchaseOrder = state.purchaseOrders.find(
    (item) => item.id === documentId,
  );
  if (purchaseOrder) return purchaseOrder.orderId;
  const factoryTask = state.factoryTasks.find((item) => item.id === documentId);
  if (factoryTask) return factoryTask.orderId;
  const followUp = state.followUpTasks.find((item) => item.id === documentId);
  if (followUp) return followUp.orderId;
  const shipment = state.shipments.find((item) => item.id === documentId);
  if (shipment) return shipment.orderId;
  const outbound = state.outboundDocuments.find(
    (item) => item.id === documentId,
  );
  if (outbound) return outbound.orderId;
  const expense = state.orderExpenses.find((item) => item.id === documentId);
  if (expense) return expense.orderId;
  const allocation = state.receiptAllocations.find(
    (item) => item.receiptId === documentId,
  );
  if (allocation) return allocation.orderId;
  const writeOff = state.writeOffItems.find((item) => item.id === documentId);
  if (writeOff) return writeOff.orderId;
  const customer = state.customers.find((item) => item.id === documentId);
  if (customer) {
    return state.orders.find((item) => item.customerId === customer.id)?.id;
  }
  const payment = state.payments.find((item) => item.id === documentId);
  const paymentPurchaseOrderId = payment?.allocations[0]?.purchaseOrderId;
  if (paymentPurchaseOrderId) {
    return state.purchaseOrders.find(
      (item) => item.id === paymentPurchaseOrderId,
    )?.orderId;
  }
  const invoice = state.supplierInvoices.find((item) => item.id === documentId);
  const invoicePurchaseOrderId = invoice?.allocations[0]?.purchaseOrderId;
  return state.purchaseOrders.find((item) => item.id === invoicePurchaseOrderId)
    ?.orderId;
}

function evidenceDocument(
  label: string,
  value: string,
  documentId: string,
  documentType: DocumentType,
  tone?: TradeAiTone,
  detail?: string,
): TradeAiEvidence {
  return { detail, documentId, documentType, label, tone, value };
}

function recommendation(
  title: string,
  description: string,
  priority: TradeAiRecommendation['priority'],
  route: string,
  documentId?: string,
  documentType?: DocumentType,
): TradeAiRecommendation {
  return {
    description,
    documentId,
    documentType,
    priority,
    route,
    title,
  };
}

function workbenchAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
): AnalysisDraft {
  const highRiskOrders = state.orders.filter((item) => item.risk === 'HIGH');
  const blockedFollowUps = state.followUpTasks.filter(
    (item) => item.aiReadiness === 'BLOCKED' || item.status === 'BLOCKED',
  );
  const pendingSupplierSelections = state.purchaseRequisitions.filter((item) =>
    item.lines.some((line) => !line.selectedSupplierId),
  );
  const unverifiedInvoices = state.supplierInvoices.filter(
    (item) => item.status === 'PENDING_VERIFICATION',
  );
  const outstanding = sum(
    state.orders,
    (item) => receivableSummary(state, item).outstandingAmount,
  );
  const isPriority = focusId === 'workbench-priority';

  return {
    evidence: [
      {
        label: '高风险订单',
        value: `${highRiskOrders.length} 张`,
        tone: highRiskOrders.length > 0 ? 'danger' : 'success',
      },
      {
        label: '报关资料阻塞',
        value: `${blockedFollowUps.length} 项`,
        tone: blockedFollowUps.length > 0 ? 'danger' : 'success',
      },
      {
        label: '待选供应商申请',
        value: `${pendingSupplierSelections.length} 张`,
        tone: pendingSupplierSelections.length > 0 ? 'warning' : 'success',
      },
      {
        label: '未验真供应商发票',
        value: `${unverifiedInvoices.length} 张`,
        tone: unverifiedInvoices.length > 0 ? 'warning' : 'success',
      },
      { label: '全部订单未回款', value: formatMoney('USD', outstanding) },
    ],
    recommendations: [
      recommendation(
        '先补齐报关资料',
        blockedFollowUps[0]?.aiReadinessMessage ?? '当前没有资料阻塞任务。',
        blockedFollowUps.length > 0 ? 'HIGH' : 'LOW',
        PAGE_ROUTES['follow-up-customs'],
        blockedFollowUps[0]?.id,
        blockedFollowUps[0] ? 'FOLLOW_UP_TASK' : undefined,
      ),
      recommendation(
        '确认未选供应商的采购申请',
        '比较报价、交期、准时率、质量与当前负荷后，仅生成采购订单草稿。',
        pendingSupplierSelections.length > 0 ? 'HIGH' : 'LOW',
        PAGE_ROUTES.requisition,
        pendingSupplierSelections[0]?.id,
        pendingSupplierSelections[0] ? 'PURCHASE_REQUISITION' : undefined,
      ),
      recommendation(
        '核对发票与应付差额',
        '供应商发票验真和采购付款仍由财务权威页面确认。',
        unverifiedInvoices.length > 0 ? 'MEDIUM' : 'LOW',
        PAGE_ROUTES['payable-expense'],
        unverifiedInvoices[0]?.id,
        unverifiedInvoices[0] ? 'SUPPLIER_INVOICE' : undefined,
      ),
    ],
    summary: isPriority
      ? `建议先处理 ${blockedFollowUps.length} 项报关资料阻塞，再处理 ${pendingSupplierSelections.length} 张待选供应商申请，最后核对财务差额。`
      : `当前识别到 ${highRiskOrders.length + blockedFollowUps.length} 项高关注业务信号；证据来自订单、跟单、采购申请和应付记录。`,
    title: isPriority ? '今日优先处理建议' : '跨部门风险概览',
    tone:
      highRiskOrders.length + blockedFollowUps.length > 0
        ? 'warning'
        : 'success',
  };
}

function customerAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
): AnalysisDraft {
  const selected = state.customers.find((item) => item.id === selectedId);
  const highestOutstanding = maxByDecimal(
    state.customers,
    (item) => item.outstandingAmount,
  );
  const target = selected ?? highestOutstanding;
  const unmapped = state.okkiCustomers.filter((item) => !item.mappedCustomerId);
  const targetOrders = state.orders.filter(
    (item) => item.customerId === target?.id,
  );
  const syncPending = state.customers.filter(
    (item) => item.syncStatus === 'PENDING',
  );
  const importFocus = focusId === 'customer-import';

  return {
    evidence: [
      {
        label: '当前分析客户',
        value: target?.name ?? '暂无交易客户',
        tone: target?.level === 'A' ? 'success' : 'info',
      },
      {
        label: '累计交易额',
        value: formatMoney('USD', target?.transactionAmount ?? '0'),
      },
      {
        label: '未回款',
        value: formatMoney('USD', target?.outstandingAmount ?? '0'),
        tone: isGreaterThan(target?.outstandingAmount ?? '0', '0')
          ? 'warning'
          : 'success',
      },
      { label: '关联合同订单', value: `${targetOrders.length} 张` },
      {
        label: '可导入 OKKI 候选',
        value: `${unmapped.length} 个`,
        detail: unmapped.map((item) => item.name).join('、') || '暂无',
      },
      { label: '同步待处理', value: `${syncPending.length} 个` },
    ],
    recommendations: [
      recommendation(
        '跟进最高未回款客户',
        `${highestOutstanding?.name ?? '暂无客户'} 当前未回款 ${formatMoney('USD', highestOutstanding?.outstandingAmount ?? '0')}。`,
        highestOutstanding &&
          isGreaterThan(highestOutstanding.outstandingAmount, '0')
          ? 'HIGH'
          : 'LOW',
        PAGE_ROUTES.customer,
        highestOutstanding?.id,
        highestOutstanding ? 'CUSTOMER' : undefined,
      ),
      recommendation(
        '人工确认 OKKI 导入',
        '只导入准备下单的客户与联系人；中台交易、利润和风险字段不由 OKKI 覆盖。',
        unmapped.length > 0 ? 'MEDIUM' : 'LOW',
        PAGE_ROUTES.customer,
      ),
    ],
    summary: importFocus
      ? `发现 ${unmapped.length} 个尚未映射的 OKKI 候选；建议逐一查重后人工导入。`
      : `${target?.name ?? '当前客户'} 关联 ${targetOrders.length} 张订单，未回款 ${formatMoney('USD', target?.outstandingAmount ?? '0')}。`,
    title: importFocus ? 'OKKI 导入候选分析' : '交易客户经营分析',
    tone:
      target && isGreaterThan(target.outstandingAmount, '0')
        ? 'warning'
        : 'info',
  };
}

function orderAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
): AnalysisDraft {
  const orderId = resolveOrderId(state, selectedId);
  const order =
    state.orders.find((item) => item.id === orderId) ??
    state.orders.find((item) => item.risk === 'HIGH') ??
    state.orders[0];
  if (!order) return emptyAnalysis('合同订单', PAGE_ROUTES['contract-order']);

  const summary = receivableSummary(state, order);
  const demand = state.demandAnalyses.find((item) => item.orderId === order.id);
  const requisitions = state.purchaseRequisitions.filter(
    (item) => item.orderId === order.id,
  );
  const factoryTasks = state.factoryTasks.filter(
    (item) => item.orderId === order.id,
  );
  const shipments = state.shipments.filter((item) => item.orderId === order.id);
  const blockedFollowUps = state.followUpTasks.filter(
    (item) =>
      item.orderId === order.id &&
      (item.status === 'BLOCKED' || item.aiReadiness === 'BLOCKED'),
  );
  const formulaFocus = focusId === 'order-receivable';
  const supplyReady = Boolean(demand) && demand?.status === 'CONFIRMED';

  return {
    evidence: [
      evidenceDocument(
        '当前订单',
        order.id,
        order.id,
        'ORDER',
        order.risk === 'HIGH' ? 'danger' : 'info',
      ),
      {
        label: '实际回款',
        value: formatMoney(order.currency, summary.actualReceiptAmount),
      },
      {
        label: '回款冲销',
        value: formatMoney(order.currency, summary.writeOffAmount),
        detail: '真实回款分配 + 客户余额消费 + 审核减免',
      },
      {
        label: '未回款',
        value: formatMoney(order.currency, summary.outstandingAmount),
        tone: isGreaterThan(summary.outstandingAmount, '0')
          ? 'warning'
          : 'success',
      },
      {
        label: '供给单据',
        value: `${requisitions.length} 张采购申请 / ${factoryTasks.length} 张工厂任务`,
        tone: supplyReady ? 'success' : 'warning',
      },
      {
        label: '发货与资料',
        value: `${shipments.length} 批发货 / ${blockedFollowUps.length} 项阻塞`,
        tone: blockedFollowUps.length > 0 ? 'danger' : 'info',
      },
    ],
    recommendations: [
      recommendation(
        demand ? '复核需求拆分' : '先生成需求分析草稿',
        demand
          ? '确认库存、工厂和外采数量守恒后，再形成下游草稿。'
          : 'AI 只读取订单产品并生成草稿，需外贸人员检查确认。',
        demand ? 'MEDIUM' : 'HIGH',
        PAGE_ROUTES['demand-analysis'],
        demand?.id,
        demand ? 'DEMAND_ANALYSIS' : undefined,
      ),
      recommendation(
        '处理发货前资料缺项',
        blockedFollowUps[0]?.aiReadinessMessage ?? '当前未识别到资料阻塞。',
        blockedFollowUps.length > 0 ? 'HIGH' : 'LOW',
        PAGE_ROUTES['follow-up-customs'],
        blockedFollowUps[0]?.id,
        blockedFollowUps[0] ? 'FOLLOW_UP_TASK' : undefined,
      ),
      recommendation(
        '跟踪未回款',
        `未回款为 ${formatMoney(order.currency, summary.outstandingAmount)}；任何余额消费或减免都必须单独留痕。`,
        isGreaterThan(summary.outstandingAmount, '0') ? 'MEDIUM' : 'LOW',
        PAGE_ROUTES['receipt-writeoff'],
        order.id,
        'ORDER',
      ),
    ],
    summary: formulaFocus
      ? `订单 ${order.id} 的实际回款为 ${formatMoney(order.currency, summary.actualReceiptAmount)}，回款冲销为 ${formatMoney(order.currency, summary.writeOffAmount)}，因此未回款为 ${formatMoney(order.currency, summary.outstandingAmount)}。`
      : `订单 ${order.id} 当前需同时关注未回款 ${formatMoney(order.currency, summary.outstandingAmount)}、需求分析 ${demand?.status ?? '未生成'} 和 ${blockedFollowUps.length} 项报关资料阻塞。`,
    title: formulaFocus ? '回款与冲销口径解释' : '合同订单四链分析',
    tone:
      order.risk === 'HIGH' || blockedFollowUps.length > 0 ? 'warning' : 'info',
  };
}

function demandAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
): AnalysisDraft {
  const violations: Array<{ analysisId: string; lineId: string }> = [];
  for (const analysis of state.demandAnalyses) {
    const order = state.orders.find((item) => item.id === analysis.orderId);
    for (const line of analysis.lines) {
      const orderLine = order?.lines.find(
        (item) => item.id === line.orderLineId,
      );
      if (
        orderLine &&
        !equals(
          add(line.stockQty, line.factoryQty, line.purchaseQty),
          orderLine.quantity,
        )
      ) {
        violations.push({ analysisId: analysis.id, lineId: line.id });
      }
    }
  }
  const pendingOrders = state.orders.filter(
    (order) => !state.demandAnalyses.some((item) => item.orderId === order.id),
  );
  const selected = state.demandAnalyses.find((item) => item.id === selectedId);
  const averageConfidence = selected?.lines.length
    ? asBigNumber(sum(selected.lines, (item) => item.confidence))
        .dividedBy(selected.lines.length)
        .decimalPlaces(3)
        .toFixed(3)
    : '0';
  const conservationFocus = focusId === 'demand-conservation';
  let demandSummary = `当前有 ${pendingOrders.length} 张订单尚未生成需求分析，${violations.length} 行存在硬规则问题。`;
  if (conservationFocus) {
    demandSummary =
      violations.length > 0
        ? `发现 ${violations.length} 个产品行不满足数量守恒，必须先修正。`
        : '当前已生成分析的所有产品行均满足数量守恒。';
  }
  let demandTone: TradeAiTone = 'success';
  if (violations.length > 0) demandTone = 'danger';
  else if (pendingOrders.length > 0) demandTone = 'warning';

  return {
    evidence: [
      {
        label: '数量不守恒产品行',
        value: `${violations.length} 行`,
        tone: violations.length > 0 ? 'danger' : 'success',
        detail: '库存 + 工厂 + 外采必须等于订单数量',
      },
      {
        label: '未生成需求分析订单',
        value: `${pendingOrders.length} 张`,
        tone: pendingOrders.length > 0 ? 'warning' : 'success',
      },
      {
        label: '已确认分析',
        value: `${state.demandAnalyses.filter((item) => item.status === 'CONFIRMED').length} 张`,
      },
      {
        label: '当前分析平均可信度',
        value: formatPercent(averageConfidence),
        detail: selected ? selected.id : '请先选择一张需求分析单',
      },
    ],
    recommendations: [
      recommendation(
        violations.length > 0 ? '先修正数量不守恒' : '保持硬规则校验',
        violations.length > 0
          ? '数量不守恒时禁止生成采购申请或工厂供货任务草稿。'
          : '当前已分析产品行数量守恒，可继续人工复核策略。',
        violations.length > 0 ? 'HIGH' : 'LOW',
        PAGE_ROUTES['demand-analysis'],
        violations[0]?.analysisId,
        violations[0] ? 'DEMAND_ANALYSIS' : undefined,
      ),
      recommendation(
        '为未分析订单生成 AI 草稿',
        'AI 仅给出库存、工厂和外采建议；业务员确认后才生成下游草稿。',
        pendingOrders.length > 0 ? 'MEDIUM' : 'LOW',
        PAGE_ROUTES['contract-order'],
        pendingOrders[0]?.id,
        pendingOrders[0] ? 'ORDER' : undefined,
      ),
    ],
    summary: demandSummary,
    title: conservationFocus ? '需求拆分守恒校验' : '需求分析待处理概览',
    tone: demandTone,
  };
}

function supplierScore(supplier: Supplier): string {
  return asBigNumber(supplier.onTimeRate)
    .plus(supplier.qualityRate)
    .minus(asBigNumber(supplier.currentLoad.replace('%', '')).dividedBy(100))
    .toFixed(4);
}

function supplierAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
): AnalysisDraft {
  const approved = state.suppliers.filter((item) => item.status === 'APPROVED');
  const recommended = maxByDecimal(approved, supplierScore);
  const selected = state.suppliers.find((item) => item.id === selectedId);
  const target = selected ?? recommended;
  const risky = state.suppliers.filter(
    (item) => item.risk === 'HIGH' || item.risk === 'MEDIUM',
  );
  const quote = target?.quotes[0];
  let supplierTone: TradeAiTone = 'info';
  if (target?.risk === 'HIGH') supplierTone = 'danger';
  else if (target?.risk === 'MEDIUM') supplierTone = 'warning';

  return {
    evidence: [
      { label: '已审核供应商', value: `${approved.length} 家` },
      {
        label: '当前分析供应商',
        value: target?.name ?? '暂无',
        tone: target?.risk === 'LOW' ? 'success' : 'warning',
      },
      {
        label: '准时率 / 合格率',
        value: `${formatPercent(target?.onTimeRate ?? '0')} / ${formatPercent(target?.qualityRate ?? '0')}`,
      },
      { label: '当前负荷', value: target?.currentLoad ?? '—' },
      {
        label: '最近报价 / 交期',
        value: quote
          ? `${formatMoney(quote.currency, quote.unitPrice)} / ${quote.leadTimeDays} 天`
          : '暂无有效报价',
      },
      {
        label: '中高风险供应商',
        value: `${risky.length} 家`,
        tone: risky.length > 0 ? 'warning' : 'success',
      },
    ],
    recommendations: [
      recommendation(
        '以确定性数据复核候选',
        `${recommended?.name ?? '暂无候选'} 的综合交付稳定性较好；仍需采购人员核对产品版本、MOQ、交期与付款条件。`,
        'MEDIUM',
        PAGE_ROUTES.supplier,
      ),
      recommendation(
        '不要让 AI 直接选定正式供应商',
        'AI 只解释推荐依据，正式选择由采购人员在采购申请中确认。',
        'HIGH',
        PAGE_ROUTES.requisition,
      ),
    ],
    summary:
      focusId === 'supplier-best-fit'
        ? `基于当前样例的准时率、质量率和负荷，${recommended?.name ?? '暂无供应商'} 更稳妥；此结论不等同于正式选定。`
        : `${target?.name ?? '当前供应商'} 的准时率为 ${formatPercent(target?.onTimeRate ?? '0')}，质量合格率为 ${formatPercent(target?.qualityRate ?? '0')}，当前负荷 ${target?.currentLoad ?? '—'}。`,
    title: '供应商可解释分析',
    tone: supplierTone,
  };
}

function requisitionAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
): AnalysisDraft {
  const selected = state.purchaseRequisitions.find(
    (item) => item.id === selectedId,
  );
  const target =
    selected ??
    state.purchaseRequisitions.find((item) =>
      item.lines.some((line) => !line.selectedSupplierId),
    ) ??
    state.purchaseRequisitions[0];
  const unsourcedLines = state.purchaseRequisitions.flatMap((item) =>
    item.lines
      .filter((line) => !line.selectedSupplierId)
      .map((line) => ({ ...line, requisitionId: item.id })),
  );
  const ready = state.purchaseRequisitions.filter(
    (item) =>
      item.status === 'CONFIRMED' &&
      item.lines.every((line) => line.suggestions.length > 0),
  );
  const suggestions = target?.lines.flatMap((line) => line.suggestions) ?? [];
  const sourceOrder = state.orders.find((item) => item.id === target?.orderId);

  return {
    evidence: [
      ...(target
        ? [
            evidenceDocument(
              '当前采购申请',
              target.id,
              target.id,
              'PURCHASE_REQUISITION',
            ),
          ]
        : []),
      {
        label: '来源合同',
        value: sourceOrder?.id ?? '—',
        documentId: sourceOrder?.id,
        documentType: sourceOrder ? 'ORDER' : undefined,
      },
      { label: '候选供应商建议', value: `${suggestions.length} 条` },
      {
        label: '未选供应商产品行',
        value: `${unsourcedLines.length} 行`,
        tone: unsourcedLines.length > 0 ? 'warning' : 'success',
      },
      { label: '可形成采购单草稿', value: `${ready.length} 张` },
      { label: '风险说明', value: target?.risk ?? '暂无' },
    ],
    recommendations: [
      recommendation(
        '复核未选供应商产品行',
        '比较报价、MOQ、交期、交付与质量后，由采购人员采用建议。',
        unsourcedLines.length > 0 ? 'HIGH' : 'LOW',
        PAGE_ROUTES.requisition,
        unsourcedLines[0]?.requisitionId,
        unsourcedLines[0] ? 'PURCHASE_REQUISITION' : undefined,
      ),
      recommendation(
        '仅生成采购订单草稿',
        '采用建议后保留采购来源分配，不自动发送正式订单。',
        ready.length > 0 ? 'MEDIUM' : 'LOW',
        PAGE_ROUTES['purchase-order'],
      ),
    ],
    summary:
      focusId === 'requisition-ready'
        ? `当前有 ${ready.length} 张采购申请具备生成采购订单草稿的基础条件，仍需采购人员确认供应商。`
        : `${target?.id ?? '当前申请'} 有 ${suggestions.length} 条供应商建议；全局仍有 ${unsourcedLines.length} 个产品行未选供应商。`,
    title: '采购申请转单分析',
    tone: unsourcedLines.length > 0 ? 'warning' : 'info',
  };
}

function inboundQuantity(
  state: Readonly<TradePrototypeState>,
  purchaseOrder: PurchaseOrder,
): string {
  const orderLineIds = new Set(
    purchaseOrder.items.map((item) => item.orderLineId),
  );
  return sum(
    state.inboundDocuments
      .filter(
        (document) =>
          document.purchaseOrderId === purchaseOrder.id &&
          document.status === 'CONFIRMED',
      )
      .flatMap((document) => document.items)
      .filter((item) => orderLineIds.has(item.orderLineId)),
    (item) => item.quantity,
  );
}

function purchaseOrderAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
  now = new Date().toISOString(),
): AnalysisDraft {
  const selected = state.purchaseOrders.find((item) => item.id === selectedId);
  const target = selected ?? state.purchaseOrders[0];
  if (!target) return emptyAnalysis('采购订单', PAGE_ROUTES['purchase-order']);
  const payableGap = clampToZero(
    subtract(target.totalAmount, target.paidAmount),
  );
  const invoiceGap = clampToZero(
    subtract(target.totalAmount, target.invoicedAmount),
  );
  const orderedQty = sum(target.items, (item) => item.quantity);
  const receivedQty = inboundQuantity(state, target);
  const inboundGap = clampToZero(subtract(orderedQty, receivedQty));
  const delayed =
    target.expectedAt < now.slice(0, 10) &&
    !['CANCELLED', 'COMPLETED'].includes(target.status);
  const supplier = state.suppliers.find(
    (item) => item.id === target.supplierId,
  );
  let purchaseSummary = `${target.id} 未付款 ${formatMoney(target.currency, payableGap)}、未覆盖发票 ${formatMoney(target.currency, invoiceGap)}、尚未入库 ${inboundGap} 件。`;
  if (focusId === 'purchase-delay') {
    purchaseSummary = delayed
      ? `${target.id} 已超过预计交期且未完成，需要立即核实。`
      : `${target.id} 尚未超过预计交期，但仍有 ${inboundGap} 件未入库。`;
  }
  let purchaseTone: TradeAiTone = 'info';
  if (delayed) purchaseTone = 'danger';
  else if (isGreaterThan(inboundGap, '0')) purchaseTone = 'warning';

  return {
    evidence: [
      evidenceDocument(
        '当前采购订单',
        target.id,
        target.id,
        'PURCHASE_ORDER',
        delayed ? 'danger' : 'info',
      ),
      { label: '供应商', value: supplier?.name ?? target.supplierId },
      {
        label: '采购 / 未付款',
        value: `${formatMoney(target.currency, target.totalAmount)} / ${formatMoney(target.currency, payableGap)}`,
        tone: isGreaterThan(payableGap, '0') ? 'warning' : 'success',
      },
      {
        label: '未覆盖发票金额',
        value: formatMoney(target.currency, invoiceGap),
        tone: isGreaterThan(invoiceGap, '0') ? 'warning' : 'success',
      },
      {
        label: '采购 / 已入库数量',
        value: `${orderedQty} / ${receivedQty}`,
        detail: `尚未入库 ${inboundGap}`,
      },
      {
        label: '预计交期',
        value: target.expectedAt,
        tone: delayed ? 'danger' : 'info',
      },
    ],
    recommendations: [
      recommendation(
        delayed ? '立即核实采购延期' : '继续跟踪预计交期',
        `采购单仍有 ${inboundGap} 件未入库；跟单人员需核实供应商实际完工和运输节点。`,
        delayed ? 'HIGH' : 'MEDIUM',
        PAGE_ROUTES['follow-up-customs'],
        target.id,
        'PURCHASE_ORDER',
      ),
      recommendation(
        '核对付款与发票分配',
        `未付款 ${formatMoney(target.currency, payableGap)}，未覆盖发票 ${formatMoney(target.currency, invoiceGap)}。`,
        isGreaterThan(payableGap, '0') || isGreaterThan(invoiceGap, '0')
          ? 'MEDIUM'
          : 'LOW',
        PAGE_ROUTES['payable-expense'],
        target.id,
        'PURCHASE_ORDER',
      ),
    ],
    summary: purchaseSummary,
    title: '采购订单执行差异分析',
    tone: purchaseTone,
  };
}

function customsAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
): AnalysisDraft {
  const selected = state.followUpTasks.find((item) => item.id === selectedId);
  const target =
    selected ??
    state.followUpTasks.find((item) => item.aiReadiness === 'BLOCKED') ??
    state.followUpTasks[0];
  if (!target)
    return emptyAnalysis('跟单与报关', PAGE_ROUTES['follow-up-customs']);
  const missing = target.customsDocuments.filter(
    (item) => item.status === 'MISSING',
  );
  const nextMilestone = target.milestones.find(
    (item) => item.status === 'PENDING',
  );
  const blocked = state.followUpTasks.filter(
    (item) => item.aiReadiness === 'BLOCKED' || item.status === 'BLOCKED',
  );
  let customsSummary = `${target.id} 当前节点为 ${target.stage}，下一待办节点为 ${nextMilestone?.label ?? '暂无'}。`;
  if (focusId === 'customs-missing') {
    customsSummary =
      missing.length > 0
        ? `${target.id} 缺少 ${missing.map((item) => item.label).join('、')}，当前不能视为资料齐套。`
        : `${target.id} 当前资料齐套，但仍需人工确认申报版本。`;
  }

  return {
    evidence: [
      evidenceDocument(
        '当前跟单任务',
        target.id,
        target.id,
        'FOLLOW_UP_TASK',
        missing.length > 0 ? 'danger' : 'info',
      ),
      { label: '当前节点', value: target.stage },
      {
        label: '缺失报关资料',
        value: `${missing.length} 项`,
        detail: missing.map((item) => item.label).join('、') || '资料已齐套',
        tone: missing.length > 0 ? 'danger' : 'success',
      },
      { label: '下一节点', value: nextMilestone?.label ?? '暂无待办节点' },
      {
        label: '全部阻塞任务',
        value: `${blocked.length} 项`,
        tone: blocked.length > 0 ? 'warning' : 'success',
      },
    ],
    recommendations: [
      recommendation(
        missing.length > 0 ? `补齐：${missing[0]?.label}` : '保持资料版本一致',
        target.aiReadinessMessage,
        missing.length > 0 ? 'HIGH' : 'LOW',
        PAGE_ROUTES['follow-up-customs'],
        target.id,
        'FOLLOW_UP_TASK',
      ),
      recommendation(
        `准备下一节点：${nextMilestone?.label ?? '等待业务确认'}`,
        'AI 只检查缺项，海关申报、查验和放行必须由责任人确认。',
        'MEDIUM',
        PAGE_ROUTES['shipment-outbound'],
        target.shipmentId,
        target.shipmentId ? 'SHIPMENT' : undefined,
      ),
    ],
    summary: customsSummary,
    title: '报关资料与节点分析',
    tone: missing.length > 0 ? 'danger' : 'info',
  };
}

function supplyExecutionAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
  now = new Date().toISOString(),
): AnalysisDraft {
  const selected = state.factoryTasks.find((item) => item.id === selectedId);
  const target = selected ?? state.factoryTasks[0];
  const remaining = sum(state.factoryTasks, (item) =>
    clampToZero(subtract(item.requiredQty, item.completedQty)),
  );
  const delayed = state.factoryTasks.filter(
    (item) =>
      item.requiredAt < now.slice(0, 10) &&
      !['COMPLETED', 'DELIVERED'].includes(item.status),
  );
  const confirmedInboundQty = sum(
    state.inboundDocuments
      .filter((item) => item.status === 'CONFIRMED')
      .flatMap((item) => item.items),
    (item) => item.quantity,
  );
  const draftOutbounds = state.outboundDocuments.filter(
    (item) => item.status === 'DRAFT',
  );
  let supplyTone: TradeAiTone = 'info';
  if (delayed.length > 0) supplyTone = 'danger';
  else if (isGreaterThan(remaining, '0')) supplyTone = 'warning';

  return {
    evidence: [
      {
        label: '工厂任务待完成数量',
        value: remaining,
        tone: isGreaterThan(remaining, '0') ? 'warning' : 'success',
      },
      {
        label: '延期工厂任务',
        value: `${delayed.length} 项`,
        tone: delayed.length > 0 ? 'danger' : 'success',
      },
      { label: '已确认采购入库', value: `${confirmedInboundQty} 件` },
      {
        label: '待确认出库草稿',
        value: `${draftOutbounds.length} 张`,
        tone: draftOutbounds.length > 0 ? 'warning' : 'success',
      },
      {
        label: '当前工厂任务',
        value: target?.id ?? '暂无',
        detail: target
          ? `${target.factory} · ${target.completedQty}/${target.requiredQty}`
          : undefined,
      },
    ],
    recommendations: [
      recommendation(
        '核实工厂剩余数量',
        target
          ? `${target.factory} 任务 ${target.id} 还需完成 ${clampToZero(subtract(target.requiredQty, target.completedQty))}。`
          : '当前没有工厂供货任务。',
        isGreaterThan(remaining, '0') ? 'MEDIUM' : 'LOW',
        PAGE_ROUTES['supply-execution'],
        target?.id,
        target ? 'FACTORY_TASK' : undefined,
      ),
      recommendation(
        '由正式单据确认库存变化',
        'AI 不修改库存；请在入库或出库权威页面核对实物数量后确认。',
        draftOutbounds.length > 0 ? 'HIGH' : 'LOW',
        PAGE_ROUTES['shipment-outbound'],
        draftOutbounds[0]?.id,
        draftOutbounds[0] ? 'OUTBOUND_DOCUMENT' : undefined,
      ),
    ],
    summary:
      focusId === 'supply-remaining'
        ? `全部工厂任务仍有 ${remaining} 件未完成；已确认采购入库 ${confirmedInboundQty} 件。`
        : `当前有 ${delayed.length} 项延期工厂任务和 ${draftOutbounds.length} 张待确认出库草稿。`,
    title: '供给执行数量分析',
    tone: supplyTone,
  };
}

function shipmentAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
): AnalysisDraft {
  const shipmentId =
    state.outboundDocuments.find((item) => item.id === selectedId)
      ?.shipmentId ?? selectedId;
  const shipment =
    state.shipments.find((item) => item.id === shipmentId) ??
    state.shipments[0];
  if (!shipment)
    return emptyAnalysis('发货与出库', PAGE_ROUTES['shipment-outbound']);
  const outbounds = state.outboundDocuments.filter(
    (item) => item.shipmentId === shipment.id,
  );
  const followUp = state.followUpTasks.find(
    (item) => item.shipmentId === shipment.id,
  );
  const sources = shipment.lines.flatMap((line) => line.sources);
  const quantity = sum(shipment.lines, (line) => line.quantity);
  const draftOutbounds = outbounds.filter((item) => item.status === 'DRAFT');
  const missingDocuments =
    followUp?.customsDocuments.filter((item) => item.status === 'MISSING') ??
    [];
  let shipmentSummary = `${shipment.id} 当前完成度 ${formatPercent(shipment.progress)}，包含 ${sources.length} 个供给来源。`;
  if (focusId === 'shipment-readiness') {
    shipmentSummary =
      draftOutbounds.length + missingDocuments.length > 0
        ? `${shipment.id} 尚有 ${draftOutbounds.length} 张出库草稿和 ${missingDocuments.length} 项资料缺项，暂不应视为可完成发货。`
        : `${shipment.id} 未发现出库或资料阻塞，可进入人工复核。`;
  }
  let shipmentTone: TradeAiTone = 'success';
  if (missingDocuments.length > 0) shipmentTone = 'danger';
  else if (draftOutbounds.length > 0) shipmentTone = 'warning';

  return {
    evidence: [
      evidenceDocument('当前发货批次', shipment.id, shipment.id, 'SHIPMENT'),
      { label: '本批发货数量', value: quantity },
      { label: '批次完成度', value: formatPercent(shipment.progress) },
      {
        label: '供给来源',
        value: `${sources.length} 个`,
        detail: sources.map((item) => item.sourceLocation).join('、') || '暂无',
      },
      {
        label: '待确认出库草稿',
        value: `${draftOutbounds.length} 张`,
        tone: draftOutbounds.length > 0 ? 'warning' : 'success',
      },
      {
        label: '报关资料缺项',
        value: `${missingDocuments.length} 项`,
        detail: missingDocuments.map((item) => item.label).join('、') || '无',
        tone: missingDocuments.length > 0 ? 'danger' : 'success',
      },
    ],
    recommendations: [
      recommendation(
        '先核对出库实物数量',
        '出库草稿确认后才可扣减库存，AI 不直接确认出库。',
        draftOutbounds.length > 0 ? 'HIGH' : 'LOW',
        PAGE_ROUTES['shipment-outbound'],
        draftOutbounds[0]?.id,
        draftOutbounds[0] ? 'OUTBOUND_DOCUMENT' : undefined,
      ),
      recommendation(
        '补齐报关资料',
        missingDocuments.length > 0
          ? `仍缺：${missingDocuments.map((item) => item.label).join('、')}。`
          : '当前未发现资料缺项，仍需跟单人员确认最终版本。',
        missingDocuments.length > 0 ? 'HIGH' : 'LOW',
        PAGE_ROUTES['follow-up-customs'],
        followUp?.id,
        followUp ? 'FOLLOW_UP_TASK' : undefined,
      ),
    ],
    summary: shipmentSummary,
    title: '发货批次就绪度分析',
    tone: shipmentTone,
  };
}

function receiptAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
): AnalysisDraft {
  const selectedOrderId = resolveOrderId(state, selectedId);
  const formulaOrder = state.orders.find((order) =>
    state.writeOffItems.some((item) => item.orderId === order.id),
  );
  const highestOutstanding = maxByDecimal(
    state.orders,
    (item) => receivableSummary(state, item).outstandingAmount,
  );
  const order =
    state.orders.find((item) => item.id === selectedOrderId) ??
    (focusId === 'receipt-outstanding' ? highestOutstanding : formulaOrder) ??
    state.orders[0];
  if (!order)
    return emptyAnalysis('回款与冲销', PAGE_ROUTES['receipt-writeoff']);
  const summary = receivableSummary(state, order);
  const allocations = state.receiptAllocations.filter(
    (item) => item.orderId === order.id && item.status === 'CONFIRMED',
  );
  const adjustments = state.writeOffItems.filter(
    (item) => item.orderId === order.id && item.status === 'APPROVED',
  );

  return {
    evidence: [
      evidenceDocument('分析订单', order.id, order.id, 'ORDER'),
      {
        label: '合同有效金额',
        value: formatMoney(order.currency, summary.contractAmount),
      },
      {
        label: '实际回款',
        value: formatMoney(order.currency, summary.actualReceiptAmount),
        detail: `${allocations.length} 条已确认回款分配`,
      },
      {
        label: '客户余额消费',
        value: formatMoney(order.currency, summary.consumedBalanceAmount),
      },
      {
        label: '审核减免',
        value: formatMoney(order.currency, summary.waiverAmount),
      },
      {
        label: '回款冲销 / 未回款',
        value: `${formatMoney(order.currency, summary.writeOffAmount)} / ${formatMoney(order.currency, summary.outstandingAmount)}`,
        tone: isGreaterThan(summary.outstandingAmount, '0')
          ? 'warning'
          : 'success',
      },
    ],
    recommendations: [
      recommendation(
        '保持回款与冲销分开记账',
        '实际回款只来自真实资金分配；余额消费与减免只参与冲销。',
        'HIGH',
        PAGE_ROUTES['receipt-writeoff'],
        order.id,
        'ORDER',
      ),
      recommendation(
        '人工核对未回款',
        `当前未回款 ${formatMoney(order.currency, summary.outstandingAmount)}；冲销动作需财务确认并保留原因。`,
        isGreaterThan(summary.outstandingAmount, '0') ? 'MEDIUM' : 'LOW',
        PAGE_ROUTES['contract-order'],
        order.id,
        'ORDER',
      ),
    ],
    summary:
      focusId === 'receipt-formula'
        ? `${formatMoney(order.currency, summary.actualReceiptAmount)} 真实回款 + ${formatMoney(order.currency, add(summary.consumedBalanceAmount, summary.waiverAmount))} 余额消费/减免 = ${formatMoney(order.currency, summary.writeOffAmount)} 回款冲销；未回款为 ${formatMoney(order.currency, summary.outstandingAmount)}。`
        : `订单 ${order.id} 有 ${allocations.length} 条真实回款分配、${adjustments.length} 条余额或减免冲销记录，未回款 ${formatMoney(order.currency, summary.outstandingAmount)}。`,
    title: '回款与冲销口径分析',
    tone: isGreaterThan(summary.outstandingAmount, '0') ? 'warning' : 'success',
  };
}

function payableAnalysis(
  state: Readonly<TradePrototypeState>,
  focusId: string,
  selectedId?: string,
): AnalysisDraft {
  const paymentPoId = state.payments.find((item) => item.id === selectedId)
    ?.allocations[0]?.purchaseOrderId;
  const invoicePoId = state.supplierInvoices.find(
    (item) => item.id === selectedId,
  )?.allocations[0]?.purchaseOrderId;
  const selectedPo = state.purchaseOrders.find(
    (item) =>
      item.id === selectedId ||
      item.id === paymentPoId ||
      item.id === invoicePoId,
  );
  const target = selectedPo ?? state.purchaseOrders[0];
  const unpaid = sum(state.purchaseOrders, (item) =>
    clampToZero(subtract(item.totalAmount, item.paidAmount)),
  );
  const uninvoiced = sum(state.purchaseOrders, (item) =>
    clampToZero(subtract(item.totalAmount, item.invoicedAmount)),
  );
  const unverified = state.supplierInvoices.filter(
    (item) => item.status === 'PENDING_VERIFICATION',
  );
  const pendingExpenses = state.orderExpenses.filter(
    (item) => item.status === 'PENDING_APPROVAL' || item.status === 'APPROVED',
  );
  const pendingExpenseAmount = sum(pendingExpenses, (item) => item.amount);

  return {
    evidence: [
      {
        label: '采购未付款',
        value: formatMoney('CNY', unpaid),
        tone: isGreaterThan(unpaid, '0') ? 'warning' : 'success',
      },
      {
        label: '采购未覆盖发票',
        value: formatMoney('CNY', uninvoiced),
        tone: isGreaterThan(uninvoiced, '0') ? 'warning' : 'success',
      },
      {
        label: '待验真供应商发票',
        value: `${unverified.length} 张`,
        tone: unverified.length > 0 ? 'warning' : 'success',
      },
      {
        label: '待处理订单费用',
        value: `${pendingExpenses.length} 张 / ${formatMoney('CNY', pendingExpenseAmount)}`,
      },
      {
        label: '当前采购单',
        value: target?.id ?? '暂无',
        documentId: target?.id,
        documentType: target ? 'PURCHASE_ORDER' : undefined,
      },
    ],
    recommendations: [
      recommendation(
        '先核对待验真发票',
        '发票验真、认证和作废状态必须由财务人员确认。',
        unverified.length > 0 ? 'HIGH' : 'LOW',
        `${PAGE_ROUTES['payable-expense']}?tab=invoice`,
        unverified[0]?.id,
        unverified[0] ? 'SUPPLIER_INVOICE' : undefined,
      ),
      recommendation(
        '再核对采购付款分配',
        `全部采购单仍有 ${formatMoney('CNY', unpaid)} 未付；AI 不确认付款。`,
        isGreaterThan(unpaid, '0') ? 'MEDIUM' : 'LOW',
        `${PAGE_ROUTES['payable-expense']}?tab=payment`,
        target?.id,
        target ? 'PURCHASE_ORDER' : undefined,
      ),
      recommendation(
        '处理订单费用',
        `待处理费用 ${pendingExpenses.length} 张，需区分员工报销与公司直接付款。`,
        pendingExpenses.length > 0 ? 'MEDIUM' : 'LOW',
        `${PAGE_ROUTES['payable-expense']}?tab=expense`,
        pendingExpenses[0]?.id,
        pendingExpenses[0] ? 'ORDER_EXPENSE' : undefined,
      ),
    ],
    summary:
      focusId === 'payable-priority'
        ? `建议先处理 ${unverified.length} 张待验真发票，再核对 ${formatMoney('CNY', unpaid)} 采购未付款，最后处理 ${pendingExpenses.length} 张订单费用。`
        : `当前采购未付款 ${formatMoney('CNY', unpaid)}、未覆盖发票 ${formatMoney('CNY', uninvoiced)}，另有 ${pendingExpenses.length} 张待处理费用。`,
    title: '应付、发票与费用分析',
    tone:
      unverified.length > 0 || isGreaterThan(unpaid, '0')
        ? 'warning'
        : 'success',
  };
}

function emptyAnalysis(title: string, route: string): AnalysisDraft {
  return {
    evidence: [{ label: '当前数据', value: '暂无记录' }],
    recommendations: [
      recommendation(
        '刷新或重置演示数据',
        '当前页面没有可分析的原型记录。',
        'LOW',
        route,
      ),
    ],
    summary: `当前会话没有可用于分析的${title}记录。`,
    title: `${title}分析`,
    tone: 'info',
  };
}

function inferQuestionId(request: TradeAiRequest): string {
  const profile = getTradeAiPageProfile(request.pageKey);
  if (request.questionId) return request.questionId;
  const normalized = request.query?.trim();
  const exact = profile.questions.find(
    (item) => item.label === normalized || item.prompt === normalized,
  );
  if (exact) return exact.id;
  if (normalized && /(风险|异常|阻塞|延期|缺)/.test(normalized)) {
    return (
      profile.questions.find((item) => item.intent === 'RISK')?.id ??
      profile.questions[0]!.id
    );
  }
  if (normalized && /(今天|优先|下一步|先做)/.test(normalized)) {
    return (
      profile.questions.find((item) => item.intent === 'NEXT_ACTIONS')?.id ??
      profile.questions[0]!.id
    );
  }
  if (normalized && /(为什么|口径|解释|怎么算)/.test(normalized)) {
    return (
      profile.questions.find((item) => item.intent === 'EXPLAIN')?.id ??
      profile.questions[0]!.id
    );
  }
  return profile.questions[0]!.id;
}

function detectGuardrail(
  query: string | undefined,
): TradeAiGuardrail | undefined {
  if (!query?.trim()) return undefined;
  const normalized = query.replaceAll(/\s+/g, '');
  const explanatoryQuestion =
    /^(为什么|为啥|能否|可否|是否|如何|怎么|什么|哪些|解释|请解释)/.test(
      normalized,
    ) || /(是什么|怎么算|口径|流程|条件|前置条件)[?？]?$/.test(normalized);
  if (explanatoryQuestion) return undefined;
  const blockedPatterns: Array<[RegExp, string]> = [
    [/直接.*(修改|调整).*(库存|汇率)/, '直接修改库存或汇率'],
    [/直接.*(确认|提交).*(出库|付款|采购订单|采购单)/, '直接确认正式业务单据'],
    [/(直接|自动).*(核销回款|确认回款|批准减免)/, '直接核销回款或批准减免'],
    [/(直接|自动).*(确认海关放行|海关放行|装船开航)/, '直接确认海关或装运节点'],
    [/(直接|自动).*(选定|决定).*供应商/, '直接决定正式供应商'],
    [/^(请|帮我|立即|现在)?确认付款/, '确认采购付款'],
    [/^(请|帮我|立即|现在)?确认出库/, '确认库存出库'],
    [/^(请|帮我|立即|现在)?(修改|调整)库存/, '修改库存数量'],
    [/^(请|帮我|立即|现在)?确认海关放行/, '确认海关放行'],
    [/^(请|帮我|立即|现在)?自动提交采购申请/, '自动提交采购申请'],
    [/^(请|帮我|立即|现在|替我)?(选定|决定)供应商/, '替代采购决定供应商'],
    [/^(请|帮我|立即|现在)?核销回款/, '核销回款'],
    [/(同意|拒绝|退回|催办).*审批/, '执行审批操作'],
  ];
  const blocked = blockedPatterns.find(([pattern]) => pattern.test(normalized));
  if (blocked) {
    return {
      allowedNextStep:
        '我可以先分析当前证据、列出缺失条件，并引导你进入权威页面由责任人确认。',
      mode: 'BLOCKED',
      prohibitedAction: blocked[1],
      reason:
        '该动作会改变正式业务状态或资金、库存、合规结果，超出原型 AI 的权限边界。',
      title: '该动作不能由 AI 直接执行',
    };
  }
  if (
    /^(请|帮我|立即|现在)?(创建|生成).*(草稿|建议)/.test(normalized) &&
    !/(前还缺什么|前提|条件|能否|可以吗|哪些)/.test(normalized)
  ) {
    return {
      allowedNextStep:
        '先展示拟生成内容、来源单据和硬规则校验；由你确认后再调用现有“生成草稿”动作。',
      mode: 'CONFIRMATION_REQUIRED',
      reason:
        '草稿动作虽可撤销，仍可能批量创建关联记录，需要保留人工确认与审计。',
      title: '需要人工确认后生成草稿',
    };
  }
  return undefined;
}

export function isGuardedAiCommand(query: string): boolean {
  return Boolean(detectGuardrail(query));
}

function pageAnalysis(
  state: Readonly<TradePrototypeState>,
  request: TradeAiRequest,
  focusId: string,
): AnalysisDraft {
  const selectedId = request.selectedDocument?.id;
  switch (request.pageKey) {
    case 'contract-order': {
      return orderAnalysis(state, focusId, selectedId);
    }
    case 'customer': {
      return customerAnalysis(state, focusId, selectedId);
    }
    case 'demand-analysis': {
      return demandAnalysis(state, focusId, selectedId);
    }
    case 'follow-up-customs': {
      return customsAnalysis(state, focusId, selectedId);
    }
    case 'payable-expense': {
      return payableAnalysis(state, focusId, selectedId);
    }
    case 'purchase-order': {
      return purchaseOrderAnalysis(state, focusId, selectedId, request.now);
    }
    case 'receipt-writeoff': {
      return receiptAnalysis(state, focusId, selectedId);
    }
    case 'requisition': {
      return requisitionAnalysis(state, focusId, selectedId);
    }
    case 'shipment-outbound': {
      return shipmentAnalysis(state, focusId, selectedId);
    }
    case 'supplier': {
      return supplierAnalysis(state, focusId, selectedId);
    }
    case 'supply-execution': {
      return supplyExecutionAnalysis(state, focusId, selectedId, request.now);
    }
    case 'workbench': {
      return workbenchAnalysis(state, focusId);
    }
  }
}

export function analyzeTradeAssistant(
  state: Readonly<TradePrototypeState>,
  request: TradeAiRequest,
): TradeAiResponse {
  const profile = getTradeAiPageProfile(request.pageKey);
  const focusId = inferQuestionId(request);
  const matchedQuestion = profile.questions.find((item) => item.id === focusId);
  const question =
    request.query?.trim() ||
    matchedQuestion?.prompt ||
    profile.questions[0]!.prompt;
  const generatedAt = request.now ?? new Date().toISOString();
  const draft = pageAnalysis(state, request, focusId);
  const guardrail = detectGuardrail(request.query);
  let responseTone = draft.tone;
  if (guardrail?.mode === 'BLOCKED') responseTone = 'danger';
  else if (guardrail?.mode === 'CONFIRMATION_REQUIRED') {
    responseTone = 'warning';
  }

  return {
    dataScopeNotice: DATA_SCOPE_NOTICE,
    evidence: draft.evidence,
    generatedAt,
    guardrail,
    id: `${request.pageKey}:${focusId}:${generatedAt}`,
    pageKey: request.pageKey,
    question,
    recommendations: draft.recommendations,
    summary: guardrail ? `${guardrail.reason} ${draft.summary}` : draft.summary,
    title: guardrail?.title ?? draft.title,
    tone: responseTone,
  };
}
