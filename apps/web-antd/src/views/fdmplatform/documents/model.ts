import type { ActionDefinition, Field, Option } from '../data';

import type {
  BusinessRecord,
  Contract,
  MasterRecord,
  PageResource,
} from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import {
  contractActions,
  executionActions,
  field,
  financeActions,
  label,
  rows,
  selectField,
  statusLabels,
} from '../data';
export function actionTitle(action: string): string {
  return (
    (
      {
        CANCEL_REQUEST: '取消采购申请',
        REQUEST_AI_REVIEW: '发起 AI 预审',
      } as Record<string, string>
    )[action] ??
    statusLabels[action] ??
    '办理单据'
  );
}

export type DocumentKind =
  | 'allocations'
  | 'arrivals'
  | 'costs'
  | 'invoices'
  | 'orders'
  | 'plans'
  | 'production'
  | 'purchaseReturns'
  | 'quotes'
  | 'receipts'
  | 'refunds'
  | 'requests'
  | 'salesReturns'
  | 'shipments'
  | 'tasks';
export interface DocumentDefinition {
  title: string;
  description: string;
  resource: Exclude<PageResource, 'contracts'>;
  route: string;
  fields: string[];
  create: string[];
  actions: string[];
}
const procurement = '/fdmprocurement/platform-';
const trade = '/fdmwaimao/platform-';
const finance = '/caiwu/platform-';
export const documentDefinitions: Record<DocumentKind, DocumentDefinition> = {
  requests: {
    title: '采购申请',
    description: '按合同产品提交分批需求，查看申请明细与分派进度。',
    resource: 'purchase-requests',
    route: `${trade}requests`,
    fields: [
      'name|申请名称',
      'status|状态',
      'assignmentStatus|分派进度',
      'remark|说明',
    ],
    create: ['CREATE_REQUEST'],
    actions: ['ASSIGN_FULFILLMENT', 'CANCEL_REQUEST'],
  },
  tasks: {
    title: '采购待办与分派',
    description: '从采购申请分派外采、自产或库存任务，并跟进责任人。',
    resource: 'assignments',
    route: `${procurement}tasks`,
    fields: [
      'method|履约方式',
      'quantity|数量',
      'ownerUserId|经办人',
      'status|状态',
    ],
    create: ['ASSIGN_FULFILLMENT'],
    actions: ['TRANSFER_ASSIGNMENT'],
  },
  quotes: {
    title: '供应商报价',
    description: '登记和修订供应商报价，保留采购证据与价格口径。',
    resource: 'quotes',
    route: `${procurement}quotes`,
    fields: [
      'supplierName|供应商',
      'unitPrice|单价',
      'currency|币种',
      'validUntil|有效截止',
      'promisedDate|承诺交期',
    ],
    create: ['CREATE_QUOTE'],
    actions: ['CREATE_QUOTE'],
  },
  plans: {
    title: '采购方案审批',
    description: '编制方案、发起 AI 预审、提交审批和按数量范围决策。',
    resource: 'purchase-plans',
    route: `${procurement}plans`,
    fields: [
      'name|方案名称',
      'status|状态',
      'version|方案版本',
      'rationale|推荐理由',
    ],
    create: ['SAVE_PLAN'],
    actions: ['SAVE_PLAN', 'REQUEST_AI_REVIEW', 'SUBMIT_PLAN', 'DECIDE_PLAN'],
  },
  orders: {
    title: '采购单',
    description: '按已批准方案生成采购单，查看当前订单明细与未执行余额。',
    resource: 'purchase-orders',
    route: `${procurement}orders`,
    fields: [
      'supplierName|供应商',
      'status|状态',
      'amount|采购金额',
      'currency|币种',
      'approvedPlanVersion|批准版本',
    ],
    create: ['GENERATE_ORDERS'],
    actions: ['CANCEL_ORDER'],
  },
  arrivals: {
    title: '到货单',
    description: '按采购单分批登记合格与异常数量，合格到货同步入库。',
    resource: 'arrivals',
    route: `${procurement}arrivals`,
    fields: [
      'batchNo|到货批次',
      'quantity|到货数量',
      'acceptedQuantity|合格数量',
      'exceptionQuantity|异常数量',
      'occurredAt|登记时间',
    ],
    create: ['RECORD_ARRIVAL'],
    actions: [],
  },
  purchaseReturns: {
    title: '采购退货单',
    description: '引用原到货退回合格或异常部分，保留原到货及退货依据。',
    resource: 'purchase-returns',
    route: `${procurement}returns`,
    fields: [
      'kind|退货类别',
      'quantity|退货数量',
      'reason|退货原因',
      'occurredAt|登记时间',
    ],
    create: ['RETURN_ARRIVAL'],
    actions: [],
  },
  production: {
    title: '自产进度单',
    description: '登记工厂承接与累计完成数量，按真实成品办理入库。',
    resource: 'production-progress',
    route: `${procurement}production`,
    fields: [
      'completedQuantity|累计完成',
      'status|进度',
      'remark|说明',
      'occurredAt|登记时间',
    ],
    create: ['UPDATE_PRODUCTION', 'STOCK_RECEIVE'],
    actions: ['UPDATE_PRODUCTION', 'STOCK_RECEIVE'],
  },
  shipments: {
    title: '发货单',
    description: '按批准方案预留库存，引用预留分批发货，并释放未使用预留。',
    resource: 'outbound-shipments',
    route: `${trade}shipments`,
    fields: [
      'quantity|发货数量',
      'occurredAt|发货时间',
      'evidenceRef|物流凭证',
    ],
    create: ['STOCK_SHIP', 'STOCK_RESERVE', 'STOCK_RELEASE'],
    actions: [],
  },
  salesReturns: {
    title: '销售退货单',
    description: '引用原发货登记客户退货，待检数量单独冻结。',
    resource: 'sales-returns',
    route: `${trade}returns`,
    fields: ['quantity|退货数量', 'occurredAt|退货时间', 'reason|退货原因'],
    create: ['STOCK_RETURN'],
    actions: [],
  },
  receipts: {
    title: '回款记录',
    description: '登记真实到账、确认回款，按到账日期保存人民币折算快照。',
    resource: 'receipt-records',
    route: `${finance}receipts`,
    fields: [
      'receivedAt|到账日期',
      'amount|原币金额',
      'sourceBookAmount|原账面金额',
      'currency|币种',
      'rmbAmount|人民币金额',
      'exchangeRateToCny|汇率',
      'exchangeRateDate|汇率日期',
      'status|确认状态',
    ],
    create: ['CREATE_RECEIPT'],
    actions: ['CONFIRM_RECEIPT', 'REFRESH_RECEIPT_FX'],
  },
  refunds: {
    title: '退款与冲销',
    description: '引用已确认回款登记退款或冲销，沿用原回款的汇率快照。',
    resource: 'receipt-refunds',
    route: `${finance}refunds`,
    fields: [
      'kind|类型',
      'amount|原币金额',
      'currency|币种',
      'rmbAmount|人民币金额',
      'reason|原因',
    ],
    create: ['REVERSE_RECEIPT'],
    actions: ['REFRESH_RECEIPT_FX'],
  },
  invoices: {
    title: '开票记录',
    description: '登记已开具的真实发票和作废结果，核销单独办理。',
    resource: 'invoices',
    route: `${finance}invoices`,
    fields: [
      'invoiceNumber|发票号',
      'type|类型',
      'issuedAt|开票日期',
      'amount|金额',
      'currency|币种',
      'status|状态',
    ],
    create: ['CREATE_INVOICE'],
    actions: ['VOID_INVOICE'],
  },
  allocations: {
    title: '回款核销单',
    description: '按实际金额核销回款与发票，支持部分核销和反向解除。',
    resource: 'allocations',
    route: `${finance}allocations`,
    fields: [
      'amount|核销金额',
      'allocationType|类型',
      'createdAt|登记时间',
      'reason|说明',
    ],
    create: ['BIND_ALLOCATION'],
    actions: ['UNBIND_ALLOCATION'],
  },
  costs: {
    title: '合同成本与贡献',
    description: '登记成本、冲销更正并维护当前合同的利润核算口径。',
    resource: 'costs',
    route: `${finance}costs`,
    fields: [
      'category|成本要素',
      'stage|阶段',
      'amount|原币金额',
      'currency|币种',
      'contractCurrencyAmount|合同币金额',
      'policyVersion|口径版本',
    ],
    create: ['CREATE_COST', 'SET_PROFIT_POLICY'],
    actions: ['REVERSE_COST'],
  },
};
export function queryContractId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function procurementDocumentKind(
  kind: DocumentKind,
  queue: 'intake' | 'tasks',
): DocumentKind {
  return kind === 'tasks' && queue === 'intake' ? 'requests' : kind;
}

