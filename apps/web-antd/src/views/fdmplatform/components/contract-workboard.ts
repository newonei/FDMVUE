import type { DocumentKind } from '../documents/model';
import type { RelatedDocumentSource } from '../documents/related-creation';

import type { BusinessRecord, Contract, DocumentRow } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import { label, rows } from '../data';
import {
  currentDocument,
  pendingRequestItems,
  receiptKind,
} from '../documents/model';
import { relatedActionDefinition } from '../documents/related-creation';

export interface WorkboardLaunch {
  kind: DocumentKind;
  action?: string;
  source?: RelatedDocumentSource;
  recordId?: string;
}
export interface WorkboardGroup {
  key: string;
  title: string;
  description: string;
  button: string;
  kind: DocumentKind;
  records: { id: string; launch: WorkboardLaunch; title: string }[];
}

/** Suggestions only from visible, matched records. Absence is never proof of completion. */
export function contractWorkboard(contract: Contract): WorkboardGroup[] {
  if (
    ['CANCELLED', 'CLOSED'].includes(contract.status) ||
    contract.blockReasons?.length
  )
    return [];
  const result: WorkboardGroup[] = [];
  const allowed = (action: string) => contract.allowedActions.includes(action);
  const active = ['CONFIRMED', 'EXECUTING'].includes(contract.status);
  const balancesKnown =
    Array.isArray(contract.plans) &&
    contract.plans.every((plan) => Array.isArray(plan.lines)) &&
    Array.isArray(contract.purchaseOrders) &&
    contract.purchaseOrders.every((order) => Array.isArray(order.lines));
  const title = (record: BusinessRecord, kind: DocumentKind) => {
    const assignment =
      kind === 'tasks'
        ? record
        : contract.assignments?.find((item) => item.id === record.assignmentId);
    const product = contract.items.find(
      (item) =>
        item.id === (record.contractItemId ?? assignment?.contractItemId),
    );
    const parts = [
      record.code ||
        record.name ||
        record.supplierName ||
        record.batchNo ||
        record.receivedAt,
      product?.skuName,
    ];
    if (kind === 'tasks')
      parts.push(
        label(record.method),
        record.quantity === null || record.quantity === undefined
          ? undefined
          : `${record.quantity} ${product?.unit ?? ''}`,
        contract.requests?.find((request) => request.id === record.requestId)
          ?.name,
      );
    if (kind === 'quotes')
      parts.push(
        record.unitPrice === null || record.unitPrice === undefined
          ? undefined
          : `${record.currency ?? ''} ${record.unitPrice}/${record.unit ?? ''}`,
        record.version === null || record.version === undefined
          ? undefined
          : `第 ${record.version} 版`,
      );
    if (kind === 'receipts')
      parts.push(
        record.amount === null || record.amount === undefined
          ? undefined
          : `${record.currency ?? ''} ${record.amount}`,
      );
    return [...new Set(parts.filter(Boolean))].join(' · ') || '当前单据';
  };
  const add = (
    key: string,
    name: string,
    description: string,
    button: string,
    kind: DocumentKind,
    records: BusinessRecord[],
    launch: (record: BusinessRecord) => WorkboardLaunch,
  ) => {
    if (records.length > 0)
      result.push({
        key,
        title: name,
        description,
        button,
        kind,
        records: records.map((record) => ({
          id: record.id,
          title: title(record, kind),
          launch: launch(record),
        })),
      });
  };
  const source =
    (kind: DocumentKind, action: string, sourceKind: DocumentKind) =>
    (record: BusinessRecord): WorkboardLaunch => ({
      kind,
      action,
      source: { kind: sourceKind, id: record.id },
    });
  if (active) {
    if (allowed('ASSIGN_FULFILLMENT') && Array.isArray(contract.assignments)) {
      const pending = new Set(
        pendingRequestItems(contract).map((item) => item.requestId),
      );
      add(
        'dispatch',
        '采购申请待分派',
        '分派外采、自产或库存任务，继续使用原申请。',
        '分派任务',
        'requests',
        (contract.requests ?? []).filter((record) => pending.has(record.id)),
        (record) => ({
          kind: 'requests',
          action: 'ASSIGN_FULFILLMENT',
          recordId: record.id,
        }),
      );
    }
    if (allowed('CREATE_QUOTE') && Array.isArray(contract.quotes)) {
      add(
        'quote',
        '外采任务待报价',
        '登记供应商、价格和凭据，自动带入当前任务。',
        '新增报价',
        'tasks',
        (contract.assignments ?? []).filter(
          (record) =>
            record.method === 'BUY' &&
            record.status !== 'CANCELLED' &&
            !contract.quotes!.some((quote) => quote.assignmentId === record.id),
        ),
        source('quotes', 'CREATE_QUOTE', 'tasks'),
      );
    }
    if (allowed('SAVE_PLAN') && balancesKnown) {
      const unplanned = (contract.assignments ?? []).filter(
        (assignment) => assignment.status !== 'CANCELLED',
      );
      const candidates = (contract.quotes ?? []).filter(
        (quote) =>
          unplanned.some(
            (assignment) => assignment.id === quote.assignmentId,
          ) &&
          !(contract.quotes ?? []).some(
            (newer) =>
              newer.assignmentId === quote.assignmentId &&
              ((quote.seriesId && newer.seriesId === quote.seriesId) ||
                (!quote.seriesId &&
                  !newer.seriesId &&
                  quote.supplierId &&
                  newer.supplierId === quote.supplierId)) &&
              Number(newer.version) > Number(quote.version),
          ),
      );
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const validQuote = (quote: BusinessRecord) =>
        quote.confirmed === true &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(quote.validUntil ?? '')) &&
        String(quote.validUntil) >= today;
      if (allowed('CREATE_QUOTE'))
        add(
          'quote-review',
          '报价待核对或更新',
          '报价未确认或已过有效期，先查看原报价并核对资料。',
          '查看报价',
          'quotes',
          candidates.filter((quote) => !validQuote(quote)),
          (record) => ({ kind: 'quotes', recordId: record.id }),
        );
      const latestQuotes = candidates
        .filter((quote) => validQuote(quote))
        .filter((quote) => {
          try {
            relatedActionDefinition(
              contract,
              'plans',
              'SAVE_PLAN',
              { kind: 'quotes', id: quote.id },
              [],
              [],
            );
            return true;
          } catch {
            return false;
          }
        });
      add(
        'quote-plan',
        '报价待编制方案',
        '从报价继续编制方案，数量带入未被占用的余额。',
        '编制方案',
        'quotes',
        latestQuotes,
        source('plans', 'SAVE_PLAN', 'quotes'),
      );
      add(
        'task-plan',
        '自产 / 库存任务待编制方案',
        '先明确方案和生效数量，再开展生产或库存预留。',
        '编制方案',
        'tasks',
        unplanned.filter((assignment) => {
          if (!['MAKE', 'STOCK'].includes(String(assignment.method)))
            return false;
          try {
            relatedActionDefinition(
              contract,
              'plans',
              'SAVE_PLAN',
              { kind: 'tasks', id: assignment.id },
              [],
              [],
            );
            return true;
          } catch {
            return false;
          }
        }),
        source('plans', 'SAVE_PLAN', 'tasks'),
      );
    }
    if (allowed('SAVE_PLAN') || allowed('SUBMIT_PLAN'))
      add(
        'draft-plan',
        '采购方案待完善或生效',
        '查看方案明细，生效后继续办理下单、预留或自产。',
        '查看并办理',
        'plans',
        (contract.plans ?? []).filter((record) =>
          [
            'DRAFT',
            'PARTIALLY_APPROVED',
            'REJECTED',
            'RETURNED',
            'SUBMITTED',
          ].includes(String(record.status)),
        ),
        (record) => ({ kind: 'plans', recordId: record.id }),
      );
    if (allowed('GENERATE_ORDERS') && balancesKnown) {
      const ready = (contract.plans ?? []).filter((record) => {
        try {
          relatedActionDefinition(
            contract,
            'orders',
            'GENERATE_ORDERS',
            { kind: 'plans', id: record.id },
            [],
            [],
          );
          return true;
        } catch {
          return false;
        }
      });
      add(
        'order',
        '生效方案待下单',
        '只生成尚未执行的生效外采数量。',
        '生成采购单',
        'plans',
        ready,
        source('orders', 'GENERATE_ORDERS', 'plans'),
      );
    }
    if (allowed('RECORD_ARRIVAL')) {
      const ready = (contract.purchaseOrders ?? []).filter(
        (order) =>
          !['CANCELLED', 'CLOSED'].includes(String(order.status)) &&
          rows(order.lines).some((line) => {
            const quantity = new BigNumber(String(line.quantity ?? ''));
            return (
              quantity.isFinite() &&
              quantity
                .minus(String(line.arrivedQuantity ?? 0))
                .plus(String(line.returnedQuantity ?? 0))
                .minus(String(line.cancelledQuantity ?? 0))
                .isGreaterThan(0)
            );
          }),
      );
      add(
        'arrival',
        '采购单待到货',
        '实收到货后登记，自动带入当前采购单及剩余数量。',
        '登记到货',
        'orders',
        ready,
        source('arrivals', 'RECORD_ARRIVAL', 'orders'),
      );
    }
    if (
      allowed('UPDATE_PRODUCTION') &&
      Array.isArray(contract.productionProgress)
    ) {
      const ready = (contract.assignments ?? []).filter((record) => {
        if (
          record.method !== 'MAKE' ||
          ['CANCELLED', 'COMPLETED'].includes(String(record.status))
        )
          return false;
        if (
          rows(contract.productionProgress).some(
            (progress) =>
              progress.assignmentId === record.id &&
              (progress.status === 'COMPLETED' ||
                new BigNumber(
                  String(progress.completedQuantity ?? ''),
                ).isGreaterThanOrEqualTo(String(record.quantity ?? ''))),
          )
        )
          return false;
        try {
          relatedActionDefinition(
            contract,
            'production',
            'UPDATE_PRODUCTION',
            { kind: 'tasks', id: record.id },
            [],
            [],
          );
          return true;
        } catch {
          return false;
        }
      });
      add(
        'production',
        '自产任务待更新进度',
        '记录实际累计完成数量；成品入库仍按实际情况办理。',
        '登记进度',
        'tasks',
        ready,
        source('production', 'UPDATE_PRODUCTION', 'tasks'),
      );
    }
  }
  if (allowed('CONFIRM_RECEIPT'))
    add(
      'receipt',
      '回款待确认到账',
      '核实金额、币种和凭据后确认，确认前不计入已回款。',
      '核对回款',
      'receipts',
      (contract.finance?.receipts ?? []).filter(
        (record) =>
          receiptKind(record) === 'PAYMENT' && record.status === 'PENDING',
      ),
      (record) => ({ kind: 'receipts', recordId: record.id }),
    );
  return result;
}

export function workboardDocumentRow(
  contract: Contract,
  kind: DocumentKind,
  id: string,
): DocumentRow {
  return {
    id,
    record: currentDocument(contract, kind, id),
    contractId: contract.id,
    contractCode: contract.code,
    contractName: contract.name,
    contractVersion: contract.version,
    companyId: contract.companyId,
    contractStatus: contract.status,
    allowedActions: contract.allowedActions,
    customerId: contract.customerId,
    customerName: contract.customerName,
  };
}
