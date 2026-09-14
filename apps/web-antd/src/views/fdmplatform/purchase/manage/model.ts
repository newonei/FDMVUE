import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  ProcurementSetting,
  SupplierContact,
} from '#/api/fdmplatform/procurement';

import BigNumber from 'bignumber.js';

import { contractReferenceText } from '../../documents/migration-display';
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
