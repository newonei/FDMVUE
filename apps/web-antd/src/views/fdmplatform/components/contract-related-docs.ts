import type { DocumentKind } from '../documents/model';

import type { DocumentRow } from '#/api/fdmplatform';
import type {
  ProcurementFinanceRecord,
  ProcurementFinanceType,
} from '#/api/fdmplatform/procurement-finance';
import type { StockIn, StockOut } from '#/api/fdmplatform/warehouse';

import { getBusinessPage } from '#/api/fdmplatform';
import { getProcurementFinancePage } from '#/api/fdmplatform/procurement-finance';
import { getStockIns, getStockOuts } from '#/api/fdmplatform/warehouse';

import { label } from '../data';
import { migrationCell, nativeMoney } from '../documents/migration-display';
import { allocationKind, documentDefinitions } from '../documents/model';
import { receiptFxDisplay } from '../finance/exchange-rates/model';
import {
  inKindLabel,
  inPartner,
  OUT_KIND_LABELS,
} from '../inventory-center/components/doc-model';
import { linesTitle } from '../purchase/warehouse/model';

/**
 * 合同详情的下属单据页签：每类单据一个页签，合同下有这类单据才显示（#112）。
 * 各类单据按合同查第一页，页签里列出单号、关键字段和状态，点单号打开原来的详情。
 */

export const RELATED_PAGE_SIZE = 50;

export type RelatedDocRef =
  | { kind: DocumentKind; row: DocumentRow; source: 'business' }
  | { record: ProcurementFinanceRecord; source: 'finance' }
  | { source: 'stockIn'; stockIn: StockIn }
  | { source: 'stockOut'; stockOut: StockOut };

export interface RelatedDocRow {
  id: string;
  code: string;
  cells: string[];
  status: string;
  voided: boolean;
  ref: RelatedDocRef;
}

export interface RelatedDocGroup {
  /** 页签 key 的后缀，页签 key 为 `doc:${key}` */
  key: string;
  title: string;
  total: number;
  columns: string[];
  rows: RelatedDocRow[];
  /** 有完整列表窗口的单据类型，页签里给“全部 / 办理”入口 */
  kind?: DocumentKind;
}

/** 页签顺序按业务先后：采购 → 仓库 → 发货 → 收款开票 → 付款与费用 */
const BUSINESS_BEFORE_STOCK: DocumentKind[] = [
  'requests',
  'tasks',
  'quotes',
  'plans',
  'orders',
];
const BUSINESS_AFTER_STOCK: DocumentKind[] = [
  'shipments',
  'salesReturns',
  'receipts',
  'refunds',
  'invoices',
  'allocations',
];
const FINANCE_TYPES: { title: string; type: ProcurementFinanceType }[] = [
  { type: 'REQUEST', title: '付款申请' },
  { type: 'PAYMENT', title: '付款记录' },
  { type: 'REIMBURSEMENT', title: '费用报销' },
];

/** 已取消、已作废的单据仍列出，置灰 */
const VOID_STATUSES = new Set(['CANCELLED', 'VOIDED']);

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function businessCell(row: DocumentRow, key: string) {
  if (key === 'allocationType') return allocationKind(row.record);
  return (
    migrationCell(row.record, key) ??
    receiptFxDisplay(row.record, key) ??
    label(row.record[key])
  );
}

export function businessGroup(
  kind: DocumentKind,
  list: DocumentRow[],
  total: number,
): RelatedDocGroup {
  const definition = documentDefinitions[kind];
  const fields = definition.fields
    .map((pair) => pair.split('|') as [string, string])
    .filter(([key]) => key !== 'status');
  return {
    key: kind,
    kind,
    title: kind === 'tasks' ? '采购任务' : definition.title,
    total,
    columns: fields.map(([, title]) => title),
    rows: list.map((row) => {
      const status = text(row.record.status ?? row.status);
      return {
        id: String(row.id),
        code: text(
          row.code ||
            row.record.code ||
            row.record.invoiceNumber ||
            row.record.name ||
            row.record.batchNo ||
            definition.title,
        ),
        cells: fields.map(([key]) => businessCell(row, key)),
        status: status ? label(status) : '',
        voided: VOID_STATUSES.has(status),
        ref: { source: 'business', kind, row },
      };
    }),
  };
}

