import type { ReceiptConversion } from '#/api/fdmplatform/exchange-rates';

export function conversionInput(
  date?: string,
  currency?: string,
  amount?: number | string,
) {
  const normalizedCurrency = currency?.trim().toUpperCase() ?? '';
  if (
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^[A-Z]{3}$/.test(normalizedCurrency) ||
    amount === undefined ||
    amount === '' ||
    !Number.isFinite(Number(amount)) ||
    Number(amount) <= 0
  )
    return undefined;
  return { date, currency: normalizedCurrency, amount };
}
export function conversionDateNote(
  value: Pick<ReceiptConversion, 'fallback' | 'rateDate' | 'requestedDate'>,
) {
  return value.fallback
    ? `${value.requestedDate} 休市或参考值尚未公布，采用此前 ${value.rateDate} 的参考汇率。`
    : `采用 ${value.rateDate} 的参考汇率。`;
}

export function hasReceiptFx(record: Record<string, unknown>) {
  return (
    record.exchangeRateToCny !== null &&
    record.exchangeRateToCny !== undefined &&
    Number(record.exchangeRateToCny) > 0 &&
    Boolean(record.exchangeRateDate) &&
    record.rmbAmount !== null &&
    record.rmbAmount !== undefined &&
    record.rmbAmount !== ''
  );
}
export function receiptFxDisplay(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  if (
    ![
      'exchangeRateDate',
      'exchangeRateFallback',
      'exchangeRateFetchedAt',
      'exchangeRateSource',
      'exchangeRateToCny',
      'rmbAmount',
    ].includes(key)
  )
    return undefined;
  if (!hasReceiptFx(record)) return '待补齐';
  const value = record[key];
  if (value === null || value === undefined || value === '') return '待补齐';
  if (key === 'exchangeRateFallback') return value ? '此前公布日' : '当日值';
  if (key === 'rmbAmount')
    return `CNY ${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return String(value);
}
