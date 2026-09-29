import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { describe, expect, it } from 'vitest';
import {
  assignmentApply,
  assignmentLabel,
  assignmentRequest,
  filterAssignments,
  filterMembers,
  memberCounts,
  UNCONFIGURED_GROUP,
} from './config-model';
import {
  expansionKeys,
  filterTree,
  findGroup,
  groupRanking,
  leafRows,
  nodeMetric,
  nodeState,
  selectedTotal,
  tableTree,
  UNCONFIGURED_KEY,
  yearCell,
} from './tree-model';

const shop = (
  shopId: string,
  overrides: Partial<Api.AssignmentShop> = {},
): Api.AssignmentShop => ({
  shopId,
  shopName: `店铺${shopId}`,
  enabled: true,
  configured: true,
  included: true,
  assignmentVersion: 2,
  assignmentId: 8,
  groupId: 3,
  groupName: '一组',
  departmentName: '电商',
  ...overrides,
});
const node = (
  key: string,
  overrides: Partial<Api.GroupNode> = {},
): Api.GroupNode => ({
  key,
  name: key,
  nodeType: 'GROUP',
  children: [],
  expectedShopCount: 2,
  importedShopCount: 1,
  adjustmentCount: 0,
  pendingAdjustmentCount: 0,
  unassignedCount: 0,
  missingShopIds: ['missing'],
  missingMetricCounts: {},
  dataState: 'PARTIAL',
  summary: {},
  receivedSummary: { salesAmount: '200', grossMargin: '0.15' },
  ...overrides,
});

