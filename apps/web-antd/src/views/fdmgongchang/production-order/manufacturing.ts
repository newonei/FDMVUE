import { dimensionToDisplay } from '../shared/dimensions';

export function colorModeText(value?: null | string) {
  if (value === 'DUAL') return '双色';
  if (value === 'SINGLE') return '单色';
  return '未填写';
}

export function thicknessText(value?: null | number | string) {
  const thickness = dimensionToDisplay(value, 'mm');
  return thickness === undefined ? '未填写' : `${thickness} mm`;
}

/** 只展示明确记录的值；字典不可用时保留编码，不从名称或另一面推测。 */
export function parameterText(value?: null | string, name?: null | string) {
  if (!value?.trim()) return '未填写';
  return name?.trim() && name !== value ? `${name} (${value})` : value;
}

/** 工艺未确认或两面都缺纹路时仍提示缺失；已确认单面压花允许另一面不压花。 */
export function textureText(item: {
  processes?: string[];
  targetConfirmedAt?: null | string;
  targetTextureBack?: null | string;
  targetTextureFront?: null | string;
}, side: 'BACK' | 'FRONT', name?: null | string) {
  if (item.processes?.length && !item.processes.includes('EMBOSS')) return '不压花';
  const value = side === 'FRONT' ? item.targetTextureFront : item.targetTextureBack;
  if (value?.trim()) return parameterText(value, name);
  if (item.processes?.includes('EMBOSS') && item.targetConfirmedAt &&
      (item.targetTextureFront?.trim() || item.targetTextureBack?.trim())) return '不压花';
  return '未填写';
}
