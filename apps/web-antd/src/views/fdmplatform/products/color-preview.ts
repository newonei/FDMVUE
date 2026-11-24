import type {
  Product,
  ProductAttributes,
  ProductColorPreview,
} from '#/api/fdmplatform/products';
import type { ColorSample } from '#/components/fdm-color-preview/color-preview';

export function productColorPreview(
  value?: null | string,
  label?: null | string,
  preview?: null | ProductColorPreview,
): ColorSample | undefined {
  const code = preview?.code.trim() || value?.trim();
  if (!code) return undefined;

  const text = label?.trim();
  let name: string | undefined;
  if (text && text !== code && text !== value?.trim()) {
    name = text.startsWith(`${code} `) ? text.slice(code.length + 1) : text;
  }
  return { code, hex: preview?.hex, imageUrl: preview?.imageUrl, name };
}

function catalogColor(
  value?: null | string,
  label?: null | string,
  preview?: null | ProductColorPreview,
  side?: '反' | '正',
) {
  const sample = productColorPreview(value, label, preview);
  const text = label && label !== value ? label : sample?.code || label;
  return text ? { label: text, sample, side } : undefined;
}

export function productCatalogColors(
  product: Pick<Product, 'color'> & ProductAttributes,
) {
  const single = catalogColor(
    product.colorCode,
    product.colorCodeLabel,
    product.colorCodePreview,
  );
  const front = catalogColor(
    product.frontColor,
    product.frontColorLabel,
    product.frontColorPreview,
    '正',
  );
  const back = catalogColor(
    product.backColor,
    product.backColorLabel,
    product.backColorPreview,
    '反',
  );
  const legacy = catalogColor(product.color);

  if (product.colorMode === 'SINGLE') {
    const color = single ?? front ?? legacy;
    return color ? [{ ...color, side: undefined }] : [];
  }
  if (front && back) return [front, back];
  const color = front ?? back ?? single ?? legacy;
  return color ? [color] : [];
}
