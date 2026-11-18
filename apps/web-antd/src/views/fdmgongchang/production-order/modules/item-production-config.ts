import type { FdmgongchangProductionOrderApi as Api, FdmgongchangSupplyMatchApi as MatchApi } from '#/api/fdmgongchang/production-order';

import { dimensionFromDisplay, dimensionToDisplay } from '../../shared/dimensions';

export interface ProductionConfigDraft {
  colorMode: 'DUAL' | 'SINGLE' | 'UNKNOWN';
  constructionType: 'DOUBLE_LAYER' | 'SINGLE_LAYER' | 'UNKNOWN';
  material?: string;
  frontColor?: string;
  backColor?: string;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  frontThicknessMm?: number;
  backThicknessMm?: number;
  textureFront?: string;
  textureBack?: string;
  pattern?: string;
  foldingType?: string;
}

export const productionBatchFields = [
  { value: 'colorMode', label: '单色 / 双色' },
  { value: 'frontColor', label: '正面颜色' },
  { value: 'backColor', label: '反面颜色' },
  { value: 'textureFront', label: '正面纹路' },
  { value: 'textureBack', label: '反面纹路' },
] as const;
export type ProductionBatchField = (typeof productionBatchFields)[number]['value'];

/** 只替换被勾选的字段，每个目标明细的尺寸、制造结构和工艺继续按原行保存。 */
export function productionBatchDraft(
  item: Api.Item,
  source: ProductionConfigDraft,
  fields: ProductionBatchField[],
): ProductionConfigDraft {
  const form = productionConfigDraft(item);
  for (const field of fields) {
    // colorMode 的联合类型比其它文字参数更窄。
    if (field === 'colorMode') form.colorMode = source.colorMode;
    else form[field] = field === 'backColor' && source.colorMode === 'SINGLE' ? source.frontColor : source[field];
  }
  return form;
}

export function productionBatchConfig(
  item: Api.Item,
  source: ProductionConfigDraft,
  fields: ProductionBatchField[],
): Api.ItemProductionConfigReq {
  return {
    itemId: item.id,
    target: productionConfigTarget(item.id, productionBatchDraft(item, source, fields)),
    routeId: item.routeId ?? null,
    processes: [...(item.processes ?? [])],
  };
}

/** 已保存的值优先；已确认明细的空值也是保存结果，不能用建议重新填回。 */
export function productionConfigDraft(item: Api.Item): ProductionConfigDraft {
  const suggested = item.targetSuggested;
  const pick = <T>(saved: null | T | undefined, fallback: null | T | undefined) =>
    item.targetConfirmedAt || (saved !== null && saved !== undefined && saved !== '') ? saved : fallback;
  const text = (value: null | string | undefined) => value?.trim() || undefined;
  return {
    colorMode: pick(item.targetColorMode, suggested?.colorMode) ?? 'UNKNOWN',
    constructionType: pick(item.targetConstructionType, suggested?.constructionType) ?? 'UNKNOWN',
    material: text(pick(item.targetMaterial, suggested?.material)),
    frontColor: text(pick(item.targetFrontColor, suggested?.frontColor)),
    backColor: text(pick(item.targetBackColor, suggested?.backColor)),
    lengthMm: dimensionToDisplay(pick(item.targetLength, suggested?.length), 'mm'),
    widthMm: dimensionToDisplay(pick(item.targetWidth, suggested?.width), 'mm'),
    thicknessMm: dimensionToDisplay(pick(item.targetThickness, suggested?.thickness), 'mm'),
    frontThicknessMm: dimensionToDisplay(pick(item.targetFrontThickness, suggested?.frontThickness), 'mm'),
    backThicknessMm: dimensionToDisplay(pick(item.targetBackThickness, suggested?.backThickness), 'mm'),
    textureFront: text(pick(item.targetTextureFront, suggested?.textureFront)),
    textureBack: text(pick(item.targetTextureBack, suggested?.textureBack)),
    pattern: text(pick(item.targetPattern, suggested?.pattern)),
    foldingType: text(item.targetFoldingType),
  };
}

