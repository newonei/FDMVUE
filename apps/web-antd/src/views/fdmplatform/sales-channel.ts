/**
 * 业务线：外贸 / 内销。合同记在 businessType，客户档案记在 salesChannel；
 * 没有标记的历史合同和客户一律按外贸。
 * 合同业务类型：内销 DOMESTIC、内销样品 DOMESTIC_SAMPLE 属内销，其余（外贸、样品、政府）属外贸。
 */
export type SalesChannel = 'DOMESTIC' | 'FOREIGN';

/** 内销只用人民币 */
export const DOMESTIC_CURRENCY = 'CNY';

export const salesChannelLabels: Record<SalesChannel, string> = {
  DOMESTIC: '内销',
  FOREIGN: '外贸',
};

export function salesChannelOf(value?: null | string): SalesChannel {
  return value === 'DOMESTIC' || value === 'DOMESTIC_SAMPLE'
    ? 'DOMESTIC'
    : 'FOREIGN';
}

/** 样品单允许零价；外贸样品是 SAMPLE，内销样品是 DOMESTIC_SAMPLE */
export function sampleBusinessType(channel: SalesChannel) {
  return channel === 'DOMESTIC' ? 'DOMESTIC_SAMPLE' : 'SAMPLE';
}

export function isSampleBusinessType(value?: null | string) {
  return value === 'SAMPLE' || value === 'DOMESTIC_SAMPLE';
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
