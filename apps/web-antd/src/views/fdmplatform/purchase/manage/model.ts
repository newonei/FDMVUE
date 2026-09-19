import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  ProcurementSetting,
  SupplierContact,
} from '#/api/fdmplatform/procurement';

import BigNumber from 'bignumber.js';

import { contractReferenceText } from '../../documents/migration-display';
import { currencyScale } from '../../finance/procurement/model';
export function purchaseRowLabels(row: BusinessRecord) {
  const record = (row.record ?? row.order ?? row) as Record<string, unknown>;
  const first = (...values: unknown[]) =>
    values.find((value) => typeof value === 'string' && value.trim()) as
      | string
      | undefined;
  return {
    order: first(record.code, row.code, record.name, row.name) || '查看采购单',
    supplier: first(record.supplierName, row.supplierName) || '供应商未注明',
    supplierId: first(record.supplierId, row.supplierId),
    contract: contractReferenceText(
      first(row.contractCode, record.contractCode),
      first(row.contractName, record.contractName),
      first(row.contractId, record.contractId),
    ),
  };
}
export function activeContacts(contacts: SupplierContact[]) {
  return contacts.filter((entry) => entry.active);
}
export function preferredContact(
  contacts: SupplierContact[],
  currentId?: string,
) {
  return (
    contacts.find((entry) => entry.id === currentId) ??
    activeContacts(contacts).find((entry) => entry.defaultContact)
  );
}
export function compatibleClauses(
  clauses: ProcurementSetting[],
  selectedIds: string[],
  requiredGroups: string[],
) {
  const selected = clauses.filter((entry) => selectedIds.includes(entry.id));
  const groups = selected.map((entry) => entry.groupCode);
  if (new Set(groups).size !== groups.length) return '同一条款组只能选择一项';
  const missing = requiredGroups.filter((group) => !groups.includes(group));
  return missing.length > 0 ? `请选择必要条款：${missing.join('、')}` : '';
}
export function snapshotShape(line: BusinessRecord): string {
  const snapshot = line.specificationSnapshot as
    | Record<string, unknown>
    | undefined;
  const value = String(snapshot?.shape ?? line.shape ?? '').trim();
  return value || '未维护';
}
export function exactAmount(value: unknown) {
  const result = new BigNumber(String(value ?? 0));
  return result.isFinite() ? result.toFixed(result.decimalPlaces() ?? 0) : '—';
}
export function sumAmounts(values: unknown[]) {
  let sum = new BigNumber(0);
  for (const value of values) sum = sum.plus(String(value ?? 0));
  return sum.toFixed(sum.decimalPlaces() ?? 0);
}

function knownNumber(value: unknown): BigNumber | undefined {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    String(value).trim() === ''
  )
    return undefined;
  const number = new BigNumber(String(value));
  return number.isFinite() && !number.isNegative() ? number : undefined;
}

/** Missing accounting facts must stay unknown, including historical imported orders. */
export function orderMoney(value: unknown, currency: unknown) {
  const number = knownNumber(value);
  if (!number) return '待核实';
  const code =
    typeof currency === 'string' && currency.trim() ? currency : undefined;
  return `${code ?? '币种未注明'} ${number.toFormat(code ? currencyScale(code) : Math.max(2, number.decimalPlaces() ?? 0))}`;
}

export function orderArrivalProgress(order: BusinessRecord) {
  const lines = Array.isArray(order.lines)
    ? (order.lines as BusinessRecord[])
    : [];
  const groups = new Map<
    string,
    {
      arrived: BigNumber;
      known: boolean;
      ordered: BigNumber;
      remaining: BigNumber;
      returned: BigNumber;
      returnsKnown: boolean;
      unit: string;
    }
  >();
  for (const [index, line] of lines.entries()) {
    const snapshot = line.specificationSnapshot as
      | Record<string, unknown>
      | undefined;
    const unit = String(snapshot?.unit ?? line.unit ?? '').trim();
    // Unspecified units cannot be assumed equal across different products.
    const groupKey = unit || `unknown-${index}`;
    const group = groups.get(groupKey) ?? {
      unit: unit || '单位待补齐',
      ordered: new BigNumber(0),
      arrived: new BigNumber(0),
      remaining: new BigNumber(0),
      returned: new BigNumber(0),
      known: true,
      returnsKnown: true,
    };
    const quantity = knownNumber(line.quantity);
    const arrived = knownNumber(line.arrivedQuantity);
    const cancelled = knownNumber(line.cancelledQuantity);
    const returned = knownNumber(line.returnedQuantity);
    if (
      !quantity ||
      !arrived ||
      !cancelled ||
      arrived.plus(cancelled).gt(quantity)
    )
      group.known = false;
    else {
      group.ordered = group.ordered.plus(quantity.minus(cancelled));
      group.arrived = group.arrived.plus(arrived);
      group.remaining = group.remaining.plus(
        quantity.minus(cancelled).minus(arrived),
      );
    }
    if (returned) group.returned = group.returned.plus(returned);
    else group.returnsKnown = false;
    groups.set(groupKey, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    unit: group.unit,
    known: group.known,
    ordered: group.known
      ? group.ordered.toFixed(group.ordered.decimalPlaces() ?? 0)
      : undefined,
    arrived: group.known
      ? group.arrived.toFixed(group.arrived.decimalPlaces() ?? 0)
      : undefined,
    remaining: group.known
      ? group.remaining.toFixed(group.remaining.decimalPlaces() ?? 0)
      : undefined,
    returned: group.returnsKnown
      ? group.returned.toFixed(group.returned.decimalPlaces() ?? 0)
      : undefined,
    percent:
      group.known && group.ordered.gt(0)
        ? group.arrived.div(group.ordered).times(100).toNumber()
        : undefined,
  }));
}

export function canRecordOrderArrival(order: BusinessRecord) {
  if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(String(order.status)))
    return false;
  return orderArrivalProgress(order).some(
    (group) => group.known && knownNumber(group.remaining)?.gt(0),
  );
}

export function canReturnOrderArrival(order: BusinessRecord) {
  return orderArrivalProgress(order).some((group) => {
    const arrived = knownNumber(group.arrived);
    const returned = knownNumber(group.returned);
    return arrived && returned && arrived.gt(returned);
  });
}

export function orderPaymentProgress(summary: Record<string, unknown>) {
  const total = knownNumber(summary.orderAmount);
  const paid = knownNumber(summary.paidAmount);
  return total?.gt(0) && paid
    ? BigNumber.minimum(paid.div(total).times(100), 100).toNumber()
    : undefined;
}

export function orderDetailsPayload(value: Record<string, unknown>) {
  return Object.fromEntries(
    [
      'contactId',
      'signingEntityId',
      'templateId',
      'clauseIds',
      'deliveryAddress',
      'deliveryDate',
      'remark',
      'reason',
    ]
      .filter((key) => value[key] !== undefined)
      .map((key) => [
        key,
        key === 'deliveryDate' && !value[key] ? null : value[key],
      ]),
  );
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
