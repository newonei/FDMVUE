import type { FdmgongchangColor } from '#/api/fdmgongchang/factory';

export const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/** 预览：有照片用照片，否则有色值用色块，都没有为空。 */
export function colorPreview(color: FdmgongchangColor) {
  if (color.imageUrl) return { kind: 'image' as const, value: color.imageUrl };
  if (color.hex && HEX_PATTERN.test(color.hex))
    return { kind: 'swatch' as const, value: color.hex };
  return { kind: 'none' as const, value: '' };
}

export type ColorFilter = 'all' | 'disabled' | 'noPreview' | 'used';

/** 按色号、名称、备注搜索，再按筛选条件过滤。 */
export function filterColors(
  list: FdmgongchangColor[],
  keyword: string,
  filter: ColorFilter,
) {
  const word = keyword.trim().toLowerCase();
  return list.filter((c) => {
    if (
      word &&
      ![c.code, c.name, c.remark].some((v) => v?.toLowerCase().includes(word))
    )
      return false;
    if (filter === 'noPreview') return colorPreview(c).kind === 'none';
    if (filter === 'used') return (c.itemCount ?? 0) > 0;
    if (filter === 'disabled') return c.status === 1;
    return true;
  });
}

/** 保存前检查：色号必填，色值要是 #RRGGBB。返回问题，没有问题为空。 */
export function colorProblem(color: FdmgongchangColor) {
  if (!color.code?.trim()) return '请填写色号';
  if (color.hex?.trim() && !HEX_PATTERN.test(color.hex.trim()))
    return '色值要写成 #RRGGBB，例如 #2E6B4F';
  return '';
}
