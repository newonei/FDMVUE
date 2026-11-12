import type { ProductAttributes } from '#/api/fdmplatform/products';

export const colorModeOptions = [
  { value: 'UNKNOWN', label: '待核实' },
  { value: 'SINGLE', label: '单色' },
  { value: 'DUAL', label: '双色' },
];
export const constructionOptions = [
  { value: 'UNKNOWN', label: '待核实' },
  { value: 'SINGLE_LAYER', label: '单层' },
  { value: 'DOUBLE_LAYER', label: '双层贴合' },
];
export function colorModeText(value: ProductAttributes) {
  return (
    colorModeOptions.find((item) => item.value === value.colorMode)?.label ??
    '待核实'
  );
}
export function constructionText(value: ProductAttributes) {
  return (
    constructionOptions.find((item) => item.value === value.constructionType)
      ?.label ?? '待核实'
  );
}
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
export function manufacturingError(value: ProductAttributes) {
  if (value.colorMode === 'SINGLE' && !value.colorCode?.trim())
    return '请选择单色颜色';
  if (value.colorMode === 'DUAL') {
    if (!value.frontColor?.trim() || !value.backColor?.trim())
      return '双色产品请分别选择正面和反面颜色';
    if (value.frontColor === value.backColor)
      return '双色产品的正反颜色必须不同；同色请选择单色，制造结构另行设置';
  }
  if (
    (value.constructionType === 'SINGLE_LAYER' ||
      value.constructionType === 'DOUBLE_LAYER') &&
    !positive(value.finishedThicknessMm)
  ) {
    return '请填写大于 0 的成品厚度';
  }
  if (value.constructionType === 'DOUBLE_LAYER') {
    if (!positive(value.frontThicknessMm) || !positive(value.backThicknessMm))
      return '双层贴合请填写大于 0 的正面层和反面层厚度';
    if (
      Math.abs(
        value.frontThicknessMm +
          value.backThicknessMm -
          value.finishedThicknessMm!,
      ) > 0.000001
    )
      return '正面层厚度与反面层厚度之和必须等于成品厚度';
  }
  return '';
}
export function manufacturingPayload(value: ProductAttributes) {
  const colorMode = value.colorMode ?? 'UNKNOWN';
  const constructionType = value.constructionType ?? 'UNKNOWN';
  return {
    colorMode,
    constructionType,
    colorCode: colorMode === 'DUAL' ? '' : (value.colorCode ?? ''),
    frontColor:
      colorMode === 'SINGLE'
        ? (value.colorCode ?? '')
        : (value.frontColor ?? ''),
    backColor:
      colorMode === 'SINGLE'
        ? (value.colorCode ?? '')
        : (value.backColor ?? ''),
    finishedThicknessMm: value.finishedThicknessMm ?? null,
    frontThicknessMm:
      constructionType === 'SINGLE_LAYER'
        ? (value.finishedThicknessMm ?? null)
        : (value.frontThicknessMm ?? null),
    backThicknessMm:
      constructionType === 'SINGLE_LAYER'
        ? null
        : (value.backThicknessMm ?? null),
  };
}
