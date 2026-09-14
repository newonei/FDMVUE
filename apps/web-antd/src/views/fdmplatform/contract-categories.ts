export const productCategoryOptions = [
  { value: 'YOGA', label: '瑜伽系列产品' },
  { value: 'MOUSEPAD_MAT', label: '鼠标垫地垫产品' },
  { value: 'FITNESS', label: '健身系列产品' },
  { value: 'ARCHERY', label: '攻防箭系列产品' },
];

export function productCategoryLabel(value: unknown) {
  return (
    productCategoryOptions.find((item) => item.value === value)?.label ||
    (value ? String(value) : '未分类')
  );
}

export function validProductCategory(value: unknown) {
  return productCategoryOptions.some((item) => item.value === value);
}
