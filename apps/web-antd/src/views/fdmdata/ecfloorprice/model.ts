import type { FdmdataEcFloorPriceApi } from '#/api/fdmdata/ecfloorprice';

import BigNumber from 'bignumber.js';

/** 默认参考价 = 底价 × 1.2，和后端 EcFloorPriceSpecs 一致 */
export const DEFAULT_REF_RATE = 1.2;

export function defaultRefPrice(floorPrice: unknown): null | number {
  if (floorPrice === null || floorPrice === undefined || floorPrice === '') {
    return null;
  }
  const value = new BigNumber(floorPrice as number | string);
  if (!value.isFinite() || value.lte(0)) return null;
  return value.times(DEFAULT_REF_RATE).decimalPlaces(2).toNumber();
}

/** 未定价显示文字，不显示 0 */
export function formatPrice(value: unknown) {
  if (value === null || value === undefined || value === '') return '未定价';
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '未定价';
  return num.toFixed(2).replace(/\.?0+$/, '');
}

export interface SpecMatrix {
  /** 厚度列，如 0.6、0.8（单位 cm） */
  thicknesses: string[];
  rows: Array<{
    key: string;
    materialKey: string;
    size: string;
    cells: Record<string, FdmdataEcFloorPriceApi.FloorPrice>;
  }>;
  /** 不是「长*宽*厚」的规格（配件等），按列表显示 */
  others: FdmdataEcFloorPriceApi.FloorPrice[];
}

const NUMBER = /^\d+(?:\.\d+)?$/;

/**
 * 把一个系列的底价排成「尺寸 × 厚度」：specKey 已由后端归一化成 185*61*0.6。
 * 材质不同的同尺寸分开成行。
 */
export function buildSpecMatrix(
  list: FdmdataEcFloorPriceApi.FloorPrice[],
): SpecMatrix {
  const thicknesses = new Set<string>();
  const rowMap = new Map<string, SpecMatrix['rows'][number]>();
  const others: FdmdataEcFloorPriceApi.FloorPrice[] = [];
  for (const item of list) {
    const parts = (item.specKey ?? '').split('*');
    if (parts.length !== 3 || !parts.every((p) => NUMBER.test(p))) {
      others.push(item);
      continue;
    }
    const size = `${parts[0]}*${parts[1]}`;
    const thickness = parts[2]!;
    const materialKey = item.materialKey ?? '';
    const key = `${materialKey}|${size}`;
    let row = rowMap.get(key);
    if (!row) {
      row = { key, materialKey, size, cells: {} };
      rowMap.set(key, row);
    }
    if (row.cells[thickness]) {
      others.push(item);
      continue;
    }
    row.cells[thickness] = item;
    thicknesses.add(thickness);
  }
  const bySize = (a: string, b: string) => {
    const [a1 = 0, a2 = 0] = a.split('*').map(Number);
    const [b1 = 0, b2 = 0] = b.split('*').map(Number);
    return a1 - b1 || a2 - b2;
  };
  return {
    thicknesses: [...thicknesses].sort((a, b) => Number(a) - Number(b)),
    rows: [...rowMap.values()].sort(
      (a, b) =>
        a.materialKey.localeCompare(b.materialKey) || bySize(a.size, b.size),
    ),
    others,
  };
}

/** 厚度列标题：0.6 → 6mm；不足 1mm 的保留 cm */
export function thicknessLabel(cm: string) {
  const mm = new BigNumber(cm).times(10);
  return mm.gte(1) ? `${mm.toString()}mm` : `${cm}cm`;
}

/**
 * 像聚水潭商品编码（字母数字和短横线、不含空格和中文，如 TPE-ZD-NL-16006006、2025162060011）
 * 就直接按编码查，不用 AI。纯数字要够长，避免把「185」当编码。
 */
export function looksLikeItemCode(text: string) {
  const s = text.trim();
  if (!/^[\dA-Za-z-]+$/.test(s)) return false;
  if (/^\d+$/.test(s)) return s.length >= 10;
  return s.includes('-') && s.length >= 6;
}
