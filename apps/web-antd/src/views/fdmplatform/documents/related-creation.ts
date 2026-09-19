import type { ActionDefinition, Field } from '../data';
import type { DocumentKind } from './model';

import type { BusinessRecord, Contract, MasterRecord } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import { rows } from '../data';
import { currentDocument, documentActionDefinition } from './model';
import { stockFinanceRelatedDefinition } from './related-stock-finance';

export interface RelatedDocumentSource {
  kind: DocumentKind;
  id: string;
}
export interface RelatedCreation {
  kind: DocumentKind;
  action: string;
  title: string;
}

export function relatedCreations(
  kind: DocumentKind,
  record: BusinessRecord,
): RelatedCreation[] {
  switch (kind) {
    case 'arrivals': {
      return [
        {
          kind: 'purchaseReturns',
          action: 'RETURN_ARRIVAL',
          title: '新建采购退货',
        },
      ];
    }
    case 'invoices': {
      return [
        {
          kind: 'allocations',
          action: 'BIND_ALLOCATION',
          title: '新增发票核销',
        },
      ];
    }
    case 'orders': {
      return [
        { kind: 'arrivals', action: 'RECORD_ARRIVAL', title: '登记到货' },
        {
          kind: 'purchaseReturns',
          action: 'RETURN_ARRIVAL',
          title: '新建采购退货',
        },
      ];
    }
    case 'plans': {
      return [
        { kind: 'orders', action: 'GENERATE_ORDERS', title: '生成采购单' },
      ];
    }
    case 'production': {
      return [
        { kind: 'shipments', action: 'STOCK_RESERVE', title: '预留库存' },
        { kind: 'shipments', action: 'STOCK_SHIP', title: '登记发货' },
      ];
    }
    case 'quotes': {
      return [{ kind: 'plans', action: 'SAVE_PLAN', title: '编制采购方案' }];
    }
    case 'receipts': {
      return [
        {
          kind: 'allocations',
          action: 'BIND_ALLOCATION',
          title: '新增发票核销',
        },
        { kind: 'refunds', action: 'REVERSE_RECEIPT', title: '登记退款或冲销' },
      ];
    }
    case 'requests': {
      return [
        { kind: 'tasks', action: 'ASSIGN_FULFILLMENT', title: '分派履约任务' },
      ];
    }
    case 'shipments': {
      return [
        { kind: 'salesReturns', action: 'STOCK_RETURN', title: '新建销售退货' },
      ];
    }
    case 'tasks': {
      if (record.method === 'BUY') {
        return [
          { kind: 'quotes', action: 'CREATE_QUOTE', title: '新增供应商报价' },
        ];
      }
      if (record.method === 'MAKE') {
        return [
          {
            kind: 'production',
            action: 'UPDATE_PRODUCTION',
            title: '登记自产进度',
          },
          { kind: 'plans', action: 'SAVE_PLAN', title: '编制采购方案' },
        ];
      }
      if (record.method === 'STOCK') {
        return [{ kind: 'plans', action: 'SAVE_PLAN', title: '编制采购方案' }];
      }
      return [];
    }
    default: {
      return [];
    }
  }
}

const decimal = (value: unknown) => new BigNumber(String(value ?? 0));
const sum = (values: BusinessRecord[], key: string) => {
  let total = new BigNumber(0);
  for (const row of values) {
    total = total.plus(decimal(row[key]));
  }
  return total;
};

function lockContext(
  definition: ActionDefinition,
  context: Record<string, unknown>,
): ActionDefinition {
  return {
    ...definition,
    initialValues: { ...definition.initialValues, ...context },
    fields: definition.fields.map((field) =>
      Object.hasOwn(context, field.key) &&
      (field.key.endsWith('Id') || field.key === 'planVersion')
        ? {
            ...field,
            disabled: true,
            options: field.options?.filter(
              (option) => option.value === context[field.key],
            ),
          }
        : field,
    ),
  };
}

function planAvailable(contract: Contract, assignment: BusinessRecord) {
  const orders = (contract.purchaseOrders ?? []).flatMap((order) =>
    rows(order.lines),
  );
  const lines = (contract.plans ?? [])
    .filter((plan) => plan.status !== 'RETURNED')
    .flatMap((plan) => rows(plan.lines))
    .filter((line) => line.assignmentId === assignment.id);
  let reserved = new BigNumber(0);
  for (const line of lines) {
    reserved = reserved.plus(
      BigNumber.maximum(
        0,
        decimal(line.quantity).minus(
          sum(
            orders.filter((order) => order.planLineId === line.id),
            'quantity',
          ),
        ),
      ),
    );
  }
  return BigNumber.maximum(
    0,
    decimal(assignment.quantity)
      .minus(reserved)
      .minus(
        sum(
          orders.filter((line) => line.assignmentId === assignment.id),
          'quantity',
        ),
      ),
  );
}

