import { describe, expect, it } from 'vitest';

import {
  canReviewVersion,
  displayValue,
  eventMessage,
  filterRequirements,
  formatFdmReqTime,
  getFdmReqStatusMeta,
  proposalSections,
  safeExternalUrl,
} from './status';

const requirement = {
  reqNo: 'REQ-01',
  title: '修复客户筛选',
  status: 'PENDING_CONFIRM',
  currentVersionId: 2,
};

describe('requirements center workflow', () => {
  it('only allows reviewing the exact current version while awaiting review', () => {
    expect(
      canReviewVersion(requirement, {
        id: 2,
        versionNo: 'v2',
        contentJson: '{"summary":"方案"}',
      }),
    ).toBe(true);
    expect(
      canReviewVersion(requirement, {
        id: 1,
        versionNo: 'v1',
        contentJson: '{}',
      }),
    ).toBe(false);
    expect(
      canReviewVersion(
        { ...requirement, status: 'APPROVED_PENDING_DEV' },
        { id: 2, versionNo: 'v2', contentJson: '{}' },
      ),
    ).toBe(false);
    expect(
      canReviewVersion(
        { ...requirement, currentVersionId: undefined },
        { id: 2, versionNo: 'v2', contentJson: '{}' },
      ),
    ).toBe(false);
    expect(canReviewVersion(requirement, undefined)).toBe(false);
    expect(
      canReviewVersion(requirement, {
        id: 2,
        versionNo: 'v2',
        contentJson: '{"automationEligible":false}',
      }),
    ).toBe(false);
  });

  it('formats milliseconds, timezone offsets and Java wall-clock dates consistently', () => {
    expect(formatFdmReqTime(Date.UTC(2026, 8, 18, 4, 34, 56))).toBe(
      '2026-09-18 12:34:56',
    );
    expect(formatFdmReqTime('2026-09-18T04:34:56Z')).toBe(
      '2026-09-18 12:34:56',
    );
    expect(formatFdmReqTime('2026-09-18T12:34:56')).toBe('2026-09-18 12:34:56');
    expect(formatFdmReqTime([2026, 9, 18, 12, 34, 56])).toBe(
      '2026-09-18 12:34:56',
    );
    expect(formatFdmReqTime('invalid')).toBe('—');
    expect(formatFdmReqTime(undefined)).toBe('—');
  });

  it('combines workflow groups, status and case-insensitive search', () => {
    const rows = [
      requirement,
      { ...requirement, reqNo: 'REQ-02', status: 'DEVELOPING' },
    ];
    expect(filterRequirements(rows, 'review', '客户')).toEqual([requirement]);
    expect(
      filterRequirements(rows, 'all', 'req-02', 'DEVELOPING'),
    ).toHaveLength(1);
    expect(filterRequirements(rows, 'queued', '')).toHaveLength(0);
    expect(filterRequirements(rows, 'all', '不存在')).toHaveLength(0);
  });

  it('renders legacy text and nested proposal formats without dropping fields', () => {
    expect(proposalSections('旧版文字方案')).toEqual([
      { title: '实现方案', body: '旧版文字方案' },
    ]);
    expect(
      proposalSections(
        '{"summary":"调整筛选","steps":["修改接口",{"description":"补充测试"}]}',
      ),
    ).toEqual([
      { title: '方案概述', body: '调整筛选' },
      { title: '实现步骤', body: '1. 修改接口\n2. 说明：补充测试' },
    ]);
    expect(proposalSections(undefined)).toEqual([]);
  });

  it('does not create executable or malformed delivery links', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeExternalUrl('data:text/html,test')).toBeUndefined();
    expect(safeExternalUrl('/relative')).toBeUndefined();
    expect(safeExternalUrl('https://github.com/owner/repo/pull/1')).toBe(
      'https://github.com/owner/repo/pull/1',
    );
  });

  it('reads feedback safely and distinguishes workflow stages', () => {
    expect(eventMessage({ payloadJson: '{"message":"请补充复现步骤"}' })).toBe(
      '请补充复现步骤',
    );
    expect(eventMessage({ payloadJson: '{"versionId":2}' })).toBe('');
    expect(getFdmReqStatusMeta('PENDING_CONFIRM').label).toBe('待审核');
    expect(getFdmReqStatusMeta('APPROVED_PENDING_DEV').label).toBe('待实现');
    expect(getFdmReqStatusMeta('PENDING_ACCEPTANCE').label).toBe('待验收');
    expect(displayValue(undefined)).toBe('无');
  });
});
