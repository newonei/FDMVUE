import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { describe, expect, it } from 'vitest';
import {
  assignmentApply,
  assignmentLabel,
  assignmentRequest,
  filterAssignments,
} from './config-model';
import {
  expansionKeys,
  filterTree,
  findGroup,
  nodeMetric,
  nodeState,
  selectedTotal,
  tableTree,
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
  legacyGroup: false,
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
  it('表底合计直接选择服务端全月、部门或小组投影，不重复累加父子节点', () => {
    const group = node('g', {
      summary: { salesAmount: '50' },
      receivedSummary: { salesAmount: '40' },
    });
    const department = node('dept', {
      children: [group],
      summary: { salesAmount: '100' },
    });
    const total = node('total', { summary: { salesAmount: '300' } });
    const view: Api.MonthlyView = {
      month: '2026-09',
      report: null,
      departments: [department],
      total,
    };
    expect(selectedTotal(view)).toBe(total);
    expect(selectedTotal(view, 'dept')).toBe(department);
    expect(selectedTotal(view, 'dept', 'g')).toBe(group);
    expect(
      nodeMetric(selectedTotal(view, undefined, 'g')!, 'salesAmount', true),
    ).toBe('40.00');
    expect(selectedTotal(view, undefined, 'missing')).toBeUndefined();
  });
  it('店铺叶子与空小组不可展开，原接口数据保持不变', () => {
    const leaf = node('shop', { nodeType: 'SHOP' });
    const emptyGroup = node('empty', {
      expectedShopCount: 0,
      dataState: 'EMPTY',
    });
    const department = node('dept', {
      nodeType: 'DEPARTMENT',
      children: [node('g', { children: [leaf] }), emptyGroup],
    });
    const rows = tableTree([department]);
    expect(rows[0]?.children?.[0]?.children?.[0]?.children).toBeUndefined();
    expect(rows[0]?.children?.[1]?.children).toBeUndefined();
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
  it('未分组及费用节点在树和展开中保留，不因缺少groupId丢失', () => {
    const missing = node('unassigned', {
      children: [node('fee', { nodeType: 'ADJUSTMENT' })],
    });
    const department = node('department', {
      nodeType: 'DEPARTMENT',
      children: [missing],
    });
    expect(filterTree([department])[0]?.children[0]?.key).toBe('unassigned');
    expect(expansionKeys([department], 'shop')).toEqual([
      'department',
      'unassigned',
    ]);
    expect(findGroup([department], 'unassigned')?.department.key).toBe(
      'department',
    );
    expect(
      filterTree([department], undefined, 'unassigned')[0]?.children,
    ).toHaveLength(1);
  });
  it('没有应报店铺的空组与真实零经营区分，费用和归属问题仍有状态', () => {
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
      nodeState(
        node('unassigned', { unassignedCount: 1, dataState: 'PARTIAL' }),
      ),
    ).toBe('归属待确认');
  });
  it('年度点击使用当月快照，不按当前小组重归属', () => {
    const past = node('legacy', { name: '原小组', legacyGroup: true });
    const row: Api.YearGroup = {
      key: 'group:3',
      name: '新名称',
      legacyGroup: false,
      includedMonths: [],
      summary: {},
      months: [
        { month: '2026-01', reportId: 9, reportStatus: 'READY', node: past },
      ],
    };
    expect(yearCell(row, '2026-01')?.node?.name).toBe('原小组');
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