function approved(contract: Contract, assignmentId: string) {
  let total = new BigNumber(0);
  for (const plan of contract.plans ?? []) {
    const lineIds = new Set(
      rows(plan.lines)
        .filter((line) => line.assignmentId === assignmentId)
        .map((line) => line.id),
    );
    total = total.plus(
      sum(
        rows(plan.approvals)
          .filter(
            (approval) =>
              approval.approved === true &&
              !approval.invalidated &&
              approval.planVersion === plan.version,
          )
          .flatMap((approval) => rows(approval.scopes))
          .filter((scope) => lineIds.has(String(scope.planLineId))),
        'quantity',
      ),
    );
  }
  return total;
}

function returnDefinition(
  definition: ActionDefinition,
  arrivals: BusinessRecord[],
): ActionDefinition {
  const available = arrivals.filter(
    (arrival) =>
      decimal(arrival.acceptedQuantity)
        .minus(decimal(arrival.returnedAcceptedQuantity))
        .isGreaterThan(0) ||
      decimal(arrival.exceptionQuantity)
        .minus(decimal(arrival.returnedExceptionQuantity))
        .isGreaterThan(0),
  );
  if (available.length === 0) throw new Error('当前单据没有可退的到货数量');
  const ids = new Set(available.map((arrival) => arrival.id));
  return {
    ...definition,
    fields: definition.fields.map((field): Field => {
      if (field.key === 'arrivalId')
        return {
          ...field,
          options: field.options
            ?.filter((option) => ids.has(String(option.value)))
            .map((option) => {
              const arrival = available.find(
                (arrival) => arrival.id === option.value,
              )!;
              return {
                ...option,
                fill: {
                  kind: decimal(arrival.acceptedQuantity)
                    .minus(decimal(arrival.returnedAcceptedQuantity))
                    .isGreaterThan(0)
                    ? 'ACCEPTED'
                    : 'EXCEPTION',
                },
              };
            }),
        };
      if (field.key !== 'kind') return field;
      return {
        ...field,
        default: undefined,
        options: available.flatMap((arrival) =>
          [
            {
              value: 'ACCEPTED',
              label: '合格数量',
              quantity: decimal(arrival.acceptedQuantity).minus(
                decimal(arrival.returnedAcceptedQuantity),
              ),
            },
            {
              value: 'EXCEPTION',
              label: '异常数量',
              quantity: decimal(arrival.exceptionQuantity).minus(
                decimal(arrival.returnedExceptionQuantity),
              ),
            },
          ]
            .filter((entry) => entry.quantity.isGreaterThan(0))
            .map((entry) => {
              const quantity = entry.quantity.toFixed(
                entry.quantity.decimalPlaces() ?? 0,
              );
              return {
                value: entry.value,
                label: `${entry.label} · 可退 ${quantity}`,
                when: { arrivalId: arrival.id },
                fill: { quantity },
              };
            }),
        ),
      };
    }),
  };
}

