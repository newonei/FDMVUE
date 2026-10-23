import type { BusinessRecord } from '#/api/fdmplatform';
import type {
  OrderAccessory,
  OrderLineExtra,
  OrderPackagingStep,
  OrderSharedColumn,
  ProcurementOrderView,
} from '#/api/fdmplatform/procurement';

import BigNumber from 'bignumber.js';

/** 下单资料里印到采购单上的补充内容（#88），与后端 PlatformPurchaseExtras 字段一致。 */
export interface PrintExtras {
  accessories: OrderAccessory[];
  lineExtras: Record<string, OrderLineExtra>;
  packagingSteps: OrderPackagingStep[];
  sharedColumns: OrderSharedColumn[];
}

/** 共用说明列常用名称：金智瑜伽垫采购单里的两列。 */
export const SHARED_COLUMN_SUGGESTIONS = ['纹路', '定制'];
export const MAX_SHARED_COLUMNS = 4;
export const MAX_SHARED_IMAGES = 6;
export const MAX_STEPS = 12;
export const MAX_STEP_IMAGES = 8;

/** 勾选清单：已存的在前（保留顺序、勾选与备注），清单里新增的补在后面、默认不勾。 */
export function accessoryRows(
  saved: OrderAccessory[] | undefined,
  catalog: string[] | undefined,
): OrderAccessory[] {
  const rows = (saved ?? []).map((row) => ({ ...row }));
  const names = new Set(rows.map((row) => row.name));
  for (const name of catalog ?? [])
    if (!names.has(name)) rows.push({ name, checked: false });
  return rows;
}

export function printExtrasFrom(
  details: ProcurementOrderView['details'],
  catalog?: string[],
): PrintExtras {
  return {
    lineExtras: Object.fromEntries(
      Object.entries(details.lineExtras ?? {}).map(([id, row]) => [
        id,
        { ...row },
      ]),
    ),
    sharedColumns: (details.sharedColumns ?? []).map((row) => ({
      ...row,
      imageIds: [...(row.imageIds ?? [])],
    })),
    accessories: accessoryRows(details.accessories, catalog),
    packagingSteps: (details.packagingSteps ?? []).map((row) => ({
      ...row,
      imageIds: [...(row.imageIds ?? [])],
    })),
  };
}

/** 箱数 = 数量 ÷ 装箱数，向上取整；没填装箱数为空。 */
export function boxCount(quantity: unknown, packQty?: null | number) {
  if (!packQty || packQty <= 0) return '';
  const value = new BigNumber(String(quantity ?? 0));
  if (!value.isFinite() || value.lte(0)) return '';
  return value.div(packQty).integerValue(BigNumber.ROUND_CEIL).toString();
}

function blank(value?: string) {
  return !value?.trim();
}

/**
 * 提交前整理：去掉空行与空值。只填了名称没内容的共用列、步骤保留（会印出标题）；
 * 有内容却没填名称的也保留，交给后端提示补名称。辅料一项没勾时不提交清单。
 */
export function printExtrasPayload(value: PrintExtras) {
  const lineExtras: Record<string, OrderLineExtra> = {};
  for (const [id, row] of Object.entries(value.lineExtras)) {
    const clean: OrderLineExtra = {};
    for (const key of ['customerColor', 'weight', 'model'] as const)
      if (!blank(row[key])) clean[key] = row[key]!.trim();
    if (row.packQty) clean.packQty = row.packQty;
    if (row.imageId) clean.imageId = row.imageId;
    if (Object.keys(clean).length > 0) lineExtras[id] = clean;
  }
  const filled = (row: { imageIds: string[]; text?: string; title: string }) =>
    !blank(row.title) || !blank(row.text) || row.imageIds.length > 0;
  const accessories = value.accessories.some((row) => row.checked)
    ? value.accessories.map((row) => ({
        name: row.name,
        checked: row.checked,
        ...(row.checked && !blank(row.remark)
          ? { remark: row.remark!.trim() }
          : {}),
      }))
    : [];
  return {
    lineExtras,
    sharedColumns: value.sharedColumns.filter(filled),
    accessories,
    packagingSteps: value.packagingSteps.filter(filled),
  };
}

/** 资料里引用的全部图片，复制历史单时一次换成本单的新图片。 */
export function printExtrasImageIds(value: PrintExtras) {
  return [
    ...new Set([
      ...Object.values(value.lineExtras)
        .map((row) => row.imageId)
        .filter((id): id is string => !!id),
      ...value.sharedColumns.flatMap((row) => row.imageIds),
      ...value.packagingSteps.flatMap((row) => row.imageIds),
    ]),
  ];
}

/** 明细行按什么对上历史单：优先产品档案 id，没有就用产品编号。 */
function lineKey(line: BusinessRecord) {
  const spec = (line.specificationSnapshot ?? {}) as BusinessRecord;
  const sku = line.skuId ?? spec.skuId;
  if (sku) return `sku:${String(sku)}`;
  return spec.skuCode ? `code:${String(spec.skuCode)}` : undefined;
}

/**
 * 从历史采购单带过来：共用说明列、辅料勾选、包装步骤整份替换；明细补充按产品对上本单的行，对不上的行保持不变。
 * images 为 历史单图片 id → 复制到本单后的新 id，没有对应的图片丢掉。
 */
export function copyPrintExtras(
  current: PrintExtras,
  source: PrintExtras,
  sourceLines: BusinessRecord[],
  targetLines: BusinessRecord[],
  images: Record<string, string>,
  catalog?: string[],
): { matched: number; value: PrintExtras } {
  const swap = (ids: string[]) =>
    ids.map((id) => images[id]).filter((id): id is string => !!id);
  const bySource = new Map<string, OrderLineExtra>();
  for (const line of sourceLines) {
    const key = lineKey(line);
    const extra = source.lineExtras[String(line.id)];
    if (key && extra && !bySource.has(key)) bySource.set(key, extra);
  }
  const lineExtras = { ...current.lineExtras };
  let matched = 0;
  for (const line of targetLines) {
    const key = lineKey(line);
    const extra = key ? bySource.get(key) : undefined;
    if (!extra) continue;
    matched++;
    const { imageId, ...rest } = extra;
    const copied = imageId ? images[imageId] : undefined;
    lineExtras[String(line.id)] = {
      ...rest,
      ...(copied ? { imageId: copied } : {}),
    };
  }
  return {
    matched,
    value: {
      lineExtras,
      sharedColumns: source.sharedColumns.map((row) => ({
        ...row,
        imageIds: swap(row.imageIds),
      })),
      accessories: accessoryRows(source.accessories, catalog),
      packagingSteps: source.packagingSteps.map((row) => ({
        ...row,
        imageIds: swap(row.imageIds),
      })),
    },
  };
}
