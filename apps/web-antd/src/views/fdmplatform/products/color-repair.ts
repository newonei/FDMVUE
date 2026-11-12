import type { ProductColorRepairRow } from '#/api/fdmplatform/product-color-repair';
import type {
  ProductAttributeOption,
  ProductColorMode,
} from '#/api/fdmplatform/products';

export interface ColorRepairDraft extends ProductColorRepairRow {
  selected: boolean;
  edited: {
    backColor?: string;
    colorCode?: string;
    colorMode: ProductColorMode;
    frontColor?: string;
  };
}
export const repairStatusText: Record<ProductColorRepairRow['status'], string> =
  {
    READY: '可补录，待核对',
    NEEDS_COLOR: '颜色需匹配',
    NEEDS_DIRECTION: '正反方向待确认',
    INCOMPLETE: '资料不完整',
    CONFLICT: '与现有资料冲突',
    ALREADY_SET: '已维护',
    UNRECOGNIZED: '未识别',
  };
export function colorRepairDraft(row: ProductColorRepairRow): ColorRepairDraft {
  return {
    ...row,
    current: { ...row.current },
    suggested: { ...row.suggested },
    selected: false,
    edited: {
      colorMode: row.suggested.colorMode ?? 'UNKNOWN',
      colorCode: row.suggested.colorCode ?? undefined,
      frontColor: row.suggested.frontColor ?? undefined,
      backColor: row.suggested.backColor ?? undefined,
    },
  };
}
export function colorRepairError(
  row: ColorRepairDraft,
  colors: ProductAttributeOption[],
) {
  if (row.status === 'CONFLICT' || row.status === 'ALREADY_SET')
    return '请到产品档案核实，补录不会覆盖已保存资料';
  const value = row.edited;
  if (!['DUAL', 'SINGLE'].includes(value.colorMode ?? ''))
    return '请先确认单色或双色';
  const known = (code: null | string | undefined) =>
    !!code && colors.some((option) => option.value === code);
  if (value.colorMode === 'SINGLE' && !known(value.colorCode))
    return '请选择已有字典中的单色颜色';
  if (
    value.colorMode === 'DUAL' &&
    (!known(value.frontColor) || !known(value.backColor))
  )
    return '请分别选择已有字典中的正反颜色';
  if (value.colorMode === 'DUAL' && value.frontColor === value.backColor)
    return '双色正反颜色必须不同';
  const normalized =
    value.colorMode === 'SINGLE'
      ? { ...value, frontColor: value.colorCode, backColor: value.colorCode }
      : { ...value, colorCode: '' };
  for (const key of ['colorCode', 'frontColor', 'backColor'] as const) {
    if (row.current[key] && row.current[key] !== normalized[key])
      return '与现有颜色冲突，请打开产品档案核实';
  }
  if (
    row.current.colorMode &&
    row.current.colorMode !== 'UNKNOWN' &&
    row.current.colorMode !== value.colorMode
  )
    return '与现有颜色方式冲突，请打开产品档案核实';
  return '';
}
export function colorRepairItem(row: ColorRepairDraft) {
  return {
    productId: row.productId,
    expectedVersion: row.version,
    colorMode: row.edited.colorMode as 'DUAL' | 'SINGLE',
    colorCode:
      row.edited.colorMode === 'SINGLE' ? row.edited.colorCode : undefined,
    frontColor:
      row.edited.colorMode === 'DUAL' ? row.edited.frontColor : undefined,
    backColor:
      row.edited.colorMode === 'DUAL' ? row.edited.backColor : undefined,
    reviewed: true as const,
  };
}
