import type { Field } from '../data';

import { availableOptions } from './model';
export type FormValue =
  | (number | string)[]
  | boolean
  | number
  | string
  | undefined;
export type FormValues = Record<string, FormValue>;
export type AutoValues = Record<string, FormValue>;
const sourceKeys = new Set([
  'allocationId',
  'arrivalId',
  'assignmentId',
  'contractItemId',
  'costId',
  'invoiceId',
  'orderId',
  'orderLineId',
  'planId',
  'planLineId',
  'poolId',
  'quoteId',
  'receiptId',
  'requestId',
  'requestItemId',
  'reservationId',
  'shipmentEventId',
  'stockPoolId',
  'supplierId',
  'warehouseId',
]);
const empty = (value: unknown) =>
  value === undefined || value === null || value === '';
export function initialFormValues(
  fields: Field[],
  initial: Record<string, unknown> = {},
): { auto: AutoValues; values: FormValues } {
  const values: FormValues = {};
  const auto: AutoValues = {};
  for (const item of fields) {
    if (initial[item.key] === undefined) {
      values[item.key] =
        item.default ?? (item.type === 'boolean' ? false : undefined);
      auto[item.key] = values[item.key];
    } else values[item.key] = initial[item.key] as FormValue;
  }
  return { values, auto };
}
export function fieldVisible(field: Field, values: FormValues) {
  return (
    !field.visibleWhen ||
    values[field.visibleWhen.key] === field.visibleWhen.value
  );
}
export function settleSources(
  fields: Field[],
  values: FormValues,
  header: FormValues,
  auto: AutoValues,
) {
  for (let pass = 0; pass <= fields.length; pass++) {
    let changed = false;
    for (const field of fields) {
      if (!fieldVisible(field, { ...header, ...values })) {
        values[field.key] = undefined;
        auto[field.key] = undefined;
        continue;
      }
      if (
        field.type === 'multiselect' &&
        field.excludeValueOf &&
        Array.isArray(values[field.key])
      )
        values[field.key] = (values[field.key] as (number | string)[]).filter(
          (value) => value !== { ...header, ...values }[field.excludeValueOf!],
        );
      if (field.type !== 'select') continue;
      const options = availableOptions(field, values, header);
      if (
        !empty(values[field.key]) &&
        field.options?.some((option) => option.when) &&
        !options.some((option) => option.value === values[field.key])
      ) {
        values[field.key] = undefined;
        auto[field.key] = undefined;
        changed = true;
        for (const option of field.options ?? [])
          for (const key of Object.keys(option.fill ?? {})) {
            if (auto[key] !== undefined && values[key] === auto[key]) {
              values[key] = undefined;
              auto[key] = undefined;
            }
          }
      }
      if (
        empty(values[field.key]) &&
        (sourceKeys.has(field.key) ||
          (field.key === 'originalInvoiceId' && !!field.visibleWhen)) &&
        options.length === 1
      ) {
        values[field.key] = options[0]!.value;
        auto[field.key] = values[field.key];
        changed = true;
      }
      const selected = options.find(
        (option) => option.value === values[field.key],
      );
      for (const [key, value] of Object.entries(selected?.fill ?? {})) {
        if (
          (empty(values[key]) ||
            (auto[key] !== undefined && values[key] === auto[key])) &&
          values[key] !== value
        ) {
          values[key] = value;
          auto[key] = value;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}
