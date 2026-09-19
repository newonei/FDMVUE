import type { ActionDefinition, Field, Option } from '../data';
import type { DocumentKind } from './model';

import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import { rows } from '../data';
import {
  invoiceAvailable,
  receiptAvailable,
  receiptKind,
  shipmentKind,
} from './model';

const matches = (actual: unknown, expected: unknown) =>
  actual !== undefined &&
  expected !== undefined &&
  String(actual) === String(expected);
const positive = (value: unknown) =>
  new BigNumber(String(value ?? 0)).isGreaterThan(0);
const amount = (left: string, right: string) => {
  const value = BigNumber.minimum(left, right);
  return value.toFixed(value.decimalPlaces() ?? 0);
};

/** Restrict linked creation to the fresh source while leaving the business action unchanged. */
export function stockFinanceRelatedDefinition(
  definition: ActionDefinition,
  contract: Contract,
  sourceKind: DocumentKind,
  record: BusinessRecord,
  pools: BusinessRecord[],
): ActionDefinition | undefined {
  const action = definition.action;
  if (
    !(
      (sourceKind === 'production' &&
        ['STOCK_RESERVE', 'STOCK_SHIP'].includes(action)) ||
      (sourceKind === 'shipments' && action === 'STOCK_RETURN') ||
      (sourceKind === 'receipts' &&
        ['BIND_ALLOCATION', 'REVERSE_RECEIPT'].includes(action)) ||
      (sourceKind === 'invoices' && action === 'BIND_ALLOCATION')
    )
  )
    return undefined;

  const result: ActionDefinition = {
    ...definition,
    fields: definition.fields.map((field) => ({ ...field })),
    initialValues: { ...definition.initialValues },
  };
  function field(key: string): Field {
    const value = result.fields.find((entry) => entry.key === key);
    if (!value) throw new Error('关联建单表单不完整，请刷新后重试');
    return value;
  }
  function restrict(
    key: string,
    predicate: (option: Option) => boolean,
  ): Option[] {
    const entry = field(key);
    entry.options = (entry.options ?? []).filter((option) => predicate(option));
    return entry.options;
  }
  function lock(key: string, value: unknown, error: string) {
    const options = restrict(key, (option) => matches(option.value, value));
    if (options.length === 0) throw new Error(error);
    field(key).disabled = true;
    result.initialValues![key] = options[0]!.value;
  }
  if (sourceKind === 'production') {
    const assignment = contract.assignments?.find((entry) =>
      matches(entry.id, record.assignmentId),
    );
    const itemId = record.contractItemId ?? assignment?.contractItemId;
    if (!contract.items.some((item) => matches(item.id, itemId)))
      throw new Error('自产进度缺少有效的合同产品，请先补齐来源');
    if (action === 'STOCK_RESERVE') {
      lock('contractItemId', itemId, '当前产品已变化，请刷新自产进度后重试');
      const planIds = new Set(
        (field('planId').options ?? []).map((option) => String(option.value)),
      );
      const lines =
        contract.plans
          ?.filter((plan) => planIds.has(String(plan.id)))
          .flatMap((plan) =>
            rows(plan.lines)
              .filter((line) => matches(line.contractItemId, itemId))
              .map((line) => ({ planId: plan.id, id: line.id })),
          ) ?? [];
      if (lines.length === 0)
        throw new Error('当前产品没有已生效的方案明细，请先办理采购方案生效');
      restrict('planId', (option) =>
        lines.some((line) => matches(line.planId, option.value)),
      );
      restrict('planLineId', (option) =>
        lines.some(
          (line) =>
            matches(line.id, option.value) &&
            matches(line.planId, option.when?.planId),
        ),
      );
      if (
        restrict('poolId', (option) =>
          matches(option.when?.contractItemId, itemId),
        ).length === 0
      )
        throw new Error('当前产品尚无匹配的库存池，请先按实际情况办理入库');
    } else {
      const reservations = pools.flatMap((pool) =>
        rows(pool.reservations)
          .filter(
            (entry) =>
              matches(entry.contractId, contract.id) &&
              matches(entry.contractItemId, itemId) &&
              positive(entry.remainingQuantity),
          )
          .map((entry) => ({ poolId: pool.id, id: entry.id })),
      );
      const options = restrict('reservationId', (option) =>
        reservations.some(
          (entry) =>
            matches(entry.id, option.value) &&
            matches(entry.poolId, option.when?.poolId),
        ),
      );
      if (options.length === 0)
        throw new Error(
          '当前产品没有可发货的库存预留，请先完成实际入库和库存预留',
        );
      restrict('poolId', (option) =>
        reservations.some((entry) => matches(entry.poolId, option.value)),
      );
      field('reservationId').hidden = options.length === 1;
    }
    return result;
  }
  if (sourceKind === 'shipments') {
    if (
      shipmentKind(record) !== 'OUTBOUND' ||
      !record.eventId ||
      !record.poolId
    )
      throw new Error('当前记录缺少有效的原发货流水，无法办理销售退货');
    lock('poolId', record.poolId, '原发货库存池不可用，请刷新后重试');
    lock('shipmentEventId', record.eventId, '原发货流水不可用，请刷新后重试');
    return result;
  }
  if (sourceKind === 'receipts') {
    if (
      receiptKind(record) !== 'PAYMENT' ||
      record.status !== 'CONFIRMED' ||
      !positive(receiptAvailable(contract, record))
    )
      throw new Error('当前回款未确认或已无可用余额，无法办理此操作');
    lock('receiptId', record.id, '当前回款已变化，请刷新后重试');
    if (
      action === 'BIND_ALLOCATION' &&
      restrict('invoiceId', (option) =>
        matches(option.when?.receiptId, record.id),
      ).length === 0
    )
      throw new Error('当前回款没有可核销的同币种有效发票');
    return result;
  }
  if (
    record.status !== 'VALID' ||
    !['COMMERCIAL', 'TAX'].includes(String(record.type)) ||
    !positive(invoiceAvailable(contract, record))
  )
    throw new Error('当前发票无效或已无可核销余额');
  const balance = invoiceAvailable(contract, record);
  const receipts = (contract.finance?.receipts ?? []).filter(
    (receipt) =>
      receiptKind(receipt) === 'PAYMENT' &&
      receipt.status === 'CONFIRMED' &&
      receipt.currency === record.currency &&
      positive(receiptAvailable(contract, receipt)),
  );
  const receiptOptions = restrict('receiptId', (option) =>
    receipts.some((receipt) => matches(receipt.id, option.value)),
  );
  if (receiptOptions.length === 0)
    throw new Error('当前发票没有可核销的同币种已确认回款');
  field('receiptId').options = receiptOptions.map((option) => ({
    ...option,
    fill: {
      ...option.fill,
      invoiceId: String(record.id),
      amount: amount(
        balance,
        receiptAvailable(
          contract,
          receipts.find((receipt) => matches(receipt.id, option.value))!,
        ),
      ),
    },
  }));
  lock('invoiceId', record.id, '当前发票已变化，请刷新后重试');
  const invoice = field('invoiceId').options![0]!;
  field('invoiceId').options = [{ value: invoice.value, label: invoice.label }];
  return result;
}
