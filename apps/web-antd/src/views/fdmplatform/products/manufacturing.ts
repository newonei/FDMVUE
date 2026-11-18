import type { ProductAttributes } from '#/api/fdmplatform/products';

export const COLOR_DERIVED_LAYER_RULE = 'COLOR_DERIVED_V1';
export function colorDerivedStage(value: ProductAttributes) {
  return ['', 'FINISHED', 'FOLDED', 'PACKED'].includes(
    value.productStage?.trim() ?? '',
  );
}
/** 尚无显式制造结构的成品草稿可以补齐新规则；中间物料和历史层厚继续保留。 */
export function usesColorDerivedLayers(value: ProductAttributes) {
  return (
    colorDerivedStage(value) &&
    (value.layerRule === COLOR_DERIVED_LAYER_RULE ||
      ((!value.constructionType || value.constructionType === 'UNKNOWN') &&
        (value.frontThicknessMm === null ||
          value.frontThicknessMm === undefined) &&
        (value.backThicknessMm === null ||
          value.backThicknessMm === undefined)))
  );
}
export function colorDerivedLayers(
  value: ProductAttributes,
): ProductAttributes {
  const thickness =
    typeof value.finishedThicknessMm === 'number' &&
    Number.isFinite(value.finishedThicknessMm) &&
    value.finishedThicknessMm > 0
      ? value.finishedThicknessMm
      : null;
  if (value.colorMode === 'SINGLE')
    return {
      constructionType: 'SINGLE_LAYER',
      frontThicknessMm: thickness,
      backThicknessMm: null,
    };
  if (value.colorMode === 'DUAL')
    return {
      constructionType: 'DOUBLE_LAYER',
      frontThicknessMm: thickness === null ? null : thickness / 2,
      backThicknessMm: thickness === null ? null : thickness / 2,
    };
  return {
    constructionType: 'UNKNOWN',
    frontThicknessMm: null,
    backThicknessMm: null,
  };
}
export function productNominalLayersText(value: ProductAttributes) {
  if (value.constructionType === 'SINGLE_LAYER')
    return `单层 ${value.frontThicknessMm ?? value.finishedThicknessMm ?? '待核实'} mm`;
  if (value.constructionType === 'DOUBLE_LAYER')
    return `正面 ${value.frontThicknessMm ?? '待核实'} mm + 反面 ${value.backThicknessMm ?? '待核实'} mm`;
  return '制造结构待核实';
}
/** 开片厚度单独用于前段工序，不进入成品名义层字段。历史结构不套用新规则。 */
export function productSliceThicknessText(value: ProductAttributes) {
  if (value.layerRule !== COLOR_DERIVED_LAYER_RULE || !colorDerivedStage(value))
    return '';
  const layers = colorDerivedLayers(value);
  const slice = (thickness: null | number | undefined) =>
    typeof thickness === 'number' && thickness > 0
      ? Number((thickness + 0.2).toFixed(6))
      : undefined;
  const front = slice(layers.frontThicknessMm);
  if (front === undefined) return '';
  return layers.constructionType === 'DOUBLE_LAYER'
    ? `正面 ${front} mm + 反面 ${slice(layers.backThicknessMm)} mm`
    : `单层 ${front} mm`;
}
export function productThicknessProcessText(value: ProductAttributes) {
  if (!productSliceThicknessText(value)) return '';
  return value.colorMode === 'DUAL'
    ? '双色在贴合工序缩水至成品厚度'
    : '单色在压花工序缩水至成品厚度';
}

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
export const patternModeOptions = [
  { value: 'UNKNOWN', label: '待核实' },
  { value: 'NONE', label: '无雕刻' },
  { value: 'LASER', label: '激光雕刻' },
];
export function patternModeText(value: ProductAttributes) {
  return (
    patternModeOptions.find((item) => item.value === value.patternMode)
      ?.label ?? '待核实'
  );
}
export function productDimensionsText(value: ProductAttributes) {
  const dimensions = [value.lengthMm, value.widthMm, value.finishedThicknessMm];
  return dimensions.some(
    (dimension) => dimension !== null && dimension !== undefined,
  )
    ? `${dimensions.map((dimension) => dimension ?? '未维护').join(' × ')} mm`
    : '';
}
export function productPatternText(value: ProductAttributes) {
  if (value.patternMode === 'NONE') return '无雕刻';
  if (value.patternMode !== 'LASER') return '雕刻待核实';
  return `激光雕刻 · ${value.patternCode || '图案待补齐'} · ${value.patternVersion || '生产版本待补齐'}`;
}
/** 只用于展示待补项；正式可复用/可选用结论以服务端返回为准。 */
export function configurationMissingFields(value: ProductAttributes) {
  const missing: string[] = [];
  for (const [field, label] of [
    ['lengthMm', '长度'],
    ['widthMm', '宽度'],
    ['finishedThicknessMm', '厚度'],
  ] as const)
    if (!positive(value[field])) missing.push(label);
  if (!['DUAL', 'SINGLE'].includes(value.colorMode ?? ''))
    missing.push('单双色');
  if (
    !value.frontColor?.trim() &&
    !(value.colorMode === 'SINGLE' && value.colorCode?.trim())
  )
    missing.push('正面颜色');
  if (
    !value.backColor?.trim() &&
    !(
      value.colorMode === 'SINGLE' &&
      (value.colorCode?.trim() || value.frontColor?.trim())
    )
  )
    missing.push('反面颜色');
  if (!value.textureFront?.trim()) missing.push('正面纹路');
  if (!value.textureBack?.trim()) missing.push('反面纹路');
  if (!['LASER', 'NONE'].includes(value.patternMode ?? ''))
    missing.push('雕刻方式');
  if (value.patternMode === 'LASER') {
    if (!value.patternCode?.trim()) missing.push('激光图案');
    if (!value.patternVersion?.trim()) missing.push('图案生产版本');
  }
  return missing;
}
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
export function manufacturingError(
  input: ProductAttributes,
  options: { deriveLayers?: boolean } = {},
) {
  const derive = options.deriveLayers ?? usesColorDerivedLayers(input);
  const value = derive ? { ...input, ...colorDerivedLayers(input) } : input;
  for (const [field, title] of [
    ['lengthMm', '成品长度'],
    ['widthMm', '成品宽度'],
    ['finishedThicknessMm', '成品厚度'],
  ] as const) {
    if (
      value[field] !== null &&
      value[field] !== undefined &&
      !positive(value[field])
    )
      return `请填写大于 0 的${title}`;
  }
  if (value.colorMode === 'SINGLE' && !value.colorCode?.trim())
    return '请选择单色颜色';
  if (value.colorMode === 'DUAL') {
    if (!value.frontColor?.trim() || !value.backColor?.trim())
      return '双色产品请分别选择正面和反面颜色';
    if (value.frontColor === value.backColor)
      return '双色产品的正反颜色必须不同；同色请选择单色';
  }
  if (
    (value.constructionType === 'SINGLE_LAYER' ||
      value.constructionType === 'DOUBLE_LAYER') &&
    (!derive ||
      (value.finishedThicknessMm !== null &&
        value.finishedThicknessMm !== undefined)) &&
    !positive(value.finishedThicknessMm)
  ) {
    return '请填写大于 0 的成品厚度';
  }
  if (
    value.constructionType === 'DOUBLE_LAYER' &&
    (!derive || positive(value.finishedThicknessMm))
  ) {
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
  if (value.patternMode === 'LASER') {
    if (!value.patternCode?.trim()) return '请选择激光图案';
    if (!value.patternVersion?.trim()) return '请填写激光图案生产版本';
  }
  return '';
}
export function manufacturingPayload(
  value: ProductAttributes,
  options: { deriveLayers?: boolean } = {},
) {
  const colorMode = value.colorMode ?? 'UNKNOWN';
  const constructionType = value.constructionType ?? 'UNKNOWN';
  const derive = options.deriveLayers ?? usesColorDerivedLayers(value);
  return {
    lengthMm: value.lengthMm ?? null,
    widthMm: value.widthMm ?? null,
    colorMode,
    ...(derive ? {} : { constructionType }),
    patternMode: value.patternMode ?? 'UNKNOWN',
    patternCode:
      value.patternMode === 'NONE' ? '' : (value.patternCode?.trim() ?? ''),
    patternVersion:
      value.patternMode === 'NONE' ? '' : (value.patternVersion?.trim() ?? ''),
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
    ...(derive
      ? {}
      : {
          frontThicknessMm:
            constructionType === 'SINGLE_LAYER'
              ? (value.finishedThicknessMm ?? null)
              : (value.frontThicknessMm ?? null),
          backThicknessMm:
            constructionType === 'SINGLE_LAYER'
              ? null
              : (value.backThicknessMm ?? null),
        }),
  };
}