export function procurementDocumentDefinition(
  kind: DocumentKind,
  queue: 'intake' | 'tasks',
): DocumentDefinition {
  if (kind !== 'tasks' || queue === 'tasks') return documentDefinitions[kind];
  return {
    ...documentDefinitions.requests,
    title: '待接单申请',
    description:
      '未分派和部分分派的采购申请均在此接单，按剩余数量分派外采、自产或库存任务。',
    resource: 'purchase-intake',
    route: documentDefinitions.tasks.route,
    create: [],
  };
}

export function pendingRequestItems(
  contract: Contract,
  request?: BusinessRecord,
) {
  return (contract.requests ?? [])
    .filter(
      (entry) =>
        entry.status === 'ACTIVE' && (!request || entry.id === request.id),
    )
    .flatMap((entry) =>
      rows(entry.items).flatMap((item) => {
        let assigned = new BigNumber(String(item.openingAssignedQuantity ?? 0));
        for (const assignment of contract.assignments ?? []) {
          if (
            assignment.requestId === entry.id &&
            assignment.requestItemId === item.id &&
            assignment.status !== 'CANCELLED'
          ) {
            assigned = assigned.plus(String(assignment.quantity ?? 0));
          }
        }
        const remaining = new BigNumber(String(item.quantity ?? 0)).minus(
          assigned,
        );
        return remaining.isFinite() && remaining.isGreaterThan(0)
          ? [
              {
                requestId: entry.id,
                item,
                remainingQuantity: remaining.toFixed(
                  remaining.decimalPlaces() ?? 0,
                ),
              },
            ]
          : [];
      }),
    );
}
export function receiptKind(record: BusinessRecord): string {
  return String(
    record.kind ||
      (record.originalReceiptId || Number(record.amount) < 0
        ? 'REFUND'
        : Number(record.amount) > 0
          ? 'PAYMENT'
          : ''),
  );
}
export function shipmentKind(record: BusinessRecord): string {
  return String(
    record.kind || (record.originalShipmentId ? 'RETURN' : 'OUTBOUND'),
  );
}
export function documentStatuses(kind: DocumentKind): string[] {
  const statuses: Partial<Record<DocumentKind, string[]>> = {
    requests: ['ACTIVE', 'CANCELLED'],
    tasks: ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    plans: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'RETURNED'],
    orders: ['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    production: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'],
    receipts: ['PENDING', 'CONFIRMED'],
    invoices: ['VALID', 'VOID'],
    costs: ['ESTIMATED', 'COMMITTED', 'COLLECTED'],
  };
  return statuses[kind] ?? [];
}
export function allocationKind(record: BusinessRecord) {
  return record.originalAllocationId ? '解除核销' : '回款核销';
}
export function documentRecords(
  contract: Contract,
  kind: DocumentKind,
): BusinessRecord[] {
  const paths: Record<DocumentKind, unknown> = {
    requests: contract.requests,
    tasks: contract.assignments,
    quotes: contract.quotes,
    plans: contract.plans,
    orders: contract.purchaseOrders,
    arrivals: contract.arrivals,
    purchaseReturns: contract.returns,
    production: contract.productionProgress,
    shipments: contract.shipments,
    salesReturns: contract.shipments,
    receipts: contract.finance?.receipts,
    refunds: contract.finance?.receipts,
    invoices: contract.finance?.invoices,
    allocations: contract.finance?.allocations,
    costs: contract.finance?.costs,
  };
  return rows(paths[kind]).filter((record) => {
    if (kind === 'shipments') return shipmentKind(record) === 'OUTBOUND';
    if (kind === 'salesReturns') return shipmentKind(record) === 'RETURN';
    if (kind === 'receipts')
      return receiptKind(record) === 'PAYMENT' && Number(record.amount) > 0;
    if (kind === 'refunds')
      return ['REFUND', 'REVERSAL'].includes(receiptKind(record));
    return true;
  });
}
export function currentDocument(
  contract: Contract,
  kind: DocumentKind,
  id: string,
) {
  const record = documentRecords(contract, kind).find(
    (entry) => entry.id === id,
  );
  if (!record)
    throw new Error('当前单据已变化或不属于此类型，请刷新列表后重新打开');
  return record;
}
export function availableOptions(
  item: Field,
  values: Record<string, unknown>,
  header: Record<string, unknown> = {},
): Option[] {
  return (item.options ?? []).filter(
    (option) =>
      (!item.excludeValueOf ||
        option.value !== { ...header, ...values }[item.excludeValueOf]) &&
      Object.entries(option.when ?? {}).every(
        ([key, value]) =>
          String({ ...header, ...values }[key] ?? '') === String(value ?? ''),
      ),
  );
}
function decimal(value: unknown) {
  return new BigNumber(String(value ?? 0));
}
function decimalText(value: BigNumber) {
  return value.toFixed(value.decimalPlaces() ?? 0);
}
function allocationBalance(
  contract: Contract,
  key: 'invoiceId' | 'receiptId',
  id: unknown,
) {
  let sum = new BigNumber(0);
  for (const entry of contract.finance?.allocations ?? []) {
    const original = entry.originalAllocationId
      ? contract.finance?.allocations?.find(
          (row) => row.id === entry.originalAllocationId,
        )
      : undefined;
    if ((entry[key] ?? original?.[key]) === id)
      sum = sum.plus(decimal(entry.amount));
  }
  return sum;
}
export function receiptAvailable(
  contract: Contract,
  receipt: BusinessRecord,
): string {
  let amount = decimal(receipt.amount);
  for (const entry of contract.finance?.receipts ?? [])
    if (entry.originalReceiptId === receipt.id)
      amount = amount.plus(decimal(entry.amount));
  return decimalText(
    BigNumber.maximum(
      0,
      amount.minus(allocationBalance(contract, 'receiptId', receipt.id)),
    ),
  );
}
export function invoiceAvailable(
  contract: Contract,
  invoice: BusinessRecord,
): string {
  let amount = decimal(invoice.amount);
  for (const entry of contract.finance?.invoices ?? [])
    if (entry.status === 'VALID' && entry.originalInvoiceId === invoice.id)
      amount = amount.plus(decimal(entry.amount));
  return decimalText(
    BigNumber.maximum(
      0,
      amount.minus(allocationBalance(contract, 'invoiceId', invoice.id)),
    ),
  );
}
export function documentActionUnavailableReason(
  contract: Contract,
  action: string,
  record: BusinessRecord,
): string | undefined {
  if (action === 'CANCEL_REQUEST') {
    if (record.status === 'CANCELLED') return '采购申请已取消';
    if (contract.purchaseOrders?.some((order) => order.requestId === record.id))
      return '已下单申请需先处理执行余额，不可直接取消';
    if (
      rows(contract.productionProgress).some((progress) =>
        contract.assignments?.some(
          (assignment) =>
            assignment.id === progress.assignmentId &&
            assignment.requestId === record.id,
        ),
      )
    )
      return '已有生产进度的申请不可直接取消';
    if (
      contract.plans?.some(
        (plan) =>
          plan.requestId === record.id &&
          rows(plan.approvals).some(
            (approval) =>
              approval.approved === true && approval.invalidated !== true,
          ),
      )
    )
      return '已批准申请需先变更方案并释放预留';
  }
  if (
    action === 'CANCEL_ORDER' &&
    !rows(record.lines).some((line) =>
      decimal(remainingOrderLine(line)).isGreaterThan(0),
    )
  )
    return '没有可取消采购余额';
  if (action === 'VOID_INVOICE') {
    if (record.type === 'CREDIT_NOTE')
      return '红字结果不能直接作废，请补充真实更正凭据';
    if (allocationBalance(contract, 'invoiceId', record.id).isGreaterThan(0))
      return '请先解除当前发票的全部核销，再登记作废';
    if (
      contract.finance?.invoices?.some(
        (entry) =>
          entry.originalInvoiceId === record.id && entry.status === 'VALID',
      )
    )
      return '已有有效红字的原发票不能全额作废';
  }
  if (action === 'UNBIND_ALLOCATION') {
    if (record.originalAllocationId)
      return '此记录为解除核销结果，不能重复解除';
    let amount = decimal(record.amount);
    for (const entry of contract.finance?.allocations ?? [])
      if (entry.originalAllocationId === record.id)
        amount = amount.plus(decimal(entry.amount));
    if (!amount.isGreaterThan(0)) return '此核销单已全部解除';
  }
  return undefined;
}
function remainingOrderLine(line: BusinessRecord): string {
  return decimalText(
    BigNumber.maximum(
      0,
      decimal(line.quantity)
        .minus(decimal(line.arrivedQuantity))
        .plus(decimal(line.returnedQuantity))
        .minus(decimal(line.cancelledQuantity)),
    ),
  );
}
export function documentActionDefinition(
  contract: Contract,
  kind: DocumentKind,
  action: string,
  master: MasterRecord[],
  pools: BusinessRecord[],
  record?: BusinessRecord,
): ActionDefinition {
  const definitions = {
    ...contractActions(contract, master),
    ...financeActions(contract),
    ...executionActions(contract, pools, master),
  };
  if (action === 'REQUEST_AI_REVIEW')
    definitions[action] = {
      action,
      title: '发起采购 AI 预审',
      description: '预审绑定当前方案版本，仅提供建议，不能自动批准或下单。',
      fields: [
        selectField('planId', '采购方案', []),
        field('planVersion', '方案版本', 'number'),
      ],
    };
  const definition = definitions[action];
  if (
    !definition ||
    ![
      ...documentDefinitions[kind].create,
      ...documentDefinitions[kind].actions,
    ].includes(action)
  )
    throw new Error('此操作不属于当前单据类型');
  const itemName = (id: unknown) =>
    contract.items.find((item) => item.id === id)?.skuName ?? String(id ?? '');
  const assignments = contract.assignments ?? [];
  const assignmentName = (assignment: BusinessRecord) =>
    `${itemName(assignment.contractItemId)} · ${label(assignment.method)} · ${assignment.quantity}`;
  const planOptions = (contract.plans ?? [])
    .filter(
      (plan) =>
        !['GENERATE_ORDERS', 'STOCK_RESERVE'].includes(action) ||
        ['APPROVED', 'PARTIALLY_APPROVED'].includes(String(plan.status)),
    )
    .map((plan) => ({
      value: plan.id,
      label: `${plan.name} · 第 ${plan.version} 版 · ${label(plan.status)}`,
      fill: { planVersion: plan.version ?? 1 },
    }));
  const optionsByKey: Record<string, Option[]> = {
    contractItemId: contract.items.map((item) => ({
      value: item.id,
      label: `${item.skuName} · ${item.specification} · ${item.quantity} ${item.unit}`,
    })),
    requestId: (contract.requests ?? [])
      .filter((request) => request.status !== 'CANCELLED')
      .map((request) => ({ value: request.id, label: String(request.name) })),
    requestItemId: (contract.requests ?? []).flatMap((request) =>
      rows(request.items).map((item) => ({
        value: item.id,
        label: `${itemName(item.contractItemId)} · 申请 ${item.quantity}`,
        when: { requestId: request.id },
      })),
    ),
    assignmentId: assignments
      .filter((assignment) => assignment.status !== 'CANCELLED')
      .filter((assignment) =>
        action === 'CREATE_QUOTE'
          ? assignment.method === 'BUY'
          : ['STOCK_RECEIVE', 'UPDATE_PRODUCTION'].includes(action)
            ? assignment.method === 'MAKE'
            : true,
      )
      .map((assignment) => ({
        value: assignment.id,
        label: assignmentName(assignment),
        ...(action === 'SAVE_PLAN'
          ? { when: { requestId: assignment.requestId } }
          : {}),
        ...(action === 'STOCK_RECEIVE'
          ? { fill: { contractItemId: String(assignment.contractItemId) } }
          : {}),
      })),
    planId: planOptions,
    planLineId: (contract.plans ?? []).flatMap((plan) =>
      rows(plan.lines).map((line) => ({
        value: line.id,
        label: `${itemName(line.contractItemId)} · ${label(line.method)} · ${line.quantity}`,
        when: { planId: plan.id },
        fill: { contractItemId: String(line.contractItemId) },
      })),
    ),
    quoteId: (contract.quotes ?? []).map((quote) => ({
      value: quote.id,
      label: `${quote.supplierName} · ${quote.currency} ${quote.unitPrice} / ${quote.unit}`,
      when: { assignmentId: quote.assignmentId },
    })),
    previousQuoteId: (contract.quotes ?? []).map((quote) => ({
      value: quote.id,
      label: `${quote.supplierName} · 第 ${quote.version} 版`,
      when: { assignmentId: quote.assignmentId },
    })),
    orderId: (contract.purchaseOrders ?? []).map((order, index) => ({
      value: order.id,
      label: `采购单 ${index + 1} · ${order.supplierName} · ${label(order.status)}`,
    })),
    orderLineId: (contract.purchaseOrders ?? []).flatMap((order) =>
      rows(order.lines)
        .filter(
          (line) =>
            !['CANCEL_ORDER', 'RECORD_ARRIVAL'].includes(action) ||
            decimal(remainingOrderLine(line)).isGreaterThan(0),
        )
        .map((line) => ({
          value: line.id,
          label: `${itemName(line.contractItemId)} · 待到货 ${remainingOrderLine(line)} · 已到 ${line.arrivedQuantity ?? 0}`,
          fill: {
            quantity: remainingOrderLine(line),
            ...(action === 'RECORD_ARRIVAL'
              ? { acceptedQuantity: remainingOrderLine(line) }
              : {}),
          },
          when: { orderId: order.id },
        })),
    ),
    arrivalId: rows(contract.arrivals).map((arrival) => ({
      value: arrival.id,
      label: `${arrival.batchNo} · ${itemName(arrival.contractItemId)} · 到货 ${arrival.quantity}`,
    })),
    poolId: pools.map((pool) => ({
      value: pool.id,
      label: `${pool.warehouseName ?? master.find((item) => item.id === pool.warehouseId)?.name ?? '仓库未注明'} · ${pool.skuName ?? master.find((item) => item.id === pool.skuId)?.name ?? itemName(contract.items.find((item) => item.skuId === pool.skuId)?.id)} · 可用 ${pool.available ?? '待核实'}`,
    })),
    reservationId: pools.flatMap((pool) =>
      rows(pool.reservations)
        .filter(
          (reservation) =>
            reservation.contractId === contract.id &&
            Number(reservation.remainingQuantity) > 0,
        )
        .map((reservation) => ({
          value: reservation.id,
          label: `${itemName(reservation.contractItemId)} · 余量 ${reservation.remainingQuantity}`,
          when: { poolId: pool.id },
          fill: { quantity: String(reservation.remainingQuantity) },
        })),
    ),
    shipmentEventId: (contract.shipments ?? [])
      .filter((shipment) => shipmentKind(shipment) === 'OUTBOUND')
      .map((shipment) => ({
        value: String(shipment.eventId),
        label: `${itemName(shipment.contractItemId)} · 发货 ${shipment.quantity} · ${shipment.occurredAt ?? ''}`,
        when: { poolId: shipment.poolId },
      })),
  };
  optionsByKey.stockPoolId = optionsByKey.poolId!;
  if (action === 'RECORD_ARRIVAL')
    optionsByKey.stockPoolId = (contract.purchaseOrders ?? []).flatMap(
      (order) =>
        rows(order.lines).flatMap((line) =>
          pools
            .filter(
              (pool) =>
                pool.skuId === line.skuId &&
                pool.specVersion === line.specVersion,
            )
            .map((pool) => ({
              ...optionsByKey.poolId!.find(
                (option) => option.value === pool.id,
              )!,
              when: { orderLineId: line.id, warehouseId: pool.warehouseId },
            })),
        ),
    );
  if (['STOCK_RECEIVE', 'STOCK_RESERVE'].includes(action))
    optionsByKey.poolId = contract.items.flatMap((item) =>
      pools
        .filter(
          (pool) =>
            pool.skuId === item.skuId && pool.specVersion === item.specVersion,
        )
        .map((pool) => ({
          ...optionsByKey.poolId!.find((option) => option.value === pool.id)!,
          when: { contractItemId: item.id },
        })),
    );
  optionsByKey.allocationId = (contract.finance?.allocations ?? [])
    .filter((allocation) => !allocation.originalAllocationId)
    .map((allocation) => ({
      value: allocation.id,
      label: `${contract.finance?.invoices?.find((invoice) => invoice.id === allocation.invoiceId)?.invoiceNumber ?? '发票'} · 核销 ${allocation.amount}`,
    }));
  const receiptCandidates = (contract.finance?.receipts ?? []).filter(
    (receipt) =>
      action === 'CONFIRM_RECEIPT'
        ? receiptKind(receipt) === 'PAYMENT' && receipt.status === 'PENDING'
        : ['BIND_ALLOCATION', 'REVERSE_RECEIPT'].includes(action)
          ? receiptKind(receipt) === 'PAYMENT' && receipt.status === 'CONFIRMED'
          : true,
  );
  if (action !== 'REFRESH_RECEIPT_FX')
    optionsByKey.receiptId = receiptCandidates.map((receipt) => ({
      value: receipt.id,
      label: `${receipt.receivedAt} · ${receipt.currency} ${receipt.amount} · ${label(receipt.status)}`,
    }));
  if (['BIND_ALLOCATION', 'REVERSE_RECEIPT'].includes(action)) {
    optionsByKey.receiptId = receiptCandidates
      .filter((receipt) =>
        decimal(receiptAvailable(contract, receipt)).isGreaterThan(0),
      )
      .map((receipt) => ({
        value: receipt.id,
        label: `${receipt.receivedAt ?? '回款'} · 可用 ${receipt.currency ?? contract.currency} ${receiptAvailable(contract, receipt)}`,
        ...(action === 'REVERSE_RECEIPT'
          ? { fill: { amount: receiptAvailable(contract, receipt) } }
          : {}),
      }));
  }
  if (action === 'BIND_ALLOCATION') {
    optionsByKey.invoiceId = receiptCandidates.flatMap((receipt) =>
      (contract.finance?.invoices ?? [])
        .filter(
          (invoice) =>
            invoice.status === 'VALID' &&
            ['COMMERCIAL', 'TAX'].includes(String(invoice.type)) &&
            invoice.currency === receipt.currency &&
            decimal(invoiceAvailable(contract, invoice)).isGreaterThan(0),
        )
        .map((invoice) => ({
          value: invoice.id,
          label: `${invoice.invoiceNumber} · 可核销 ${invoice.currency} ${invoiceAvailable(contract, invoice)}`,
          when: { receiptId: receipt.id },
          fill: {
            amount: decimalText(
              BigNumber.minimum(
                decimal(receiptAvailable(contract, receipt)),
                decimal(invoiceAvailable(contract, invoice)),
              ),
            ),
          },
        })),
    );
  }
  if (action === 'UNBIND_ALLOCATION')
    optionsByKey.allocationId = (contract.finance?.allocations ?? [])
      .filter((entry) => !entry.originalAllocationId)
      .map((entry) => {
        let amount = decimal(entry.amount);
        for (const reversal of contract.finance?.allocations ?? [])
          if (reversal.originalAllocationId === entry.id)
            amount = amount.plus(decimal(reversal.amount));
        return {
          value: entry.id,
          label: `${contract.finance?.invoices?.find((invoice) => invoice.id === entry.invoiceId)?.invoiceNumber ?? '发票'} · 可解除 ${decimalText(amount)}`,
          fill: { amount: decimalText(amount) },
        };
      })
      .filter((option) => decimal(option.fill.amount).isGreaterThan(0));
  if (action === 'CREATE_INVOICE')
    optionsByKey.originalInvoiceId = (contract.finance?.invoices ?? [])
      .filter(
        (invoice) =>
          invoice.status === 'VALID' &&
          ['COMMERCIAL', 'TAX'].includes(String(invoice.type)) &&
          decimal(invoiceAvailable(contract, invoice)).isGreaterThan(0),
      )
      .map((invoice) => ({
        value: invoice.id,
        label: `${invoice.invoiceNumber} · 可红冲 ${invoice.currency} ${invoiceAvailable(contract, invoice)}`,
        fill: {
          currency: String(invoice.currency),
          amount: invoiceAvailable(contract, invoice),
        },
      }));
  if (record) {
    const unavailable = documentActionUnavailableReason(
      contract,
      action,
      record,
    );
    if (unavailable) throw new Error(unavailable);
  }
  const context: Record<string, unknown> = {};
  if (
    action === 'CREATE_RECEIPT' &&
    decimal(contract.financeSummary?.unpaidAmount).isGreaterThan(0)
  )
    definition.fields = definition.fields.map((entry) =>
      entry.key === 'amount'
        ? { ...entry, default: String(contract.financeSummary!.unpaidAmount) }
        : entry,
    );
  if (
    action === 'CREATE_INVOICE' &&
    contract.amount !== undefined &&
    contract.financeSummary?.effectiveInvoices !== undefined
  ) {
    const remaining = decimal(contract.amount).minus(
      decimal(contract.financeSummary.effectiveInvoices),
    );
    if (remaining.isGreaterThan(0))
      definition.fields = definition.fields.map((entry) =>
        entry.key === 'amount'
          ? { ...entry, default: decimalText(remaining) }
          : entry,
      );
  }
  if (action === 'ASSIGN_FULFILLMENT') {
    const pending = pendingRequestItems(
      contract,
      kind === 'requests' ? record : undefined,
    );
    if (pending.length === 0)
      throw new Error('此申请已取消或已全部分派，请刷新采购待办');
    const requestIds = new Set(pending.map((entry) => entry.requestId));
    optionsByKey.requestId = optionsByKey.requestId!.filter((option) =>
      requestIds.has(String(option.value)),
    );
    optionsByKey.requestItemId = pending.map(
      ({ requestId, item, remainingQuantity }) => ({
        value: item.id,
        label: `${itemName(item.contractItemId)} · 待分派 ${remainingQuantity}`,
        when: { requestId },
        fill: { quantity: remainingQuantity },
      }),
    );
    if (record && kind === 'requests' && pending.length === 1) {
      context.requestItemId = pending[0]!.item.id;
      context.quantity = pending[0]!.remainingQuantity;
    }
  }
  if (record) {
    const keys: Partial<Record<DocumentKind, string>> = {
      requests: 'requestId',
      tasks: 'assignmentId',
      quotes: 'previousQuoteId',
      plans: action === 'SAVE_PLAN' ? 'id' : 'planId',
      orders: 'orderId',
      receipts: 'receiptId',
      refunds: 'receiptId',
      invoices: 'invoiceId',
      allocations: 'allocationId',
      costs: 'costId',
    };
    const key = keys[kind];
    if (key) context[key] = record.id;
    if (kind === 'plans') {
      context.planVersion = record.version;
      if (action === 'SAVE_PLAN')
        Object.assign(context, record, {
          riskNotes: Array.isArray(record.risks) ? record.risks.join('\n') : '',
          lines: rows(record.lines).map((line) => ({ ...line })),
        });
    }
    if (kind === 'quotes')
      Object.assign(context, record, { previousQuoteId: record.id });
    if (kind === 'production')
      Object.assign(context, {
        assignmentId: record.assignmentId,
        contractItemId: record.contractItemId,
        ...(action === 'UPDATE_PRODUCTION'
          ? {
              completedQuantity: record.completedQuantity,
              status: record.status,
              remark: record.remark,
            }
          : {}),
      });
  }
  const locked = new Set(
    Object.keys(context).filter(
      (key) => key.endsWith('Id') || key === 'id' || key === 'planVersion',
    ),
  );
  const decorate = (entry: Field): Field => ({
    ...entry,
    ...(entry.key === 'supplierId' ? { masterType: 'SUPPLIER' as const } : {}),
    ...(entry.key === 'warehouseId'
      ? { masterType: 'WAREHOUSE' as const }
      : {}),
    ...(optionsByKey[entry.key] ? { options: optionsByKey[entry.key] } : {}),
    ...(entry.key === 'id' && action === 'SAVE_PLAN'
      ? { options: planOptions, hidden: !record }
      : {}),
    ...(['planVersion', 'sourceKey'].includes(entry.key)
      ? { hidden: true }
      : {}),
    ...(locked.has(entry.key) ? { disabled: true } : {}),
    ...(entry.key === 'evidenceRef' || entry.key === 'evidenceIds'
      ? { hint: '可在上方直接上传凭证，再选择文件。' }
      : {}),
  });
  return {
    ...definition,
    ...(action === 'SAVE_PLAN' && record
      ? {
          description:
            '修订当前方案会使原批准和预审失效，需重新提交审批。若存在未发货预留，请先在发货页面释放后再修订。',
        }
      : {}),
    title:
      kind === 'quotes' && record ? '修订当前供应商报价' : definition.title,
    fields: definition.fields.map(decorate),
    lineFields: definition.lineFields?.map(decorate),
    initialValues: { ...definition.initialValues, ...context },
  };
}
