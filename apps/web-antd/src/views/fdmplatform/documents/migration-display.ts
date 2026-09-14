import { money } from '../data';
export function contractReferenceText(
  code: unknown,
  name: unknown,
  id: unknown,
) {
  for (const value of [code, name])
    if (typeof value === 'string' && value.trim()) return value.trim();
  return typeof id === 'string' && id.trim() ? '查看关联合同' : '尚未关联合同';
}

export function nativeMoney(value: unknown, currency: unknown) {
  return `${money(value, typeof currency === 'string' ? currency : '')}${typeof currency === 'string' && currency.trim() ? '' : '（币种待核对）'}`;
}
export function migrationCell(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  if (key === 'sourceBookAmount')
    return record.sourceBookAmount === null ||
      record.sourceBookAmount === undefined
      ? '未导出原账面金额'
      : nativeMoney(record.sourceBookAmount, record.sourceBookCurrency);
  if (key === 'currency' && !record.currency) return '币种待核对';
  if (
    key === 'amount' &&
    (record.amount === null || record.amount === undefined)
  )
    return '原币金额未导出';
  return undefined;
}