export function stockInGroup(list: StockIn[], total: number): RelatedDocGroup {
  return {
    key: 'stockIns',
    title: '入库单',
    total,
    columns: ['入库类型', '仓库', '供应商 / 来源', '产品', '入库日期'],
    rows: list.map((row) => ({
      id: row.id,
      code: row.code,
      cells: [
        inKindLabel(row),
        row.warehouseName,
        inPartner(row),
        linesTitle(row.lines),
        row.receivedDate,
      ],
      status: row.status === 'VOIDED' ? '已作废' : '已入库',
      voided: row.status === 'VOIDED',
      ref: { source: 'stockIn', stockIn: row },
    })),
  };
}

export function stockOutGroup(
  list: StockOut[],
  total: number,
): RelatedDocGroup {
  return {
    key: 'stockOuts',
    title: '出库单',
    total,
    columns: ['出库类型', '仓库', '产品', '出库日期'],
    rows: list.map((row) => ({
      id: row.id,
      code: row.code,
      cells: [
        OUT_KIND_LABELS[row.kind] ?? row.kind,
        row.warehouseName,
        linesTitle(row.lines),
        row.shippedDate,
      ],
      status: row.status === 'VOIDED' ? '已作废' : '已出库',
      voided: row.status === 'VOIDED',
      ref: { source: 'stockOut', stockOut: row },
    })),
  };
}

export function financeGroup(
  type: ProcurementFinanceType,
  title: string,
  list: ProcurementFinanceRecord[],
  total: number,
): RelatedDocGroup {
  return {
    key: `finance-${type}`,
    title,
    total,
    columns: ['名称', '金额', '日期'],
    rows: list.map((record) => ({
      id: record.id,
      code: record.code || title,
      cells: [
        text(record.name),
        nativeMoney(record.amount, record.currency),
        text(record.paidAt ?? record.createdAt)
          .replace('T', ' ')
          .slice(0, 10),
      ],
      status: record.status ? label(record.status) : '',
      voided: VOID_STATUSES.has(record.status),
      ref: { source: 'finance', record },
    })),
  };
}

/**
 * 读取合同下全部类型的单据。某类读不到（没有权限、接口未部署）就当作没有这类单据，
 * 不影响其它页签；全部失败才报错。
 */
export async function loadContractRelatedDocs(
  contractId: string,
): Promise<RelatedDocGroup[]> {
  const page = { pageNo: 1, pageSize: RELATED_PAGE_SIZE };
  const business = (kind: DocumentKind) =>
    getBusinessPage<DocumentRow>(documentDefinitions[kind].resource, {
      ...page,
      companyId: 0,
      contractId,
    }).then((result) => businessGroup(kind, result.list, result.total));
  const loaders: Promise<RelatedDocGroup>[] = [
    ...BUSINESS_BEFORE_STOCK.map((kind) => business(kind)),
    getStockIns({ ...page, contractId }).then((result) =>
      stockInGroup(result.list, result.total),
    ),
    getStockOuts({ ...page, contractId }).then((result) =>
      stockOutGroup(result.list, result.total),
    ),
    ...BUSINESS_AFTER_STOCK.map((kind) => business(kind)),
    ...FINANCE_TYPES.map(({ type, title }) =>
      getProcurementFinancePage({ ...page, contractId, type }).then((result) =>
        financeGroup(type, title, result.list, result.total),
      ),
    ),
  ];
  const settled = await Promise.allSettled(loaders);
  const failures = settled.filter((item) => item.status === 'rejected');
  if (failures.length === settled.length)
    throw (failures[0] as PromiseRejectedResult).reason;
  return settled.flatMap((item) =>
    item.status === 'fulfilled' && item.value.total > 0 ? [item.value] : [],
  );
}
