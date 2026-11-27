const quantityFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });

export function formatKilograms(quantity?: null | number) {
  if (quantity === null || quantity === undefined) return '—';
  const kg = Number(quantity);
  if (Math.abs(kg) >= 1000) return `${quantityFormatter.format(kg / 1000)} 吨（${quantityFormatter.format(kg)} 公斤）`;
  return `${quantityFormatter.format(kg)} 公斤`;
}
