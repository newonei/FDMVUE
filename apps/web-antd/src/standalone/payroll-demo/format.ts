const amount = (cents: number) =>
  (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const currency = (cents: number) =>
  (cents < 0 ? '−¥' : '¥') + amount(Math.abs(cents));
export const shortMonth = (month: string) => `${Number(month.slice(5))}月`;
export const monthLabel = (month: string) =>
  `${month.slice(0, 4)}年${shortMonth(month)}`;
