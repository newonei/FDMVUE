import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { dimensionTextInMm, dimensionToDisplay } from '../shared/dimensions';
import { makeLabels, sizeText } from '../stage-stock/model';

/** 订单产品快照，不能拿当前工序的半成品规格代替。 */
export function orderProductSpec(item: Api.RelatedOrderItem) {
  const specification = dimensionTextInMm(item.specification?.trim());
  const size = dimensionTextInMm(item.size?.trim());
  const compactSpec = specification.replaceAll(/\s+/g, '').toLocaleLowerCase();
  const compactSize = size.replaceAll(/\s+/g, '').toLocaleLowerCase();
  let sizeIncluded = false;
  if (compactSize) {
    for (let index = compactSpec.indexOf(compactSize); index >= 0; index = compactSpec.indexOf(compactSize, index + 1)) {
      if (!/[\d.]/.test(compactSpec[index - 1] ?? '') && !/[\d.]/.test(compactSpec[index + compactSize.length] ?? '')) {
        sizeIncluded = true;
        break;
      }
    }
  }
  // 仅合并完整重复的尺寸；材质、颜色即使与规格文本冲突，也保留原始快照值供核对。
  return [...new Set([specification, sizeIncluded ? '' : size, item.material, item.color]
    .filter((value): value is string => !!value?.trim())
    .map((value) => value.trim()))].join(' · ');
}

/** 工厂已填写的生产参数按 mm 展示，缺失项不猜测。 */
export function orderTargetSpec(item: Api.RelatedOrderItem, options?: StockApi.Options) {
  const labels = makeLabels(options);
  const frontThickness = dimensionToDisplay(item.targetFrontThickness, 'mm');
  const backThickness = dimensionToDisplay(item.targetBackThickness, 'mm');
  return [
    labels.material(item.targetMaterial),
    ({ SINGLE: '单色', DUAL: '双色', UNKNOWN: '' } as Record<string, string>)[item.targetColorMode ?? ''] ?? item.targetColorMode,
    ({ SINGLE_LAYER: '单层', DOUBLE_LAYER: '双层', UNKNOWN: '' } as Record<string, string>)[item.targetConstructionType ?? ''] ?? item.targetConstructionType,
    sizeText({ length: item.targetLength, width: item.targetWidth, thickness: item.targetThickness }, 'mm'),
    item.targetFrontColor && `正面 ${labels.color(item.targetFrontColor)}`,
    item.targetBackColor && `反面 ${labels.color(item.targetBackColor)}`,
    frontThickness !== undefined && `正面层 ${frontThickness} mm`,
    backThickness !== undefined && `反面层 ${backThickness} mm`,
    item.targetTextureFront && `正面纹路 ${labels.texture(item.targetTextureFront)}`,
    item.targetTextureBack && `反面纹路 ${labels.texture(item.targetTextureBack)}`,
    item.targetPattern && `图案 ${labels.pattern(item.targetPattern)}`,
  ].filter(Boolean).join(' · ');
}

export function relatedProductSearch(item: Api.RelatedOrderItem) {
  return [item.orderNo, item.customerName, item.productCode, item.productName, item.specification,
    item.size, item.material, item.color, item.printing, item.packaging, item.routeName, item.recipeCode,
    orderProductSpec(item)];
}
