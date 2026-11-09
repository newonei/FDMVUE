import type {
  InventoryWarehouse,
  StockBalance,
} from '#/api/fdmplatform/warehouse';

import BigNumber from 'bignumber.js';

/** 原样精度的数字文本（不四舍五入） */
const plain = (value: BigNumber) => value.toFixed(value.decimalPlaces() ?? 0);

const decimal = (value: unknown) => {
  const number = new BigNumber(
    typeof value === 'string' || typeof value === 'number' ? value : Number.NaN,
  );
  return number.isFinite() ? number : new BigNumber(0);
};

/** 有库存但这么多天没出库，算呆滞。 */
export const STAGNANT_DAYS = 90;

export type StockStatus =
  | 'ALL'
  | 'COST_UNKNOWN'
  | 'IN_STOCK'
  | 'NEGATIVE'
  | 'STAGNANT'
  | 'ZERO';

export const STATUS_OPTIONS: Array<{ label: string; value: StockStatus }> = [
  { value: 'IN_STOCK', label: '有库存' },
  { value: 'ALL', label: '全部（含零库存）' },
  { value: 'NEGATIVE', label: '负库存' },
  { value: 'STAGNANT', label: `呆滞（${STAGNANT_DAYS} 天未出库）` },
  { value: 'COST_UNKNOWN', label: '成本未知' },
  { value: 'ZERO', label: '零库存' },
];

