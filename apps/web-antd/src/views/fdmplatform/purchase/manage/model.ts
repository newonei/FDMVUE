import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  ProcurementOrderRow,
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
    order:
      first(row.orderCode, record.code, row.code, record.name, row.name) ||
      '查看采购单',
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
  return missing.length > 0
    ? `请选择必要条款：${missing.map((group) => clauseGroupTitle(group)).join('、')}`
    : '';
}
const CLAUSE_GROUP_LABELS: Record<string, string> = {
  PAYMENT: '付款条款',
  DELIVERY: '交货条款',
  QUALITY: '质量要求',
  AFTER_SALES: '售后服务',
  PACKAGING: '包装要求',
  TRANSPORT: '运输约定',
  ACCEPTANCE: '验收标准',
  LIABILITY: '违约责任',
  DISPUTE: '争议解决',
  CONFIDENTIALITY: '保密条款',
  OTHER: '其他约定',
};
export function clauseGroupTitle(group: string | undefined) {
  return group ? (CLAUSE_GROUP_LABELS[group] ?? group) : '条款组';
}
/** The only active option, so a buyer with one signing company or template never has to pick it. */
export function onlyChoice<T extends { active?: boolean; id: string }>(
  options: T[],
) {
  const active = options.filter((entry) => entry.active);
  return active.length === 1 ? active[0]?.id : undefined;
}
export interface DetailsCheck {
  key: 'clauses' | 'contact' | 'entity' | 'phone' | 'template';
  label: string;
  ok: boolean;
  hint?: string;
}
/** What the backend requires before 下单资料 can be confirmed, in the order the form shows it. */
export function detailsChecklist(input: {
  clauseIds: string[];
  clauses: ProcurementSetting[];
  contact?: { phone?: null | string };
  entity?: ProcurementSetting;
  template?: ProcurementSetting;
}): DetailsCheck[] {
  const required = input.template?.requiredClauseGroups ?? [];
  const picked = new Set(
    input.clauses
      .filter((entry) => input.clauseIds.includes(entry.id))
      .map((entry) => entry.groupCode),
  );
  const missingGroups = required.filter((group) => !picked.has(group));
  const entityGaps = [
    input.entity?.legalName ? '' : '法定名称',
    input.entity?.address ? '' : '地址',
  ].filter(Boolean);
  return [
    { key: 'contact', label: '工厂联系人', ok: !!input.contact },
    {
      key: 'phone',
      label: '联系人电话',
      ok: !!input.contact?.phone,
      hint: input.contact ? '在「新增 / 维护」里给联系人补电话' : undefined,
    },
    {
      key: 'entity',
      label: '签约公司',
      ok: !!input.entity && entityGaps.length === 0,
      hint:
        input.entity && entityGaps.length > 0
          ? `签约公司缺${entityGaps.join('、')}，请在采购设置里补齐`
          : undefined,
    },
    { key: 'template', label: '采购单模板', ok: !!input.template },
    {
      key: 'clauses',
      label: '必选条款',
      ok: !!input.template && missingGroups.length === 0,
      hint:
        missingGroups.length > 0
          ? `还差${missingGroups.map((group) => clauseGroupTitle(group)).join('、')}`
          : undefined,
    },
  ];
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
    // 作废入库单和采购退货都记为退回，净到货 = 到货 - 退回，退回的数量可以再收补发的货（与后端一致）。
    const net = arrived && returned ? arrived.minus(returned) : undefined;
    if (
      !quantity ||
      !net ||
      !cancelled ||
      net.lt(0) ||
      net.plus(cancelled).gt(quantity)
    )
      group.known = false;
    else {
      group.ordered = group.ordered.plus(quantity.minus(cancelled));
      group.arrived = group.arrived.plus(net);
      group.remaining = group.remaining.plus(
        quantity.minus(cancelled).minus(net),
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
  return orderArrivalProgress(order).some(
    (group) => group.known && knownNumber(group.arrived)?.gt(0),
  );
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
      'accessoryNote',
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

export type DueTone = 'done' | 'late' | 'none' | 'soon';
/** Countdown to the delivery date; finished or cancelled orders stop counting. */
export function orderRowDue(
  row: { dueDate?: string; record: BusinessRecord },
  today: string,
): { main: string; sub: string; tone: DueTone } {
  const status = String(row.record.status ?? '');
  if (['CLOSED', 'RECEIVED'].includes(status))
    return { main: row.dueDate?.slice(5) ?? '—', sub: '已到齐', tone: 'done' };
  if (status === 'CANCELLED') return { main: '—', sub: '已取消', tone: 'none' };
  if (!row.dueDate) return { main: '未约定', sub: '', tone: 'none' };
  const days = Math.round(
    (Date.parse(`${row.dueDate}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  if (days < 0)
    return {
      main: row.dueDate.slice(5),
      sub: `超期 ${-days} 天`,
      tone: 'late',
    };
  if (days === 0)
    return { main: row.dueDate.slice(5), sub: '今天到期', tone: 'soon' };
  return {
    main: row.dueDate.slice(5),
    sub: `还剩 ${days} 天`,
    tone: days <= 3 ? 'soon' : 'none',
  };
}

/**
 * 采购单列表「操作/状态」小图标（金智同款）：入库、付款、收票、盖章、附件各一个，
 * done=已办完、part=部分、none=未办、skip=无需。
 */
function tone(done: boolean, partial: boolean) {
  if (done) return 'done';
  return partial ? 'part' : 'none';
}
function invoiceFlag(
  row: ProcurementOrderRow,
  amount: number,
  invoiced: number,
) {
  if (row.noInvoice) return { tone: 'skip', title: '无需收票' };
  const done = amount > 0 && invoiced >= amount - 0.005;
  return {
    tone: tone(done, invoiced > 0),
    title: invoiced > 0 ? `已收票 ${invoiced.toFixed(2)}` : '未收票',
  };
}
function paymentTitle(paidOff: boolean, paid: number) {
  if (paidOff) return '已付清';
  return paid > 0 ? '部分付款' : '未付款';
}
/**
 * 列表「⋯」菜单复制采购单的来源；金智迁入的历史独立单没有新系统的采购明细，不能复制。
 */
export function orderCopySource(row: ProcurementOrderRow) {
  if (row.standaloneId)
    return row.nativeStandalone === true
      ? { contractId: 'standalone', orderId: row.standaloneId }
      : undefined;
  return row.contractId
    ? { contractId: row.contractId, orderId: row.id }
    : undefined;
}
export function orderRowFlags(
  row: ProcurementOrderRow,
  receivedNames: Record<string, string>,
) {
  const unpaid = Number(row.unpaidAmount ?? Number.NaN);
  const paid = Number(row.paidAmount ?? 0);
  const amount = Number(row.orderAmount ?? Number.NaN);
  const invoiced = Number(row.invoicedAmount ?? 0);
  const received = row.receivedState ?? 'NONE';
  const paidOff = unpaid === 0 && paid > 0;
  return [
    {
      key: 'in',
      text: '入',
      tone: tone(received === 'ALL', received === 'PARTIAL'),
      title: receivedNames[received] ?? received,
    },
    {
      key: 'pay',
      text: '付',
      tone: tone(paidOff, paid > 0),
      title: paymentTitle(paidOff, paid),
    },
    { key: 'invoice', text: '票', ...invoiceFlag(row, amount, invoiced) },
    {
      key: 'signed',
      text: '章',
      tone: row.signed ? 'done' : 'none',
      title: row.signed ? '已上传盖章件' : '未上传盖章件',
    },
    {
      key: 'attachment',
      text: '附',
      tone: row.attached ? 'done' : 'none',
      title: row.attached ? '已上传附件' : '未上传附件',
    },
  ];
}
