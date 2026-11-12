import type { ProductAttributes } from '#/api/fdmplatform/products';

/** 产品档案与工厂 DTO 共用，仅依赖可选属性，不要求价格、权限等字段。 */
export type ProductAttributeSource = ProductAttributes & {
  color?: null | string;
};

/** 已维护档案优先；关联物料阶段仅用于查询、展示及生产任务预填。 */
export function productStageValue(product: ProductAttributeSource) {
  return product.productStage?.trim() || product.resolvedProductStage?.trim() || '';
}

export function productStageText(product: ProductAttributeSource) {
  return product.productStage?.trim()
    ? product.productStageLabel || product.productStage.trim()
    : product.resolvedProductStageLabel || product.resolvedProductStage?.trim() || '';
}

export function productAttributeDetails(product: ProductAttributeSource) {
  return [
    {
      label: '生产分类',
      value: productStageText(product),
    },
    { label: '垫子类型', value: product.matTypeLabel || product.matType || '' },
    { label: '单色', value: product.colorCodeLabel || product.colorCode || '' },
    {
      label: '正面颜色',
      value: product.frontColorLabel || product.frontColor || '',
    },
    {
      label: '反面颜色',
      value: product.backColorLabel || product.backColor || '',
    },
    {
      label: '正面压花',
      value: product.textureFrontLabel || product.textureFront || '',
    },
    {
      label: '反面压花',
      value: product.textureBackLabel || product.textureBack || '',
    },
  ];
}

export function productAttributesText(product: ProductAttributeSource) {
  const parts = productAttributeDetails(product)
    .filter((item) => item.value)
    .map((item) => `${item.label}：${item.value}`);
  if (
    !product.colorCode &&
    !product.frontColor &&
    !product.backColor &&
    product.color
  ) {
    parts.push(`颜色：${product.color}`);
  }
  return parts.join(' · ');
}
