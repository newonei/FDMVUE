const COUNT_UNITS = new Set([
  'pcs',
  '个',
  '件',
  '包',
  '双',
  '只',
  '块',
  '套',
  '张',
  '支',
  '条',
  '片',
  '箱',
  '袋',
]);

/** 按片、张、条计数的生产数量填整数；重量、体积等实测用量保留原有精度。 */
export function quantityPrecision(unit?: null | string): 0 | 3 {
  return COUNT_UNITS.has(unit?.trim().toLowerCase() ?? '') ? 0 : 3;
}
