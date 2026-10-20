import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';

import BigNumber from 'bignumber.js';

export const ITEM_AMOUNT_FIELDS = [
  { key: 'accessoryPurchaseCost', label: '其中周边' },
  { key: 'dropshipPurchaseCost', label: '代发采购' },
  { key: 'taxFee', label: '税费' },
  { key: 'newProductGiftAmount', label: '新品礼金' },
  { key: 'customerRefundAmount', label: '客户返款' },
  { key: 'estimatedFreight', label: '暂估运费' },
  { key: 'freightAdjustment', label: '运费差异' },
  { key: 'platformFeeAdjustment', label: '平台费用调整' },
  { key: 'salesAmount', label: '销售额', imported: true },
  { key: 'purchaseCost', label: '采购成本（自营+周边）', imported: true },
  { key: 'freightCost', label: '快递运费', imported: true },
  { key: 'promotionCost', label: '推广费', imported: true },
  { key: 'platformFeeBill', label: '平台账单费用', imported: true },
] as const;

export type ItemAmountKey = (typeof ITEM_AMOUNT_FIELDS)[number]['key'];
export type ItemDraft = Record<ItemAmountKey, Api.Decimal> & {
  platformFeeAdjustmentReason: string;
  remark: string;
};

/** saveItem 是全行替换接口，隐藏列也必须原样保留。金额用字符串，避免损失六位小数。 */
export function itemDraft(item: Api.Item): ItemDraft {
  const amounts = Object.fromEntries(
    ITEM_AMOUNT_FIELDS.map(({ key }) => [key, item[key] ?? null]),
  ) as Record<ItemAmountKey, Api.Decimal>;
  // 历史导入只有平台扣费合计，沿用单行编辑器的兼容口径。
  amounts.platformFeeBill ??= item.platformFee ?? null;
  return {
    ...amounts,
    platformFeeAdjustmentReason: item.platformFeeAdjustmentReason ?? '',
    remark: item.remark ?? '',
  };
}

function sameAmount(left: Api.Decimal, right: Api.Decimal) {
  const a = left === '' ? null : left;
  const b = right === '' ? null : right;
  return a === null || b === null ? a === b : new BigNumber(a).eq(b);
}

export function itemDraftChanged(draft: ItemDraft, original: ItemDraft) {
  return (
    ITEM_AMOUNT_FIELDS.some(
      ({ key }) => !sameAmount(draft[key], original[key]),
    ) ||
    draft.platformFeeAdjustmentReason.trim() !==
      original.platformFeeAdjustmentReason.trim() ||
    draft.remark.trim() !== original.remark.trim()
  );
}

export function validateItemDraft(draft: ItemDraft): string | undefined {
  for (const { key, label } of ITEM_AMOUNT_FIELDS) {
    if (draft[key] === null || draft[key] === '') continue;
    const amount = new BigNumber(draft[key]);
    if (
      !amount.isFinite() ||
      amount.abs().gte('100000000000000') ||
      amount.dp()! > 6
    ) {
      return `${label}须为最多 14 位整数、6 位小数的金额`;
    }
  }
  if (
    draft.platformFeeAdjustment !== null &&
    draft.platformFeeAdjustment !== ''
  ) {
    if (draft.platformFeeBill === null || draft.platformFeeBill === '') {
      return '填写平台费用调整前，请先填写平台账单费用（切换到全部字段）';
    }
    if (
      !new BigNumber(draft.platformFeeAdjustment).isZero() &&
      !draft.platformFeeAdjustmentReason.trim()
    ) {
      return '平台费用有调整时请填写调整原因';
    }
  }
  if (
    draft.platformFeeAdjustmentReason.length > 500 ||
    draft.remark.length > 500
  ) {
    return '调整原因和备注最多填写 500 字';
  }
}

export function itemSaveRequest(
  item: Api.Item,
  draft: ItemDraft,
  month: string,
  version: number,
): Api.ItemSave {
  return {
    ...draft,
    id: item.id,
    month,
    reportVersion: version,
    lineType: item.lineType,
    shopId: item.shopId,
    shopName: item.shopName,
    platformFeeAdjustmentReason:
      draft.platformFeeAdjustmentReason.trim() || undefined,
    remark: draft.remark.trim() || undefined,
  };
}
