import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

export type EcShopDailyRow = FdmdataEcShopDailyApi.EcShopDaily;

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function realNetSalesAmountOf(r: Partial<EcShopDailyRow>): number {
  const real: unknown = r.realNetSalesAmount;
  if (real !== null && real !== undefined && real !== '') return round2(real);
  return round2(n(r.paidAmount) - n(r.refundAmount) - n(r.brushPrincipal));
}

/** 金额/比率统一保留两位小数 */
export function round2(v: unknown): number {
  return Math.round(n(v) * 100) / 100;
}

export function fmtAmount2(v: unknown): string {
  return round2(v).toFixed(2);
}

export function fmtPercent2(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  return `${round2(v).toFixed(2)}%`;
}

/** 同一自然日多行（多店）合并为一条聚合 */
export function mergeRowsByStatDate(
  rows: EcShopDailyRow[],
): Map<string, EcShopDailyRow> {
  const map = new Map<string, EcShopDailyRow>();
  for (const r of rows) {
    const key = normalizeStatDateKey(r.statDate);
    if (!key) continue;
    const ex = map.get(key);
    if (!ex) {
      map.set(key, {
        ...r,
        statDate: key,
        gmvAmount: round2(r.gmvAmount),
        paidAmount: round2(r.paidAmount),
        realPaidAmount: round2(r.realPaidAmount),
        refundAmount: round2(r.refundAmount),
        netSalesAmount: round2(r.netSalesAmount),
        realNetSalesAmount: realNetSalesAmountOf(r),
        brushPrincipal: round2(r.brushPrincipal),
        marketingCost: round2(r.marketingCost),
        visitorCount: n(r.visitorCount),
        pageViewCount: n(r.pageViewCount),
        buyerCount: n(r.buyerCount),
        realBuyerCount: n(r.realBuyerCount),
        orderCount: n(r.orderCount),
        paidOrderCount: n(r.paidOrderCount),
        realPaidOrderCount: n(r.realPaidOrderCount),
        brushOrderCount: n(r.brushOrderCount),
        refundOrderCount: n(r.refundOrderCount),
      } as EcShopDailyRow);
      continue;
    }
    ex.gmvAmount = round2(n(ex.gmvAmount) + n(r.gmvAmount));
    ex.paidAmount = round2(n(ex.paidAmount) + n(r.paidAmount));
    ex.realPaidAmount = round2(n(ex.realPaidAmount) + n(r.realPaidAmount));
    ex.refundAmount = round2(n(ex.refundAmount) + n(r.refundAmount));
    ex.netSalesAmount = round2(n(ex.netSalesAmount) + n(r.netSalesAmount));
    ex.realNetSalesAmount = round2(
      n(ex.realNetSalesAmount) + realNetSalesAmountOf(r),
    );
    ex.brushPrincipal = round2(n(ex.brushPrincipal) + n(r.brushPrincipal));
    ex.marketingCost = round2(n(ex.marketingCost) + n(r.marketingCost));
    ex.visitorCount = n(ex.visitorCount) + n(r.visitorCount);
    ex.pageViewCount = n(ex.pageViewCount) + n(r.pageViewCount);
    ex.buyerCount = n(ex.buyerCount) + n(r.buyerCount);
    ex.realBuyerCount = n(ex.realBuyerCount) + n(r.realBuyerCount);
    ex.orderCount = n(ex.orderCount) + n(r.orderCount);
    ex.paidOrderCount = n(ex.paidOrderCount) + n(r.paidOrderCount);
    ex.realPaidOrderCount = n(ex.realPaidOrderCount) + n(r.realPaidOrderCount);
    ex.brushOrderCount = n(ex.brushOrderCount) + n(r.brushOrderCount);
    ex.refundOrderCount = n(ex.refundOrderCount) + n(r.refundOrderCount);
  }
  return map;
}

export function normalizeStatDateKey(
  statDate: EcShopDailyRow['statDate'],
): string {
  if (statDate === undefined || statDate === null) return '';
  if (typeof statDate === 'string') return statDate.slice(0, 10);
  // dayjs
  const d = dayjs(statDate as any);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

export function sortedDailyFromMap(
  map: Map<string, EcShopDailyRow>,
): EcShopDailyRow[] {
  return [...map.values()].toSorted((a, b) =>
    String(a.statDate).localeCompare(String(b.statDate)),
  );
}

export function sliceLastDays(
  sorted: EcShopDailyRow[],
  days: number,
): EcShopDailyRow[] {
  if (sorted.length <= days) return sorted;
  return sorted.slice(-days);
}

export function sumKpi(rows: EcShopDailyRow[]) {
  let netSales = 0;
  let marketing = 0;
  let refund = 0;
  let buyers = 0;
  for (const r of rows) {
    netSales += realNetSalesAmountOf(r);
    marketing += n(r.marketingCost);
    refund += n(r.refundAmount);
    buyers += n(r.buyerCount);
  }
  return {
    netSales: round2(netSales),
    marketing: round2(marketing),
    refund: round2(refund),
    buyers,
  };
}

export function expenseRatioPct(marketing: number, net: number): null | number {
  if (net <= 0) return null;
  return round2((marketing / net) * 100);
}

export function aggregateByMonth(sorted: EcShopDailyRow[]): {
  labels: string[];
  mkt: number[];
  net: number[];
  ratio: (null | number)[];
} {
  const buckets = new Map<string, { mkt: number; net: number; }>();
  for (const r of sorted) {
    const dk = normalizeStatDateKey(r.statDate);
    if (!dk) continue;
    const ym = dk.slice(0, 7);
    const b = buckets.get(ym) ?? { net: 0, mkt: 0 };
    b.net = round2(b.net + realNetSalesAmountOf(r));
    b.mkt = round2(b.mkt + n(r.marketingCost));
    buckets.set(ym, b);
  }
  const labels = [...buckets.keys()].toSorted();
  const net = labels.map((k) => round2(buckets.get(k)!.net));
  const mkt = labels.map((k) => round2(buckets.get(k)!.mkt));
  const ratio = labels.map((_, i) => expenseRatioPct(mkt[i]!, net[i]!));
  return { labels, net, mkt, ratio };
}

export function aggregateByWeekStart(
  sorted: EcShopDailyRow[],
  maxWeeks: number,
): {
  labels: string[];
  mkt: number[];
  net: number[];
  ratio: (null | number)[];
} {
  const buckets = new Map<string, { mkt: number; net: number; }>();
  for (const r of sorted) {
    const dk = normalizeStatDateKey(r.statDate);
    if (!dk) continue;
    const ws = dayjs(dk).startOf('isoWeek').format('YYYY-MM-DD');
    const b = buckets.get(ws) ?? { net: 0, mkt: 0 };
    b.net = round2(b.net + realNetSalesAmountOf(r));
    b.mkt = round2(b.mkt + n(r.marketingCost));
    buckets.set(ws, b);
  }
  const labels = [...buckets.keys()].toSorted().slice(-maxWeeks);
  const net = labels.map((k) => round2(buckets.get(k)!.net));
  const mkt = labels.map((k) => round2(buckets.get(k)!.mkt));
  const ratio = labels.map((_, i) => expenseRatioPct(mkt[i]!, net[i]!));
  return { labels, net, mkt, ratio };
}
