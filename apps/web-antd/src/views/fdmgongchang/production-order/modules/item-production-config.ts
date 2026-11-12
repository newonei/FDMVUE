import type { FdmgongchangProductionOrderApi as Api, FdmgongchangSupplyMatchApi as MatchApi } from '#/api/fdmgongchang/production-order';

import { dimensionFromDisplay, dimensionToDisplay } from '../../shared/dimensions';

export interface ProductionConfigDraft {
  colorMode: 'DUAL' | 'SINGLE' | 'UNKNOWN';
  material?: string;
  frontColor?: string;
  backColor?: string;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  textureFront?: string;
  textureBack?: string;
  pattern?: string;
}

/** 已保存的值优先；已确认明细的空值也是保存结果，不能用建议重新填回。 */
export function productionConfigDraft(item: Api.Item): ProductionConfigDraft {
  const suggested = item.targetSuggested;
  const pick = <T>(saved: null | T | undefined, fallback: null | T | undefined) =>
    item.targetConfirmedAt || (saved !== null && saved !== undefined && saved !== '') ? saved : fallback;
  const text = (value: null | string | undefined) => value?.trim() || undefined;
  return {
    colorMode: pick(item.targetColorMode, suggested?.colorMode) ?? 'UNKNOWN',
    material: text(pick(item.targetMaterial, suggested?.material)),
    frontColor: text(pick(item.targetFrontColor, suggested?.frontColor)),
    backColor: text(pick(item.targetBackColor, suggested?.backColor)),
    lengthMm: dimensionToDisplay(pick(item.targetLength, suggested?.length), 'mm'),
    widthMm: dimensionToDisplay(pick(item.targetWidth, suggested?.width), 'mm'),
    thicknessMm: dimensionToDisplay(pick(item.targetThickness, suggested?.thickness), 'mm'),
    textureFront: text(pick(item.targetTextureFront, suggested?.textureFront)),
    textureBack: text(pick(item.targetTextureBack, suggested?.textureBack)),
    pattern: text(pick(item.targetPattern, suggested?.pattern)),
  };
}

export function productionLayerThickness(form: ProductionConfigDraft) {
  if (form.thicknessMm === undefined || !Number.isFinite(form.thicknessMm)) return undefined;
  return Number((form.thicknessMm / (form.colorMode === 'DUAL' ? 2 : 1)).toPrecision(12));
}

/** 按完整参数提交，mm 只停留在界面，API 仍以 cm 保存。 */
export function productionConfigTarget(itemId: number, form: ProductionConfigDraft): MatchApi.TargetReq & { itemId: number } {
  return {
    itemId,
    material: form.material?.trim() || null,
    colorMode: form.colorMode,
    constructionType: form.colorMode === 'DUAL' ? 'DOUBLE_LAYER' : 'SINGLE_LAYER',
    frontColor: form.frontColor?.trim() || null,
    backColor: (form.colorMode === 'SINGLE' ? form.frontColor : form.backColor)?.trim() || null,
    length: dimensionFromDisplay(form.lengthMm, 'mm'),
    width: dimensionFromDisplay(form.widthMm, 'mm'),
    thickness: dimensionFromDisplay(form.thicknessMm, 'mm'),
    frontThickness: dimensionFromDisplay(productionLayerThickness(form), 'mm'),
    backThickness: form.colorMode === 'DUAL' ? dimensionFromDisplay(productionLayerThickness(form), 'mm') : null,
    textureFront: form.textureFront?.trim() || null,
    textureBack: form.textureBack?.trim() || null,
    pattern: form.pattern?.trim() || null,
  };
}

export function productionConfigProblems(form: ProductionConfigDraft) {
  const problems: string[] = [];
  if (!form.material?.trim()) problems.push('请选择材质');
  if (form.colorMode === 'UNKNOWN') problems.push('请选择单色或双色');
  if (!form.frontColor?.trim()) problems.push('请选择正面颜色');
  if (form.colorMode === 'DUAL' && !form.backColor?.trim()) problems.push('请选择反面颜色');
  if (form.colorMode === 'DUAL' && form.frontColor && form.frontColor === form.backColor) problems.push('双色的正反面颜色必须不同；同色请选择单色');
  for (const [label, value] of [['长', form.lengthMm], ['宽', form.widthMm], ['成品厚度', form.thicknessMm]] as const) {
    if (value === undefined || !Number.isFinite(value) || value <= 0) problems.push(`请填写大于 0 的${label}`);
  }
  return problems;
}

export function unfinishedProductionParameters(form: ProductionConfigDraft, steps: string[]) {
  const missing: string[] = [];
  if (steps.includes('EMBOSS')) {
    if (!form.textureFront) missing.push('正面压花纹路未填写');
    if (!form.textureBack) missing.push('反面压花纹路未填写');
  }
  if (steps.includes('ENGRAVE') && !form.pattern) missing.push('雕刻图案未填写');
  return missing;
}