export function isStockStatus(value: unknown): value is StockStatus {
  return STATUS_OPTIONS.some((option) => option.value === value);
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/** 距最近一次出库的天数；从没出过库按最近入库算。没有日期为 undefined。 */
export function idleDays(
  stock: Pick<StockBalance, 'lastInDate' | 'lastOutDate'>,
  today: string,
) {
  const since = stock.lastOutDate || stock.lastInDate;
  return since ? daysBetween(since, today) : undefined;
}

export interface StockFlags {
  costUnknown: boolean;
  inStock: boolean;
  negative: boolean;
  stagnant: boolean;
  zero: boolean;
}

export function stockFlags(stock: StockBalance, today: string): StockFlags {
  const onHand = decimal(stock.onHand);
  const idle = idleDays(stock, today);
  return {
    inStock: !onHand.isZero(),
    zero: onHand.isZero(),
    negative: onHand.lt(0),
    costUnknown: !onHand.isZero() && !stock.costKnown,
    stagnant: onHand.gt(0) && idle !== undefined && idle >= STAGNANT_DAYS,
  };
}

export function matchesStatus(
  stock: StockBalance,
  status: StockStatus,
  today: string,
) {
  const flags = stockFlags(stock, today);
  switch (status) {
    case 'ALL': {
      return true;
    }
    case 'COST_UNKNOWN': {
      return flags.costUnknown;
    }
    case 'IN_STOCK': {
      return flags.inStock;
    }
    case 'NEGATIVE': {
      return flags.negative;
    }
    case 'STAGNANT': {
      return flags.stagnant;
    }
    case 'ZERO': {
      return flags.zero;
    }
  }
}

export function matchesKeyword(stock: StockBalance, keyword: string) {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return true;
  return [
    stock.productName,
    stock.productCode,
    stock.specification,
    stock.warehouseName,
  ].some((value) => (value ?? '').toLowerCase().includes(needle));
}

export interface StockOverview {
  /** 有库存（含负数）的库存行 */
  items: number;
  /** 成本已知部分的库存金额 */
  amount: string;
  costUnknown: number;
  negative: number;
  stagnant: number;
  /** 呆滞部分的金额（成本已知） */
  stagnantAmount: string;
  zero: number;
}

export function overview(rows: StockBalance[], today: string): StockOverview {
  let amount = new BigNumber(0);
  let stagnantAmount = new BigNumber(0);
  const result = {
    items: 0,
    costUnknown: 0,
    negative: 0,
    stagnant: 0,
    zero: 0,
  };
  for (const row of rows) {
    const flags = stockFlags(row, today);
    if (flags.inStock) result.items++;
    if (flags.zero) result.zero++;
    if (flags.negative) result.negative++;
    if (flags.costUnknown) result.costUnknown++;
    if (row.costKnown) amount = amount.plus(decimal(row.costAmount));
    if (flags.stagnant) {
      result.stagnant++;
      if (row.costKnown)
        stagnantAmount = stagnantAmount.plus(decimal(row.costAmount));
    }
  }
  return {
    ...result,
    amount: amount.toFixed(2),
    stagnantAmount: stagnantAmount.toFixed(2),
  };
}

export interface WarehouseGroup {
  /** 工厂名；非工厂仓为空 */
  factoryName?: string;
  label: string;
  warehouses: WarehouseSummary[];
}

export interface WarehouseSummary {
  id: string;
  name: string;
  isDefault: boolean;
  items: number;
  amount: string;
  negative: number;
}

/**
 * 仓库导航：公司仓在前，各工厂的仓库（原料 / 半成品 / 成品）按工厂归组。
 * 只在库存里出现、仓库列表里没有的（已停用的）归到「其他仓库」。
 */
export function warehouseGroups(
  warehouses: InventoryWarehouse[],
  rows: StockBalance[],
  today: string,
): WarehouseGroup[] {
  const stats = new Map<
    string,
    { amount: BigNumber; items: number; name: string; negative: number }
  >();
  for (const row of rows) {
    const entry = stats.get(row.warehouseId) ?? {
      amount: new BigNumber(0),
      items: 0,
      name: row.warehouseName,
      negative: 0,
    };
    const flags = stockFlags(row, today);
    if (flags.inStock) entry.items++;
    if (flags.negative) entry.negative++;
    if (row.costKnown)
      entry.amount = entry.amount.plus(decimal(row.costAmount));
    stats.set(row.warehouseId, entry);
  }
  const summary = (
    id: string,
    name: string,
    isDefault = false,
  ): WarehouseSummary => {
    const entry = stats.get(id);
    return {
      id,
      name,
      isDefault,
      items: entry?.items ?? 0,
      amount: (entry?.amount ?? new BigNumber(0)).toFixed(2),
      negative: entry?.negative ?? 0,
    };
  };
  const company: WarehouseSummary[] = [];
  const factories = new Map<string, WarehouseSummary[]>();
  for (const warehouse of warehouses) {
    const row = summary(warehouse.id, warehouse.name, warehouse.isDefault);
    if (warehouse.factoryId || warehouse.factoryName) {
      const key = warehouse.factoryName || '工厂';
      factories.set(key, [...(factories.get(key) ?? []), row]);
    } else company.push(row);
  }
  const known = new Set(warehouses.map((warehouse) => warehouse.id));
  const others = [...stats.entries()]
    .filter(([id]) => !known.has(id))
    .map(([id, entry]) => summary(id, entry.name || '未命名仓库'))
    .toSorted((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const groups: WarehouseGroup[] = [];
  if (company.length > 0)
    groups.push({ label: '公司仓库', warehouses: company });
  for (const [factoryName, list] of [...factories.entries()].toSorted(
    ([a], [b]) => a.localeCompare(b, 'zh-CN'),
  ))
    groups.push({ label: factoryName, factoryName, warehouses: list });
  if (others.length > 0) groups.push({ label: '其他仓库', warehouses: others });
  return groups;
}

export interface ProductStock {
  key: string;
  productName?: string;
  productCode?: string;
  specification?: string;
  unit?: string;
  onHand: string;
  /** 成本已知部分 */
  costAmount: string;
  /** 所有仓库的成本都已知 */
  costKnown: boolean;
  lastInDate?: string;
  lastOutDate?: string;
  /** 各仓库的库存行，现存多的在前 */
  stocks: StockBalance[];
}

/** 同一 SKU 与规格版本的产品；早期没有 SKU 的按编号、规格和名称合并。 */
export function productKey(stock: StockBalance) {
  return stock.skuId
    ? `sku|${stock.skuId}|${stock.specVersion ?? ''}`
    : `name|${stock.productCode ?? ''}|${stock.specification ?? ''}|${stock.productName ?? ''}`;
}

function later(a?: string, b?: string) {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/** 按产品汇总各仓库的库存。 */
export function groupByProduct(rows: StockBalance[]): ProductStock[] {
  const groups = new Map<string, ProductStock>();
  for (const row of rows) {
    const key = productKey(row);
    const group = groups.get(key) ?? {
      key,
      productName: row.productName,
      productCode: row.productCode,
      specification: row.specification,
      unit: row.unit,
      onHand: '0',
      costAmount: '0',
      costKnown: true,
      stocks: [],
    };
    group.onHand = plain(decimal(group.onHand).plus(decimal(row.onHand)));
    if (row.costKnown)
      group.costAmount = decimal(group.costAmount)
        .plus(decimal(row.costAmount))
        .toFixed(2);
    else if (!decimal(row.onHand).isZero()) group.costKnown = false;
    group.lastInDate = later(group.lastInDate, row.lastInDate);
    group.lastOutDate = later(group.lastOutDate, row.lastOutDate);
    group.stocks.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    stocks: group.stocks.toSorted((a, b) => compareDecimal(b.onHand, a.onHand)),
  }));
}

/** 金额占比（0–100，保留一位），总额为 0 时为 0。 */
export function share(amount: unknown, total: unknown) {
  const whole = decimal(total);
  if (!whole.gt(0)) return 0;
  return decimal(amount).div(whole).times(100).decimalPlaces(1).toNumber();
}

export function compareDecimal(a: unknown, b: unknown) {
  // decimal() 已把非法值归零，comparedTo 不会返回 null
  return decimal(a).comparedTo(decimal(b)) ?? 0;
}

export function compareText(a?: string, b?: string) {
  return (a ?? '').localeCompare(b ?? '');
}

/** UTF-8 BOM，Excel 打开不乱码 */
const BOM = String.fromCodePoint(65_279);

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  // 以 = + - @ 开头的文本加引号前缀，避免被表格软件当成公式；负数照常输出
  const safe =
    typeof value === 'string' &&
    /^[=+\-@]/.test(text) &&
    !/^-\d+(?:\.\d+)?$/.test(text)
      ? `'${text}`
      : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** 当前筛选结果导出为 CSV（带 BOM，Excel 直接打开不乱码）。 */
export function stockCsv(rows: StockBalance[], today: string) {
  const header = [
    '仓库',
    '产品名称',
    '产品编号',
    '规格',
    '单位',
    '现存',
    '平均成本',
    '库存金额',
    '最近入库',
    '最近出库',
    '未出库天数',
    '状态',
  ];
  const lines = rows.map((row) => {
    const flags = stockFlags(row, today);
    const onHand = decimal(row.onHand);
    const cost =
      row.costKnown && onHand.gt(0)
        ? plain(decimal(row.costAmount).div(onHand).decimalPlaces(4))
        : '';
    const tags: string[] = [];
    if (flags.negative) tags.push('负库存');
    if (flags.stagnant) tags.push('呆滞');
    if (flags.costUnknown) tags.push('成本未知');
    if (flags.zero) tags.push('零库存');
    return [
      row.warehouseName,
      row.productName,
      row.productCode,
      row.specification,
      row.unit,
      plain(onHand),
      cost,
      row.costKnown ? decimal(row.costAmount).toFixed(2) : '',
      row.lastInDate,
      row.lastOutDate,
      flags.inStock ? (idleDays(row, today) ?? '') : '',
      tags.join('、'),
    ]
      .map((value) => csvCell(value))
      .join(',');
  });
  return `${BOM}${[header.join(','), ...lines].join('\n')}`;
}
