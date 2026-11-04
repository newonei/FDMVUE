import type { BpmTaskApi } from '#/api/bpm/task';
import type { ApprovalTask } from '#/api/fdmplatform/approval-inbox';
import type { PortalSummary } from '#/api/fdmplatform/portal';

import { describe, expect, it } from 'vitest';

import {
  approvalItems,
  bpmItems,
  groupWork,
  portalItems,
  sortWork,
  summaryLine,
  waitInfo,
} from './model';

const NOW = Date.parse('2026-10-09T10:00:00Z');
const hoursAgo = (hours: number) => NOW - hours * 3_600_000;

describe('home model', () => {
  it('describes how long something has waited', () => {
    expect(waitInfo(hoursAgo(0.5), NOW)?.text).toBe('刚刚到达');
    expect(waitInfo(hoursAgo(5), NOW)?.text).toBe('等待 5 小时');
    expect(waitInfo(hoursAgo(80), NOW)?.tone).toBe('warning');
    expect(waitInfo(hoursAgo(24 * 8), NOW)?.tone).toBe('critical');
    expect(waitInfo('', NOW)).toBeUndefined();
  });

  it('turns portal todos into department work with the portal links and skips history', () => {
    const summary = {
      todos: [
        { count: 2, key: 'receipt', preview: 'HT-1 · USD 10 待确认', contractId: 'c1' },
        { count: 0, key: 'draft', preview: '' },
        { count: 5, key: 'history', preview: '' },
      ],
    } as unknown as PortalSummary;
    const items = portalItems('trade', summary);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ count: 2, group: 'business', source: '外贸', title: '回款待确认' });
    expect(items[0]!.link.path).toBeTruthy();
  });

  it('puts approvals first, overdue business approvals before older workflow tasks', () => {
    const bpm = bpmItems(
      [
        { createTime: hoursAgo(50), id: 'old', name: '审批', processInstance: { name: '报销' } },
        { createTime: hoursAgo(1), id: 'new', name: '审批', processInstance: { name: '请假' } },
      ] as unknown as BpmTaskApi.Task[],
      NOW,
    );
    const approvals = approvalItems(
      [{ id: 'late', openedAt: new Date(hoursAgo(2)).toISOString(), overdue: true, title: '合同评审' }] as ApprovalTask[],
      NOW,
    );
    const business = portalItems('finance', {
      todos: [{ count: 1, key: 'request', preview: '' }],
    } as unknown as PortalSummary);
    const sorted = sortWork([...business, ...bpm, ...approvals]);
    expect(sorted.map((item) => item.key)).toEqual(['approval-late', 'bpm-old', 'bpm-new', 'finance-request']);
    expect(sorted[0]!.wait?.text).toBe('已超时');
  });

  it('summarises the day in one line', () => {
    expect(summaryLine({ approvals: 2, business: 3, dingTalk: 1, longestWaitDays: 4, unread: 2 })).toBe(
      '今天有 6 项待处理，最久的已等待 4 天，2 条未读消息。',
    );
    expect(summaryLine({ approvals: 0, business: 0, dingTalk: 0, longestWaitDays: 0, unread: 0 })).toContain('没有待办');
  });

  it('groups work into approvals first, then departments with the most work', () => {
    const approvals = approvalItems(
      [{ id: 'a', openedAt: new Date(hoursAgo(2)).toISOString(), overdue: false, title: '合同评审' }] as ApprovalTask[],
      NOW,
    );
    const finance = portalItems('finance', {
      todos: [{ count: 35, key: 'receipt', preview: '' }],
    } as unknown as PortalSummary);
    const trade = portalItems('trade', {
      todos: [{ count: 2, key: 'receipt', preview: '' }],
    } as unknown as PortalSummary);
    const sections = groupWork([...trade, ...finance, ...approvals], 5);
    expect(sections.map((section) => section.key)).toEqual(['approval', 'finance', 'trade']);
    expect(sections[0]!.total).toBe(5);
    expect(sections[1]!.total).toBe(35);
    expect(sections[1]!.link?.path).toBe('/caiwu/platform-portal');
  });
});
