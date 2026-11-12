/** 工厂物料属性及编码仍以 cm 保存；只在需要 mm 的界面边界换算。 */
export type DimensionUnit = 'cm' | 'mm';

function finiteDimension(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function dimensionToDisplay(value: unknown, unit: DimensionUnit = 'cm') {
  const number = finiteDimension(value);
  if (number === undefined) return undefined;
  return unit === 'mm' ? Number((number * 10).toPrecision(12)) : number;
}

export function dimensionFromDisplay(value: unknown, unit: DimensionUnit = 'cm') {
  const number = finiteDimension(value);
  if (number === undefined) return null;
  return unit === 'mm' ? Number((number / 10).toPrecision(12)) : number;
}

/** 旧接口的规格文字只换算明确标注 cm 的尺寸；不猜无单位数字、不改物料编码。 */
export function dimensionTextInMm(text?: null | string) {
  if (!text) return '';
  return text.replace(
    /(?<![\d.])((?:\d+(?:\.\d+)?|\?)\s*[x×*]\s*(?:\d+(?:\.\d+)?|\?)\s*[x×*]\s*(?:\d+(?:\.\d+)?|\?))\s*cm\b/gi,
    (_, dimensions: string) => `${dimensions.split(/\s*[x×*]\s*/i).map((part) => part === '?' ? '?' : dimensionToDisplay(part, 'mm')).join('×')} mm`,
  );
}