/** 按完整参数提交，mm 只停留在界面，API 仍以 cm 保存。 */
export function productionConfigTarget(itemId: number, form: ProductionConfigDraft): MatchApi.TargetReq & { itemId: number } {
  return {
    itemId,
    material: form.material?.trim() || null,
    colorMode: form.colorMode,
    constructionType: form.constructionType,
    frontColor: form.frontColor?.trim() || null,
    backColor: (form.colorMode === 'SINGLE' ? form.frontColor : form.backColor)?.trim() || null,
    length: dimensionFromDisplay(form.lengthMm, 'mm'),
    width: dimensionFromDisplay(form.widthMm, 'mm'),
    thickness: dimensionFromDisplay(form.thicknessMm, 'mm'),
    frontThickness: dimensionFromDisplay(form.constructionType === 'SINGLE_LAYER' ? form.thicknessMm : form.frontThicknessMm, 'mm'),
    backThickness: form.constructionType === 'DOUBLE_LAYER' ? dimensionFromDisplay(form.backThicknessMm, 'mm') : null,
    textureFront: form.textureFront?.trim() || null,
    textureBack: form.textureBack?.trim() || null,
    pattern: form.pattern?.trim() || null,
    foldingType: form.foldingType?.trim() || '',
  };
}

export function productionConfigProblems(form: ProductionConfigDraft) {
  const problems: string[] = [];
  if (!form.material?.trim()) problems.push('请选择材质');
  if (form.colorMode === 'UNKNOWN') problems.push('请选择单色或双色');
  if (form.constructionType === 'UNKNOWN') problems.push('请选择单层或双层贴合结构');
  if (!form.frontColor?.trim()) problems.push('请选择正面颜色');
  if (form.colorMode === 'DUAL' && !form.backColor?.trim()) problems.push('请选择反面颜色');
  if (form.colorMode === 'DUAL' && form.frontColor && form.frontColor === form.backColor) problems.push('双色的正反面颜色必须不同；同色请选择单色');
  for (const [label, value] of [['长', form.lengthMm], ['宽', form.widthMm], ['成品厚度', form.thicknessMm]] as const) {
    if (value === undefined || !Number.isFinite(value) || value <= 0) problems.push(`请填写大于 0 的${label}`);
  }
  if (form.constructionType === 'DOUBLE_LAYER') {
    for (const [label, value] of [['正面层厚度', form.frontThicknessMm], ['反面层厚度', form.backThicknessMm]] as const) {
      if (value === undefined || !Number.isFinite(value) || value <= 0) problems.push(`请填写大于 0 的${label}`);
    }
    if (form.frontThicknessMm !== undefined && form.backThicknessMm !== undefined && form.thicknessMm !== undefined &&
        Math.abs(form.frontThicknessMm + form.backThicknessMm - form.thicknessMm) > 0.000001) {
      problems.push('正面层厚度与反面层厚度之和必须等于成品总厚');
    }
  }
  return problems;
}

/** 接单只接受人工保存的参数，不能把未确认的建议值当成已填写。 */
export function savedProductionConfigProblems(item: Api.Item) {
  const problems = productionConfigProblems(productionConfigDraft({ ...item, targetSuggested: null }));
  if (!item.targetConfirmedAt) problems.unshift('请先人工确认并保存生产参数');
  return problems;
}

export function productionRouteProblems(constructionType: ProductionConfigDraft['constructionType'], steps: string[]) {
  if (constructionType === 'DOUBLE_LAYER' && !steps.includes('LAMINATE')) return '双层贴合产品需要贴合工序';
  if (constructionType === 'SINGLE_LAYER' && steps.includes('LAMINATE')) return '单层产品不需要贴合，请取消贴合工序';
  return '';
}

export function unfinishedProductionParameters(form: ProductionConfigDraft, steps: string[]) {
  const missing: string[] = [];
  if (steps.includes('EMBOSS') && !form.textureFront && !form.textureBack) missing.push('请选择至少一面的压花纹路');
  if (steps.includes('ENGRAVE') && !form.pattern) missing.push('雕刻图案未填写');
  if (steps.includes('FOLD') && !form.foldingType?.trim()) missing.push('折叠要求未填写，确认后才能下发折叠任务');
  return missing;
}
