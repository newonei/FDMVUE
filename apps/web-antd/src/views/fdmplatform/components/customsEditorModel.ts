import type {
  CustomsBatch,
  CustomsLine,
  CustomsShipment,
  CustomsSource,
} from '#/api/fdmplatform/customs';

import BigNumber from 'bignumber.js';

export type SelectedCustomsLine = CustomsLine & { selected: boolean };
export type SelectedCustomsShipment = CustomsShipment & { selected: boolean };

/** A new contract must never inherit IDs or quantities from the previous dossier. */
export function customsSourceSelection(
  source: CustomsSource,
  batch?: CustomsBatch,
) {
  const current =
    batch?.contractId === source.contractId
      ? (batch.details ?? batch)
      : undefined;
  return {
    purchaseOrderIds: (current?.purchaseOrderIds ?? []).filter((id) =>
      source.purchaseOrders.some((order) => order.id === id),
    ),
    lines: source.items.map((item) => {
      const previous = current?.lines.find(
        (line) => line.contractItemId === item.contractItemId,
      );
      return {
        ...item,
        quantity: previous?.quantity ?? '1',
        selected: !!previous,
      };
    }),
    shipments: source.shipments.map((item) => {
      const previous = current?.shipments.find(
        (shipment) => shipment.eventId === item.eventId,
      );
      return {
        ...item,
        quantity: previous?.quantity ?? item.availableQuantity ?? '0',
        selected: !!previous,
      };
    }),
  };
}

const decimal = (value: unknown) => new BigNumber(String(value ?? ''));
const positive = (value: unknown) =>
  decimal(value).isFinite() && decimal(value).isGreaterThan(0);

export function canSelectCustomsShipment(
  shipment: CustomsShipment,
  lines: SelectedCustomsLine[],
) {
  return (
    positive(shipment.availableQuantity) &&
    lines.some(
      (line) =>
        line.selected &&
        line.contractItemId === shipment.contractItemId &&
        line.specVersion === shipment.specVersion,
    )
  );
}

export function validateCustomsSelection(
  selection: {
    lines: SelectedCustomsLine[];
    purchaseOrderIds: string[];
    required: boolean;
    shipments: SelectedCustomsShipment[];
  },
  source: CustomsSource,
): string {
  const selectedLines = selection.lines.filter((line) => line.selected);
  if (selection.required && selectedLines.length === 0)
    return '请选择本批合同产品。';
  for (const line of selectedLines) {
    const item = source.items.find(
      (item) =>
        item.contractItemId === line.contractItemId &&
        item.specVersion === line.specVersion,
    );
    if (!item) return '合同产品来源已变化，请重新加载合同资料。';
    if (!positive(line.quantity))
      return `${line.skuName ?? '合同产品'}的本批数量须为有效正数。`;
    if (decimal(line.quantity).isGreaterThan(decimal(item.quantity)))
      return `${line.skuName ?? '合同产品'}的本批数量不能超过合同数量 ${item.quantity}。`;
  }
  for (const id of selection.purchaseOrderIds) {
    const order = source.purchaseOrders.find((order) => order.id === id);
    if (!order) return '关联采购单不属于当前合同，请重新选择。';
    const orderLines = Array.isArray(order.lines)
      ? (order.lines as CustomsLine[])
      : [];
    if (
      !orderLines.some((line) =>
        selectedLines.some(
          (item) =>
            item.contractItemId === line.contractItemId &&
            item.specVersion === line.specVersion,
        ),
      )
    )
      return '关联采购单必须包含本批已选产品及其规格版本。';
  }
  for (const shipment of selection.shipments.filter(
    (entry) => entry.selected,
  )) {
    if (!selection.required) return '不需报关时请先取消实际发货关联。';
    const item = source.shipments.find(
      (item) => item.eventId === shipment.eventId,
    );
    if (!item) return '发货来源已变化，请重新加载合同资料。';
    if (!canSelectCustomsShipment(item, selectedLines))
      return '所选发货已无可关联余量，或未选择对应的合同产品及规格。';
    if (!positive(shipment.quantity)) return '发货分配数量须为有效正数。';
    if (
      decimal(shipment.quantity).isGreaterThan(decimal(item.availableQuantity))
    )
      return `发货分配数量不能超过本次可关联数量 ${item.availableQuantity}。`;
  }
  return '';
}

export function validateCustomsMeasurements(values: {
  grossWeight: string;
  netWeight: string;
  packageCount: string;
  volume: string;
}): string {
  if (
    values.packageCount.trim() &&
    (!decimal(values.packageCount).isFinite() ||
      !decimal(values.packageCount).isInteger() ||
      decimal(values.packageCount).isNegative() ||
      decimal(values.packageCount).isGreaterThan(2_147_483_647))
  )
    return '箱数须为有效非负整数，且不能超过 2147483647。';
  for (const [key, name] of [
    ['grossWeight', '毛重'],
    ['netWeight', '净重'],
    ['volume', '体积'],
  ] as const) {
    if (
      values[key].trim() &&
      (!decimal(values[key]).isFinite() || decimal(values[key]).isNegative())
    )
      return `${name}须为有效非负数。`;
  }
  if (
    values.grossWeight.trim() &&
    values.netWeight.trim() &&
    decimal(values.grossWeight).isLessThan(decimal(values.netWeight))
  )
    return '毛重不能小于净重。';
  return '';
}