describe('分组毛利展示与完整性', () => {
  it('表底合计直接选择服务端全月或分组投影，不重复累加父子节点', () => {
    const group = node('g', {
      summary: { salesAmount: '50' },
      receivedSummary: { salesAmount: '40' },
    });
    const total = node('total', { summary: { salesAmount: '300' } });
    const view: Api.MonthlyView = {
      month: '2026-09',
      report: null,
      groups: [group],
      total,
    };
    expect(selectedTotal(view)).toBe(total);
    expect(selectedTotal(view, 'g')).toBe(group);
    expect(nodeMetric(selectedTotal(view, 'g')!, 'salesAmount', true)).toBe(
      '40.00',
    );
    expect(selectedTotal(view, 'missing')).toBeUndefined();
  });
  it('店铺叶子与空分组不可展开，原接口数据保持不变', () => {
    const leaf = node('shop', { nodeType: 'SHOP' });
    const emptyGroup = node('empty', {
      expectedShopCount: 0,
      dataState: 'EMPTY',
    });
    const rows = tableTree([node('g', { children: [leaf] }), emptyGroup]);
    expect(rows[0]?.children?.[0]?.children).toBeUndefined();
    expect(rows[1]?.children).toBeUndefined();
    expect(leaf.children).toEqual([]);
    expect(emptyGroup.children).toEqual([]);
  });
  it('缺失完整合计与明确的已导入小计保持分离，零金额仍显示', () => {
    const group = node('g');
    expect(nodeMetric(group, 'salesAmount')).toBe('—');
    expect(nodeMetric(group, 'salesAmount', true)).toBe('200.00');
    expect(nodeMetric(group, 'grossMargin', true)).toBe('15.00%');
    expect(
      nodeMetric(node('zero', { summary: { salesAmount: 0 } }), 'salesAmount'),
    ).toBe('0.00');
  });
  it('未配置分组与费用行保留在树中，可展开、筛选和定位', () => {
    const unconfigured = node(UNCONFIGURED_KEY, {
      name: '未配置',
      children: [node('fee', { nodeType: 'ADJUSTMENT' })],
    });
    const group = node('GROUP:3', { children: [node('shop', { nodeType: 'SHOP' })] });
    const empty = node('GROUP:4');
    expect(expansionKeys([group, empty, unconfigured], 'shop')).toEqual([
      'GROUP:3',
      UNCONFIGURED_KEY,
    ]);
    expect(expansionKeys([group, unconfigured], 'group')).toEqual([]);
    expect(findGroup([group, unconfigured], UNCONFIGURED_KEY)).toBe(unconfigured);
    expect(filterTree([group, unconfigured], UNCONFIGURED_KEY)).toEqual([unconfigured]);
    expect(filterTree([group, unconfigured])).toHaveLength(2);
  });
  it('没有应报店铺的空组与真实零经营区分，费用仍有状态', () => {
    expect(
      nodeState(
        node('empty', {
          expectedShopCount: 0,
          adjustmentCount: 0,
          dataState: 'EMPTY',
        }),
      ),
    ).toBe('本月无应报店铺');
    expect(
      nodeState(
        node('fee', {
          nodeType: 'ADJUSTMENT',
          item: { dataStatus: 'PENDING' } as Api.Item,
        }),
      ),
    ).toBe('费用待导入');
    expect(
      nodeState(node(UNCONFIGURED_KEY, { unassignedCount: 1, dataState: 'COMPLETE' })),
    ).toBe('数据完整');
  });
  it('店铺拍平后带上所在分组，排行按指标降序且未知值排最后', () => {
    const a = node('GROUP:1', {
      name: '甲组',
      expectedShopCount: 1,
      importedShopCount: 1,
      summary: { grossProfit: '10' },
      children: [node('SHOP:1', { nodeType: 'SHOP' })],
    });
    const b = node('GROUP:2', {
      name: '乙组',
      expectedShopCount: 1,
      importedShopCount: 1,
      summary: { grossProfit: '30' },
    });
    const c = node(UNCONFIGURED_KEY, {
      name: '未配置',
      expectedShopCount: 1,
      importedShopCount: 1,
      summary: { grossProfit: '99' },
    });
    expect(leafRows([a])[0]).toMatchObject({ key: 'SHOP:1', groupKey: 'GROUP:1', groupLabel: '甲组' });
    expect(groupRanking([a, c, b], 'grossProfit').map((row) => row.key)).toEqual([
      'GROUP:2',
      'GROUP:1',
      UNCONFIGURED_KEY,
    ]);
  });
  it('年度单元格按月份取节点', () => {
    const row: Api.YearGroup = {
      key: 'GROUP:3',
      name: '一组',
      includedMonths: [],
      summary: {},
      months: [
        { month: '2026-01', reportId: 9, reportStatus: 'READY', node: node('GROUP:3') },
      ],
    };
    expect(yearCell(row, '2026-01')?.node?.key).toBe('GROUP:3');
    expect(yearCell(row, '2026-02')).toBeUndefined();
  });
});

