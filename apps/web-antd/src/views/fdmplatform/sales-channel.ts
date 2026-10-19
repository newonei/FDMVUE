/**
 * 业务线：外贸 / 内销。合同记在 businessType，客户档案记在 salesChannel；
 * 没有标记的历史合同和客户一律按外贸。
 */
export type SalesChannel = 'DOMESTIC' | 'FOREIGN';

/** 内销只用人民币 */
export const DOMESTIC_CURRENCY = 'CNY';

export const salesChannelLabels: Record<SalesChannel, string> = {
  DOMESTIC: '内销',
  FOREIGN: '外贸',
};

export function salesChannelOf(value?: null | string): SalesChannel {
  return value === 'DOMESTIC' ? 'DOMESTIC' : 'FOREIGN';
}

/**
 * 列表按业务线筛选；从其他页面带着合同跳过来时只按合同筛，
 * 避免内销合同在外贸菜单里（或反过来）查不到单据。
 */
export function channelFilter(
  channel: SalesChannel | undefined,
  contractId?: string,
): SalesChannel | undefined {
  return contractId ? undefined : channel;
}
