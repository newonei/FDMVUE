import { getPantoneSwatchHex } from './pantone-swatches';

export interface ColorSample {
  code: string;
  hex?: null | string;
  imageUrl?: null | string;
  name?: null | string;
}

export const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/** 优先使用实物照片和已配置色值，随后按色号查潘通参考色。 */
export function colorPreview(color: ColorSample) {
  if (color.imageUrl) return { kind: 'image' as const, value: color.imageUrl };
  if (color.hex && HEX_PATTERN.test(color.hex))
    return { kind: 'swatch' as const, value: color.hex };
  const referenceHex = getPantoneSwatchHex(color.code);
  if (referenceHex)
    return { kind: 'swatch' as const, reference: true, value: referenceHex };
  return { kind: 'none' as const, value: '' };
}
