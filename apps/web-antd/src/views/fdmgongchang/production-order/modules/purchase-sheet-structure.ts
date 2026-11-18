import type { FdmgongchangProductionOrderApi as Api, FdmgongchangSupplyMatchApi as MatchApi } from '#/api/fdmgongchang/production-order';
import type { OrderLineExtra } from '#/api/fdmplatform/procurement';
import type { ProductStructure } from '#/api/fdmplatform/products';

/** 正式 SKU 使用合同配置快照；旧单允许采购资料逐字段补齐，克重均可补充。 */
export function purchaseSheetStructure(
  line: Api.PurchaseSheet['order']['lines'][number],
  extra?: OrderLineExtra,
  options?: MatchApi.TargetOptions,
): ProductStructure {
  const value: ProductStructure = { ...line };
  if (!extra) return value;
  if (line.finishedSignature?.trim()) {
    if (extra.weight !== undefined) value.weight = extra.weight;
    return value;
  }
  if (extra.colorMode) value.colorMode = extra.colorMode;
  for (const [field, labelField, dictionary] of [
    ['frontColor', 'frontColorLabel', options?.colors],
    ['backColor', 'backColorLabel', options?.colors],
    ['textureFront', 'textureFrontLabel', options?.textures],
    ['textureBack', 'textureBackLabel', options?.textures],
  ] as const) {
    if (extra[field] === undefined) continue;
    value[field] = extra[field];
    value[labelField] = dictionary?.find((option) => option.value === extra[field])?.label;
  }
  if (value.colorMode === 'SINGLE') {
    const frontOverridden = extra.frontColor !== undefined;
    const singleColor = frontOverridden ? extra.frontColor : value.frontColor || value.colorCode;
    const singleColorLabel = frontOverridden || value.frontColor ? value.frontColorLabel : value.colorCodeLabel;
    value.colorCode = singleColor;
    value.colorCodeLabel = singleColorLabel;
    value.frontColor = singleColor;
    value.frontColorLabel = singleColorLabel;
    value.backColor = value.colorCode;
    value.backColorLabel = value.colorCodeLabel;
  } else if (extra.colorMode !== undefined || extra.frontColor !== undefined || extra.backColor !== undefined) {
    value.colorCode = '';
    value.colorCodeLabel = undefined;
  }
  if (extra.weight !== undefined) value.weight = extra.weight;
  return value;
}

export function purchaseSheetImageIds(details: Api.PurchaseSheet['details']) {
  const ids = new Set<string>();
  for (const section of [...(details.packagingSteps ?? []), ...(details.sharedColumns ?? [])]) {
    for (const id of section.imageIds ?? []) if (id) ids.add(id);
  }
  for (const extra of Object.values(details.lineExtras ?? {})) {
    for (const id of [extra.imageId, extra.colorImageId]) if (id) ids.add(id);
  }
  return [...ids];
}
