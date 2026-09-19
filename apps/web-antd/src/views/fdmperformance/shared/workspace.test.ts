import { describe, expect, it } from 'vitest';
import type { JixiaoApi } from '#/api/fdmperformance';
import {
  actionLabel,
  canAcknowledgeAdjustment,
  canHandleReview,
  deadlineMeta,
  defaultManagementScope,
  hasAction,
  managementScopes,
} from './workspace';

describe('performance workspace access', () => {
  it('keeps manager-visible reviews read-only unless the server grants the specific action', () => {
    expect(canHandleReview({ status: 0 }, 'REMIND')).toBe(false);
    expect(
      canHandleReview({ status: 0, allowedActions: ['SUBMIT'] }, 'REMIND'),
    ).toBe(false);
    expect(canHandleReview({ allowedActions: ['REMIND'] }, 'REMIND')).toBe(
      true,
    );
    expect(canHandleReview({ allowedActions: ['CONFIRM'] }, 'SUBMIT')).toBe(
      false,
    );
  });
  it('only offers adjustment acknowledgement for a published result explicitly marked unconfirmed', () => {
    expect(
      canAcknowledgeAdjustment({
        id: 1,
        publicStatus: 1,
        employeeConfirmed: false,
      }),
    ).toBe(true);
    expect(
      canAcknowledgeAdjustment({
        id: 1,
        publicStatus: 0,
        employeeConfirmed: false,
      }),
    ).toBe(false);
    expect(
      canAcknowledgeAdjustment({
        id: 1,
        publicStatus: 1,
        employeeConfirmed: true,
      }),
    ).toBe(false);
    expect(canAcknowledgeAdjustment({ id: 1, publicStatus: 1 })).toBe(false);
  });
  it('treats visibility and task state as read-only unless server allows an action', () => {
    const record: JixiaoApi.Instance = {
      currentTaskKey: 'JIXIAO_SUPERVISOR_SCORE',
      currentTaskId: 'task',
      allowedActions: ['REMIND'],
    };
    expect(actionLabel(record)).toBe('查看');
    expect(hasAction(record, 'SUPERVISOR_SCORE')).toBe(false);
    expect(actionLabel({ allowedActions: ['SUPERVISOR_SCORE'] })).toBe(
      '去评分',
    );
    expect(actionLabel({})).toBe('查看');
  });
  it('offers only server-authorized management scopes', () => {
    const access: JixiaoApi.Access = {
      role: 'MANAGER',
      canLaunch: true,
      canManage: true,
      canConfigure: false,
      canExport: true,
      availableScopes: ['SELF', 'INITIATED', 'MANAGED'],
    };
    expect(managementScopes(access)).toEqual(['INITIATED', 'MANAGED']);
    expect(defaultManagementScope(access)).toBe('INITIATED');
    expect(
      managementScopes({
        ...access,
        role: 'EMPLOYEE',
        availableScopes: ['SELF'],
      }),
    ).toEqual([]);
    expect(managementScopes()).toEqual([]);
  });
  it('uses the end of the local cutoff date before marking a task overdue', () => {
    expect(
      deadlineMeta('2026-09-18', new Date('2026-09-18T10:00:00')).overdue,
    ).toBe(false);
    expect(
      deadlineMeta('2026-09-18', new Date('2026-09-19T00:00:00')).overdue,
    ).toBe(true);
    expect(deadlineMeta(undefined).text).toBe('未设截止日期');
    expect(deadlineMeta('invalid').overdue).toBe(false);
  });
});