describe('归属预览与版本化提交', () => {
  it('未配置、未分组、排除范围分别查询，停用但已有归属店铺仍保留', () => {
    const rows = [
      shop('new', {
        configured: false,
        included: undefined,
        groupId: undefined,
      }),
      shop('missing', { groupId: undefined }),
      shop('excluded', { included: false }),
      shop('disabled', { enabled: false }),
    ];
    expect(
      filterAssignments(rows, 'unconfigured', '').map((item) => item.shopId),
    ).toEqual(['new']);
    expect(
      filterAssignments(rows, 'unassigned', '').map((item) => item.shopId),
    ).toEqual(['missing']);
    expect(
      filterAssignments(rows, 'excluded', '').map((item) => item.shopId),
    ).toEqual(['excluded']);
    expect(filterAssignments(rows, 'all', 'disabled')).toHaveLength(1);
    expect(assignmentLabel(rows[0])).toBe('未配置');
  });
  it('排除必须有原因且清除残余目标组；未分组部门需成对填写', () => {
    expect(() =>
      assignmentRequest('2026-09', [shop('a')], { included: false }),
    ).toThrow('原因');
    expect(
      assignmentRequest('2026-09', [shop('a')], {
        included: false,
        groupId: 9,
        reason: ' 不属于电商 ',
      }),
    ).toEqual({
      effectiveMonth: '2026-09',
      shopIds: ['a'],
      included: false,
      reason: '不属于电商',
    });
    expect(() =>
      assignmentRequest('2026-09', [shop('a')], {
        included: true,
        departmentCode: 'EC',
      }),
    ).toThrow('同时填写');
  });
  it('提交绑定预览前版本，复制请求并可用同一幂等键安全重试', () => {
    const request = assignmentRequest('2026-09', [shop('a')], {
      included: true,
      groupId: 4,
    });
    const preview: Api.AssignmentPreview = {
      effectiveMonth: '2026-09',
      configVersion: 6,
      previewToken: 'reviewed',
      changes: [
        {
          shopId: 'a',
          shopName: '店铺a',
          before: shop('a'),
          after: shop('a', { groupId: 4 }),
        },
      ],
      affectedReports: [],
      warnings: [],
    };
    const payload = assignmentApply(request, preview, 'stable-retry-key');
    request.shopIds.push('unexpected');
    expect(payload.shopIds).toEqual(['a']);
    expect(payload.expectedAssignments).toEqual([
      { shopId: 'a', assignmentId: 8, version: 2 },
    ]);
    expect(payload.expectedConfigVersion).toBe(6);
    expect(payload.idempotencyKey).toBe('stable-retry-key');
    expect(() => assignmentApply(request, preview, 'another')).toThrow(
      '不一致',
    );
    expect(() =>
      assignmentApply(
        { ...request, effectiveMonth: '2026-10' },
        preview,
        'another',
      ),
    ).toThrow('月份');
  });
});

describe('默认分组 + 按月调整', () => {
  const member = (
    shopId: string,
    values: Partial<Api.GroupMemberShop> = {},
  ): Api.GroupMemberShop => ({
    shopId,
    shopName: `店铺${shopId}`,
    enabled: true,
    ...values,
  });
  // a 默认 1 组；b 默认 1 组、本月请假调到 2 组；c 没有默认分组
  const shops = [
    member('a', { defaultGroupId: 1, effectiveGroupId: 1 }),
    member('b', {
      defaultGroupId: 1,
      overrideGroupId: 2,
      overrideGroupName: '二组',
      effectiveGroupId: 2,
    }),
    member('c'),
  ];
  it('默认视图按默认分组计数，按月视图按实际生效分组计数并给出调入调出', () => {
    const defaults = memberCounts(shops, 'default');
    expect(defaults.get(1)?.total).toBe(2);
    expect(defaults.get(2)).toBeUndefined();
    expect(defaults.get(UNCONFIGURED_GROUP)?.total).toBe(1);
    const month = memberCounts(shops, 'month');
    expect(month.get(1)).toEqual({ in: 0, out: 1, total: 1 });
    expect(month.get(2)).toEqual({ in: 1, out: 0, total: 1 });
  });
  it('按分组、未配置和本月调整筛选', () => {
    const ids = (rows: Api.GroupMemberShop[]) => rows.map((row) => row.shopId);
    expect(ids(filterMembers(shops, 'default', 'all', '', 1))).toEqual(['a', 'b']);
    expect(ids(filterMembers(shops, 'month', 'all', '', 1))).toEqual(['a']);
    expect(
      ids(filterMembers(shops, 'month', 'all', '', UNCONFIGURED_GROUP)),
    ).toEqual(['c']);
    expect(ids(filterMembers(shops, 'month', 'adjusted', ''))).toEqual(['b']);
    expect(ids(filterMembers(shops, 'default', 'adjusted', ''))).toEqual([]);
    expect(ids(filterMembers(shops, 'default', 'unconfigured', ''))).toEqual(['c']);
    expect(ids(filterMembers(shops, 'default', 'all', '店铺b'))).toEqual(['b']);
  });
});
