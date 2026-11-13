import type { JixiaoApi } from '#/api/fdmperformance';

import type { ManagementListState } from './list-state';

import { describe, expect, it } from 'vitest';

import {
  defaultManagementQuery,
  restoreManagementListState,
} from './list-state';

const admin: JixiaoApi.Access = {
  availableScopes: ['SELF', 'INITIATED', 'MANAGED', 'ALL'],
  canConfigure: true,
  canExport: true,
  canLaunch: true,
  canManage: true,
  canManageTemplate: true,
  role: 'ADMIN',
};

function savedState(
  overrides: Partial<ManagementListState> = {},
): ManagementListState {
  return {
    activeTab: 'instances',
    appliedQuery: defaultManagementQuery('ALL'),
    creatorOptions: [],
    draftQuery: defaultManagementQuery('ALL'),
    scrollTop: 0,
    ...overrides,
  };
}

describe('考核管理会话状态恢复', () => {
  it.each(['hr-review', 'templates'])(
    '当前权限收回范围和 %s 页签时回退，清除不适用的发起人',
    (activeTab) => {
      const previousQuery = {
        ...defaultManagementQuery('ALL'),
        creatorUserId: 22,
        deptId: 8,
        pageNo: 3,
        periodKey: '2026-10',
        userName: '李晨',
      };
      const saved = savedState({
        activeTab,
        appliedQuery: previousQuery,
        creatorOptions: [{ label: '原发起人', value: 22 }],
        draftQuery: { ...previousQuery },
      });
      const restricted: JixiaoApi.Access = {
        ...admin,
        availableScopes: ['SELF', 'INITIATED'],
        canConfigure: false,
        canManageTemplate: false,
        role: 'SUPERVISOR',
      };

      const restored = restoreManagementListState(saved, restricted);

      expect(restored.activeTab).toBe('instances');
      expect(restored.appliedQuery).toEqual({
        ...previousQuery,
        creatorUserId: undefined,
        scope: 'INITIATED',
      });
      expect(restored.draftQuery).toEqual(restored.appliedQuery);
      expect(restored.creatorOptions).toEqual([]);
      expect(saved.appliedQuery.scope).toBe('ALL');
      expect(saved.appliedQuery.creatorUserId).toBe(22);
    },
  );

  it.each(['hr-review', 'templates'])(
    '当前仍有权限时恢复 %s 页签',
    (activeTab) => {
      expect(
        restoreManagementListState(savedState({ activeTab }), admin).activeTab,
      ).toBe(activeTab);
    },
  );

  it('丢弃会话中的无效分页、月份、身份字段和未知查询参数', () => {
    const invalidQuery = {
      creatorUserId: -3,
      deptId: 1.5,
      pageNo: 0,
      pageSize: 15,
      periodKey: '2026-13',
      scope: 'UNKNOWN',
      status: '2',
      tenantId: 999,
      userName: { name: '李晨' },
    };
    const untrusted = {
      activeTab: 'unknown-tab',
      appliedQuery: invalidQuery,
      creatorOptions: 'invalid-options',
      draftQuery: { ...invalidQuery, pageNo: Number.MAX_VALUE },
      rows: [{ id: 1, finalScore: 100 }],
      scrollTop: Number.POSITIVE_INFINITY,
    } as unknown as ManagementListState;

    const restored = restoreManagementListState(untrusted, admin);

    expect(restored).toEqual(savedState());
    expect(restored.appliedQuery).not.toHaveProperty('tenantId');
    expect(restored).not.toHaveProperty('rows');
  });

  it.each(['2026-00', '2026-1', '2026-10-01', 'invalid-date'])(
    '无效月份 %s 不进入恢复后的请求',
    (periodKey) => {
      const saved = savedState({
        appliedQuery: { ...defaultManagementQuery('ALL'), periodKey },
      });

      expect(
        restoreManagementListState(saved, admin).appliedQuery.periodKey,
      ).toBeUndefined();
    },
  );

  it('保留草稿和已查询条件的独立值，只恢复选中发起人的显示名称', () => {
    const saved = savedState({
      appliedQuery: {
        ...defaultManagementQuery('MANAGED'),
        creatorUserId: 21,
        deptId: 8,
        pageNo: 3,
        pageSize: 20,
        periodKey: '2026-10',
        userName: '李晨',
      },
      creatorOptions: [
        { label: '已查询发起人', value: 21 },
        { label: '草稿发起人', value: 22 },
        { label: '未选发起人', value: 23 },
        { label: 9, value: 22 },
        null,
      ] as unknown as ManagementListState['creatorOptions'],
      draftQuery: {
        ...defaultManagementQuery('MANAGED'),
        creatorUserId: 22,
        deptId: 9,
        pageNo: 3,
        pageSize: 20,
        periodKey: '2026-11',
        userName: '蔡小倩',
      },
      scrollTop: 480,
    });

    const restored = restoreManagementListState(saved, admin);

    expect(restored.appliedQuery).toEqual(saved.appliedQuery);
    expect(restored.draftQuery).toEqual(saved.draftQuery);
    expect(restored.appliedQuery).not.toBe(saved.appliedQuery);
    expect(restored.draftQuery).not.toBe(saved.draftQuery);
    expect(restored.creatorOptions).toEqual([
      { label: '已查询发起人', value: 21 },
      { label: '草稿发起人', value: 22 },
    ]);
    expect(restored.scrollTop).toBe(480);
    restored.draftQuery.userName = '新的草稿';
    expect(restored.appliedQuery.userName).toBe('李晨');
    expect(saved.draftQuery.userName).toBe('蔡小倩');
  });

  it('范围页签以已提交查询为准，恢复我发起的范围时清除草稿发起人', () => {
    const saved = savedState({
      appliedQuery: defaultManagementQuery('INITIATED'),
      creatorOptions: [{ label: '草稿发起人', value: 22 }],
      draftQuery: {
        ...defaultManagementQuery('ALL'),
        creatorUserId: 22,
        userName: '尚未提交',
      },
    });

    const restored = restoreManagementListState(saved, admin);

    expect(restored.draftQuery.scope).toBe('INITIATED');
    expect(restored.draftQuery.creatorUserId).toBeUndefined();
    expect(restored.draftQuery.userName).toBe('尚未提交');
    expect(restored.creatorOptions).toEqual([]);
  });

  it('没有保存状态时使用当前权限允许的默认范围', () => {
    const access = {
      ...admin,
      availableScopes: ['SELF', 'MANAGED'] as JixiaoApi.Scope[],
    };

    const restored = restoreManagementListState(null, access);

    expect(restored.appliedQuery).toEqual(defaultManagementQuery('MANAGED'));
    expect(restored.draftQuery).toEqual(restored.appliedQuery);
    expect(restored.activeTab).toBe('instances');
    expect(restored.scrollTop).toBe(0);
  });
});