/** Read the source from the freshly loaded contract, never interpret it as a target row. */
export function relatedActionDefinition(
  contract: Contract,
  kind: DocumentKind,
  action: string,
  source: RelatedDocumentSource,
  master: MasterRecord[],
  pools: BusinessRecord[],
): ActionDefinition {
  const record = currentDocument(contract, source.kind, source.id);
  const launch = relatedCreations(source.kind, record).find(
    (entry) => entry.kind === kind && entry.action === action,
  );
  if (!launch) throw new Error('当前来源单据不支持此关联操作，请刷新后重试');
  if (record.status === 'CANCELLED')
    throw new Error('来源单据已取消，不能继续建单');
  let definition = documentActionDefinition(
    contract,
    kind,
    action,
    master,
    pools,
  );
  definition.title = launch.title;
  const stockFinance = stockFinanceRelatedDefinition(
    definition,
    contract,
    source.kind,
    record,
    pools,
  );
  if (stockFinance) return stockFinance;
  if (action === 'ASSIGN_FULFILLMENT')
    return documentActionDefinition(
      contract,
      'requests',
      action,
      master,
      pools,
      record,
    );
  if (action === 'CREATE_QUOTE') {
    const item = contract.items.find(
      (item) => item.id === record.contractItemId,
    );
    return lockContext(definition, {
      assignmentId: record.id,
      unit: item?.unit ?? '件',
    });
  }
  if (action === 'UPDATE_PRODUCTION') {
    if (!approved(contract, record.id).isGreaterThan(0))
      throw new Error('请先在当前任务中编制采购方案并生效，再登记自产进度');
    const previous = rows(contract.productionProgress)
      .filter((progress) => progress.assignmentId === record.id)
      .toReversed()
      .toSorted(
        (a, b) =>
          decimal(b.completedQuantity).comparedTo(
            decimal(a.completedQuantity),
          ) ?? 0,
      )[0];
    return lockContext(definition, {
      assignmentId: record.id,
      completedQuantity: previous?.completedQuantity ?? 0,
      status: previous?.status ?? 'ACCEPTED',
    });
  }
  if (action === 'SAVE_PLAN') {
    const assignment =
      source.kind === 'tasks'
        ? record
        : currentDocument(contract, 'tasks', String(record.assignmentId));
    if (assignment.status === 'CANCELLED') throw new Error('来源任务已取消');
    const quantity = planAvailable(contract, assignment);
    if (!quantity.isGreaterThan(0))
      throw new Error(
        '当前任务已全部编入方案或执行，请打开已有采购方案办理变更',
      );
    const request = currentDocument(
      contract,
      'requests',
      String(assignment.requestId),
    );
    if (request.status === 'CANCELLED') throw new Error('来源采购申请已取消');
    if (
      source.kind === 'quotes' &&
      (contract.quotes ?? []).some(
        (quote) =>
          quote.seriesId === record.seriesId &&
          quote.seriesId &&
          Number(quote.version) > Number(record.version),
      )
    )
      throw new Error('当前报价已有新版本，请从最新报价编制方案');
    return lockContext(definition, {
      requestId: assignment.requestId,
      name: `${request.name ?? contract.code}采购方案`,
      lines: [
        {
          assignmentId: assignment.id,
          ...(source.kind === 'quotes' ? { quoteId: record.id } : {}),
          quantity: quantity.toFixed(quantity.decimalPlaces() ?? 0),
        },
      ],
    });
  }
  if (action === 'GENERATE_ORDERS') {
    if (!['APPROVED', 'PARTIALLY_APPROVED'].includes(String(record.status)))
      throw new Error('采购方案尚未生效，请先办理方案生效');
    const approvals = rows(record.approvals)
      .filter(
        (approval) =>
          approval.approved === true &&
          !approval.invalidated &&
          approval.planVersion === record.version,
      )
      .flatMap((approval) => rows(approval.scopes));
    const orders = (contract.purchaseOrders ?? []).flatMap((order) =>
      rows(order.lines),
    );
    if (
      !rows(record.lines).some(
        (line) =>
          line.method === 'BUY' &&
          sum(
            approvals.filter((scope) => scope.planLineId === line.id),
            'quantity',
          )
            .minus(
              sum(
                orders.filter((order) => order.planLineId === line.id),
                'quantity',
              ),
            )
            .isGreaterThan(0),
      )
    )
      throw new Error('当前方案已无可下单的外采生效数量，请核对已有采购单');
    return lockContext(definition, {
      planId: record.id,
      planVersion: record.version,
    });
  }
  if (action === 'RECORD_ARRIVAL') {
    if (record.status === 'CLOSED')
      throw new Error('采购单已关闭，不能继续到货');
    if (
      !definition.fields
        .find((field) => field.key === 'orderLineId')
        ?.options?.some((option) => option.when?.orderId === record.id)
    )
      throw new Error('当前采购单没有待到货数量');
    return lockContext(definition, { orderId: record.id });
  }
  if (action === 'RETURN_ARRIVAL') {
    const order =
      source.kind === 'orders'
        ? record
        : currentDocument(contract, 'orders', String(record.orderId));
    if (['CANCELLED', 'CLOSED'].includes(String(order.status)))
      throw new Error('采购单已结束或取消，需先处理来源业务变更');
    definition = returnDefinition(
      definition,
      source.kind === 'arrivals'
        ? [record]
        : rows(contract.arrivals).filter(
            (arrival) => arrival.orderId === record.id,
          ),
    );
    return source.kind === 'arrivals'
      ? lockContext(definition, { arrivalId: record.id })
      : definition;
  }
  throw new Error('当前来源单据不支持此关联操作');
}
