import type { FdmgongchangOrderSplitApi as SplitApi } from '#/api/fdmgongchang/schedule';

import { dimensionToDisplay } from '../../shared/dimensions';

export function orderQuantityText(quantity?: null | number | string, unit?: null | string) {
  if (quantity === null || quantity === undefined) return '—';
  return `${quantity} ${unit?.trim() || '（单位未填）'}`;
}

export function finishedSpecText(row: SplitApi.Row) {
  const dimensions = [row.finishedLength, row.finishedWidth, row.finishedThickness]
    .map((value) => dimensionToDisplay(value, 'mm'));
  const size = dimensions.some((value) => value !== undefined)
    ? `${dimensions.map((value) => value ?? '?').join('×')} mm`
    : '';
  return [row.finishedMaterial, size].filter(Boolean).join(' · ');
}
