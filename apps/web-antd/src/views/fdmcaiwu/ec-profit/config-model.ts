import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';

export type AssignmentFilter =
  | 'all'
  | 'excluded'
  | 'included'
  | 'unassigned'
  | 'unconfigured';

export function filterAssignments(
  shops: Api.AssignmentShop[],
  filter: AssignmentFilter,
  keyword: string,
  groupId?: number,
) {
  const text = keyword.trim().toLocaleLowerCase();
  return shops.filter((shop) => {
    if (groupId !== undefined && shop.groupId !== groupId) return false;
    if (
      text &&
      !`${shop.shopName} ${shop.shopId} ${shop.platformCode ?? ''}`
        .toLocaleLowerCase()
        .includes(text)
    )
      return false;
    if (filter === 'unconfigured') return !shop.configured;
    if (filter === 'unassigned')
      return shop.configured && shop.included === true && !shop.groupId;
    if (filter === 'excluded')
      return shop.configured && shop.included === false;
    if (filter === 'included') return shop.configured && shop.included === true;
    return true;
  });
}

export function assignmentLabel(shop?: Api.AssignmentShop) {
  if (!shop || !shop.configured) return '未配置';
  if (!shop.included)
    return `不纳入毛利${shop.reason ? ` · ${shop.reason}` : ''}`;
  return shop.groupName || '未分组';
}

export function assignmentRequest(
  month: string,
  shops: Api.AssignmentShop[],
  values: {
    included: boolean;
    groupId?: number;
    departmentCode?: string;
    departmentName?: string;
    reason?: string;
  },
): Api.AssignmentRequest {
  if (!shops.length) throw new Error('请至少选择一家店铺');
  if (new Set(shops.map((shop) => shop.shopId)).size > 200)
    throw new Error('每批最多配置 200 家店铺，请分批操作');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error('请选择有效生效月份');
  const reason = values.reason?.trim();
  if (!values.included && !reason) throw new Error('排除店铺时必须填写原因');
  const departmentCode = values.departmentCode?.trim();
  const departmentName = values.departmentName?.trim();
  if (
    values.included &&
    !values.groupId &&
    !!departmentCode !== !!departmentName
  )
    throw new Error('部门代码与部门名称须同时填写或同时留空');
  return {
    effectiveMonth: month,
    shopIds: [...new Set(shops.map((shop) => shop.shopId))],
    included: values.included,
    ...(values.included
      ? values.groupId
        ? { groupId: values.groupId }
        : {
            departmentCode: departmentCode || undefined,
            departmentName: departmentName || undefined,
          }
      : {}),
    reason: reason || undefined,
  };
}

/** Bind the exact reviewed request and versions; retain this object for uncertain retries. */
export function assignmentApply(
  request: Api.AssignmentRequest,
  preview: Api.AssignmentPreview,
  idempotencyKey: string,
): Api.AssignmentApply {
  if (request.effectiveMonth !== preview.effectiveMonth)
    throw new Error('预览月份已变化，请重新预览');
  const selected = [...request.shopIds].sort();
  const reviewed = preview.changes.map((change) => change.shopId).sort();
  if (JSON.stringify(selected) !== JSON.stringify(reviewed))
    throw new Error('预览店铺与当前选择不一致，请重新预览');
  return {
    ...request,
    shopIds: [...request.shopIds],
    expectedConfigVersion: preview.configVersion,
    expectedAssignments: preview.changes.map((change) => ({
      shopId: change.shopId,
      assignmentId: change.before.assignmentId,
      version: change.before.assignmentVersion,
    })),
    previewToken: preview.previewToken,
    idempotencyKey,
  };
}

// ==================== 默认分组 + 按月调整 ====================

/** default：看默认分组（所有月份）；month：看某月实际生效的分组 */
export type GroupView = 'default' | 'month';
export type MemberFilter = 'adjusted' | 'all' | 'unconfigured';
/** 分组卡片里「未配置」的 key */
export const UNCONFIGURED_GROUP = 0;

/** 该视图下店铺所在分组；没有分组为 undefined */
export function memberGroupId(shop: Api.GroupMemberShop, view: GroupView) {
  return (view === 'default' ? shop.defaultGroupId : shop.effectiveGroupId) ?? undefined;
}

/** 所选月份是否对该店做了临时调整 */
export function isAdjusted(shop: Api.GroupMemberShop) {
  return !!shop.overrideGroupName;
}

/** groupId：undefined 为全部，UNCONFIGURED_GROUP 为未配置 */
export function filterMembers(
  shops: Api.GroupMemberShop[],
  view: GroupView,
  filter: MemberFilter,
  keyword: string,
  groupId?: number,
) {
  const text = keyword.trim().toLocaleLowerCase();
  return shops.filter((shop) => {
    const current = memberGroupId(shop, view);
    if (groupId !== undefined && (current ?? UNCONFIGURED_GROUP) !== groupId)
      return false;
    if (
      text &&
      !`${shop.shopName} ${shop.shopId} ${shop.platformCode ?? ''}`
        .toLocaleLowerCase()
        .includes(text)
    )
      return false;
    if (filter === 'unconfigured') return current === undefined;
    if (filter === 'adjusted') return view === 'month' && isAdjusted(shop);
    return true;
  });
}

/** 每个分组的店铺数；未配置记在 UNCONFIGURED_GROUP。按月视图另给出调入/调出数。 */
export function memberCounts(shops: Api.GroupMemberShop[], view: GroupView) {
  const counts = new Map<number, { in: number; out: number; total: number }>();
  const entry = (id: number) => {
    let value = counts.get(id);
    if (!value) counts.set(id, (value = { in: 0, out: 0, total: 0 }));
    return value;
  };
  for (const shop of shops) {
    const current = memberGroupId(shop, view) ?? UNCONFIGURED_GROUP;
    entry(current).total++;
    if (view === 'month' && isAdjusted(shop)) {
      const fallback = shop.defaultGroupId ?? UNCONFIGURED_GROUP;
      if (fallback !== current) {
        entry(current).in++;
        entry(fallback).out++;
      }
    }
  }
  return counts;
}
