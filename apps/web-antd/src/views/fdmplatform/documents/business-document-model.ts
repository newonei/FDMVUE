import type { ActionDefinition, Field, Option } from '../data';
import type { DocumentKind } from './model';

import type { BusinessRecord, Contract, Directory } from '#/api/fdmplatform';
import type { BusinessDocument } from '#/api/fdmplatform/business-documents';

import BigNumber from 'bignumber.js';

import { rows } from '../data';
import { currencyOptions } from '../products/model';
import { needsImportedValue } from './import-completion';

export const nativeTypeLabels: Record<string, string> = {
  PURCHASE_REQUEST: '采购申请',
  PURCHASE_ORDER: '采购单',
  ARRIVAL: '入库单',
  STOCK_IN: '入库单',
  SHIPMENT: '发货单',
  STOCK_OUT: '出库单',
  STOCKTAKE: '库存盘点',
  STOCK_BALANCE: '库存余额',
  RECEIPT: '回款记录',
  REFUND: '退款记录',
  SALES_INVOICE: '开票记录',
  PURCHASE_PAYMENT: '采购付款',
  PURCHASE_INVOICE: '采购发票',
};
const kindTypes: Partial<Record<DocumentKind, string[]>> = {
  requests: ['PURCHASE_REQUEST'],
  tasks: ['PURCHASE_REQUEST'],
  orders: ['PURCHASE_ORDER'],
  arrivals: ['ARRIVAL', 'STOCK_IN'],
  shipments: ['SHIPMENT', 'STOCK_OUT'],
  receipts: ['RECEIPT'],
  refunds: ['REFUND'],
  invoices: ['SALES_INVOICE', 'PURCHASE_INVOICE'],
};
export function requireBusinessDocumentKind(
  view: BusinessDocument,
  kind?: DocumentKind,
) {
  if (kind && !kindTypes[kind]?.includes(view.type))
    throw new Error('目标单据不属于当前菜单，请从对应业务菜单打开');
  return view;
}
export function businessDocumentLines(
  view: BusinessDocument,
): BusinessRecord[] {
  const lines = rows(view.record.lines ?? view.record.items).map((line) => ({
    ...(line.specificationSnapshot &&
    typeof line.specificationSnapshot === 'object'
      ? (line.specificationSnapshot as Record<string, unknown>)
      : {}),
    ...line,
  }));
  if (lines.length > 0) return lines;
  return view.record.skuId || view.record.productName ? [view.record] : [];
}
export function importedOrderRemaining(line: BusinessRecord): string {
  const quantity = new BigNumber(String(line.quantity ?? 0));
  const remaining = quantity
    .minus(String(line.arrivedQuantity ?? 0))
    .plus(String(line.returnedQuantity ?? 0))
    .minus(String(line.cancelledQuantity ?? 0));
  return remaining.isFinite() && remaining.isPositive()
    ? remaining.toFixed(remaining.decimalPlaces() ?? 0)
    : '0';
}
export function businessDocumentActionTitle(action: string) {
  return (
    {
      SAVE_DETAILS: '补齐单据资料',
      MATCH_SOURCE: '关联真实合同',
      RECORD_ARRIVAL: '登记到货',
      CANCEL_ORDER: '取消采购余额',
      CANCEL_REQUEST: '取消采购申请',
      CONFIRM_INVOICE: '核实采购进项票',
      VOID_INVOICE: '作废采购进项票',
      CONFIRM_PAYMENT_SOURCE: '核实实际付款事实',
      CONFIRM_REFUND_SOURCE: '核实原退款事实',
    } as Record<string, string>
  )[action];
}
export function businessDocumentActionDisabled(
  view: BusinessDocument,
  action: string,
) {
  const lines = businessDocumentLines(view);
  if (
    ['CANCEL_ORDER', 'RECORD_ARRIVAL'].includes(action) &&
    !lines.some((line) =>
      new BigNumber(importedOrderRemaining(line)).isPositive(),
    )
  )
    return action === 'CANCEL_ORDER' ? '没有可取消采购余额' : '没有待到货数量';
  if (
    action === 'CANCEL_REQUEST' &&
    lines.some((line) =>
      new BigNumber(String(line.openingAssignedQuantity ?? 0)).isPositive(),
    )
  )
    return '申请已有历史转采购数量，请先核对关联采购单';
  return undefined;
}
export function businessDocumentActionDefinition(
  view: BusinessDocument,
  action: string,
  directory?: Directory,
  contract?: Contract,
): ActionDefinition | undefined {
  const title = businessDocumentActionTitle(action);
  if (!title || !view.allowedActions.includes(action)) return undefined;
  const reason: Field = {
    key: 'reason',
    label: '补充 / 变更说明',
    type: 'textarea',
    required: true,
  };
  const definition: ActionDefinition = {
    action,
    title,
    description:
      '仅补齐缺少的资料或登记本次实际业务，原单号、数量、金额和已执行事实保留。',
    fields: [],
  };
  if (action === 'SAVE_DETAILS') {
    const current: Record<string, unknown> = { ...view.record, ...view };
    const fields: Field[] = [
      {
        key: 'companyId',
        label: '所属公司',
        type: 'select',
        options: directory?.companies.map((row) => ({
          value: row.companyId,
          label: row.companyName,
        })),
      },
      {
        key: 'currency',
        label: '币种',
        type: 'select',
        options: currencyOptions,
      },
      {
        key: 'ownerUserId',
        label: '负责人',
        type: 'select',
        options: directory?.users.map((row) => ({
          value: row.id,
          label: row.nickname,
        })),
      },
      { key: 'name', label: '单据名称' },
      { key: 'customerId', label: '客户', masterType: 'CUSTOMER' },
      { key: 'supplierId', label: '供应商', masterType: 'SUPPLIER' },
    ];
    definition.fields = fields.filter(
      (field) =>
        needsImportedValue(current[field.key]) ||
        (['companyId', 'ownerUserId'].includes(field.key) &&
          current[field.key] === 0),
    );
    definition.fields.push(reason, {
      key: 'verifyCarryover',
      label: '已核对原单量价和期初已履约余额',
      type: 'boolean',
    });
    const missingLines = businessDocumentLines(view).filter((line) =>
      ['skuId', 'unit', 'specification', 'taxBasis'].some(
        (key) =>
          line[key] === null || line[key] === undefined || line[key] === '',
      ),
    );
    if (missingLines.length > 0) {
      definition.lineKey = 'lineMappings';
      definition.optionalLines = true;
      definition.lineFields = [
        {
          key: 'lineId',
          label: '本单产品明细',
          type: 'select',
          required: true,
          options: missingLines.map((line) => ({
            value: line.id,
            label: String(
              line.skuName ?? line.productName ?? line.name ?? line.id,
            ),
          })),
        },
        { key: 'skuId', label: '补缺少的产品关联', masterType: 'SKU' },
        { key: 'unit', label: '补缺少的单位' },
        { key: 'specification', label: '补缺少的规格' },
        {
          key: 'taxBasis',
          label: '补缺少的税费口径',
          type: 'select',
          options: [
            { value: 'TAX_INCLUDED', label: '含税' },
            { value: 'TAX_EXCLUDED', label: '未税' },
          ],
        },
      ];
      definition.initialValues = {
        lineMappings: missingLines.map((line) => ({ lineId: line.id })),
      };
    }
  } else if (action === 'MATCH_SOURCE') {
    if (!contract) return undefined;
    const sourceLines = businessDocumentLines(view);
    definition.fields = [
      { key: 'contractId', label: '关联合同', hidden: true, required: true },
      reason,
    ];
    definition.lineKey = 'itemMappings';
    definition.lineFields = [
      {
        key: 'lineId',
        label: '本单产品明细',
        type: 'select',
        required: true,
        options: sourceLines.map((line) => ({
          value: line.id,
          label: String(
            line.skuName ?? line.productName ?? line.name ?? line.id,
          ),
        })),
      },
      {
        key: 'contractItemId',
        label: '对应合同产品',
        type: 'select',
        required: true,
        options: contract.items.map((item) => ({
          value: item.id,
          label: `${item.skuName} · ${item.specification || '规格未注明'} · ${item.quantity} ${item.unit}`,
        })),
      },
    ];
    definition.initialValues = {
      contractId: contract.id,
      itemMappings: sourceLines.map((line) => ({
        lineId: line.id,
        contractItemId:
          contract.items.length === 1 ? contract.items[0]!.id : undefined,
      })),
    };
    if (sourceLines.length === 0) {
      definition.lineFields = undefined;
      definition.lineKey = undefined;
      definition.initialValues = { contractId: contract.id };
    }
  } else if (action === 'CONFIRM_REFUND_SOURCE') {
    if (!contract) return undefined;
    definition.fields = [
      {
        key: 'originalReceiptId',
        label: '已确认的原回款',
        type: 'select',
        required: true,
        options: (contract.finance?.receipts ?? [])
          .filter(
            (row) =>
              row.status === 'CONFIRMED' &&
              row.kind === 'PAYMENT' &&
              new BigNumber(String(row.amount ?? 0)).isPositive(),
          )
          .map((row) => ({
            value: row.id,
            label: `${row.receivedAt ?? '日期未注明'} · ${row.amount} ${row.currency ?? '币种待核对'}`,
          })),
      },
      {
        key: 'confirmExecuted',
        label: '已核实本单退款真实执行',
        type: 'boolean',
        required: true,
      },
      reason,
      {
        key: 'evidenceRef',
        label: '实际退款核实凭据',
        type: 'reference',
        required: true,
      },
    ];
    definition.description =
      '只核实已发生的原退款并关联真实原回款，不产生一笔新的支付；累计退款与核销由服务端核验。';
  } else if (action === 'CONFIRM_PAYMENT_SOURCE') {
    const current: Record<string, unknown> = { ...view.record, ...view };
    const fields: Field[] = [
      {
        key: 'currency',
        label: '实际付款币种',
        type: 'select',
        options: currencyOptions,
        required: true,
      },
      {
        key: 'amount',
        label: '实际付款金额',
        type: 'decimal',
        min: 0.000001,
        required: true,
      },
      { key: 'paidAt', label: '实际付款日期', type: 'date', required: true },
      {
        key: 'payerEntityId',
        label: '实际付款主体',
        type: 'select',
        required: true,
      },
      { key: 'payerAccount', label: '付款账户', required: true },
      { key: 'payeeName', label: '收款人', required: true },
      { key: 'payeeAccount', label: '收款账户', required: true },
    ];
    definition.fields = [
      ...fields.filter((item) => needsImportedValue(current[item.key])),
      {
        key: 'confirmExecuted',
        label: '已核实此笔款项真实付出',
        type: 'boolean',
        required: true,
      },
      reason,
      {
        key: 'evidenceRef',
        label: '实际付款核实凭据',
        type: 'reference',
        required: true,
      },
    ];
    definition.description =
      '核实原付款的实际执行事实；这不会创建一笔新的银行付款，不补造汇率，确认后继续沿原付款记录办理。';
  } else if (action === 'CANCEL_REQUEST') {
    definition.fields = [reason];
  } else if (action === 'CONFIRM_INVOICE' || action === 'VOID_INVOICE') {
    const current: Record<string, unknown> = { ...view.record, ...view };
    const fields: Field[] = [
      { key: 'invoiceNo', label: '实际发票号码', required: true },
      {
        key: 'amount',
        label: '发票原币金额',
        type: 'decimal',
        min: 0.000001,
        required: true,
      },
      {
        key: 'currency',
        label: '发票币种',
        type: 'select',
        options: currencyOptions,
        required: true,
      },
      { key: 'issuedAt', label: '开票日期', type: 'date', required: true },
    ];
    definition.fields = [
      ...(action === 'CONFIRM_INVOICE'
        ? fields.filter((item) => needsImportedValue(current[item.key]))
        : []),
      reason,
      {
        key: 'evidenceRef',
        label: '发票核实 / 作废凭证',
        type: 'reference',
        required: true,
      },
    ];
  } else {
    const lines = businessDocumentLines(view).filter((line) =>
      new BigNumber(importedOrderRemaining(line)).isPositive(),
    );
    const options: Option[] = lines.map((line) => ({
      value: line.id,
      label: `${line.skuName ?? line.productName ?? line.name ?? '产品'} · 剩余 ${importedOrderRemaining(line)} ${line.unit ?? ''}`,
      fill: {
        quantity: importedOrderRemaining(line),
        acceptedQuantity: importedOrderRemaining(line),
        selectedSkuId: String(line.skuId ?? ''),
        selectedSpecVersion: String(line.specVersion ?? ''),
      },
    }));
    definition.fields = [
      {
        key: 'orderLineId',
        label: '采购产品',
        type: 'select',
        options,
        required: true,
      },
      {
        key: 'quantity',
        label: action === 'RECORD_ARRIVAL' ? '本次到货数量' : '本次取消数量',
        type: 'decimal',
        min: 0.000001,
        required: true,
      },
    ];
    if (action === 'CANCEL_ORDER') definition.fields.push(reason);
    else
      definition.fields.push(
        { key: 'selectedSkuId', label: '对应产品', hidden: true },
        { key: 'selectedSpecVersion', label: '规格版本', hidden: true },
        {
          key: 'acceptedQuantity',
          label: '验收合格数量',
          type: 'decimal',
          min: 0,
          required: true,
        },
        {
          key: 'warehouseId',
          label: '仓库',
          masterType: 'WAREHOUSE',
          required: true,
        },
        {
          key: 'stockPoolId',
          label: '对应库存池',
          stockSource: {
            skuKey: 'selectedSkuId',
            specKey: 'selectedSpecVersion',
            warehouseKey: 'warehouseId',
          },
          hint: '有合格入库数量时必须选择；全部不合格时可以留空。',
        },
        { key: 'batchNo', label: '批次号' },
        { key: 'exceptionReason', label: '异常说明', type: 'textarea' },
        {
          key: 'evidenceRef',
          label: '到货凭证编号',
          type: 'reference',
          required: true,
          hint: '选择实际附件或填写真实线下凭证编号。',
        },
      );
  }
  return definition;
}
