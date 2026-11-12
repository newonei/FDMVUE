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
