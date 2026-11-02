import { describe, expect, it } from 'vitest';

import {
  aiStatusText,
  attachmentSummary,
  listTagVisible,
  needsReason,
  sortFindings,
} from './risk';

describe('aI 风险检查显示', () => {
  it('shows list tags only for levels that need attention', () => {
    expect(listTagVisible('HIGH')).toBe(true);
    expect(listTagVisible('WARNING')).toBe(true);
    expect(listTagVisible('INFO')).toBe(false);
    expect(listTagVisible('NONE')).toBe(false);
    expect(listTagVisible(undefined)).toBe(false);
  });

  it('puts open and severe findings first', () => {
    const finding = (
      id: number,
      severity: 'HIGH' | 'INFO' | 'WARNING',
      status: 'OPEN' | 'RESOLVED',
    ) => ({
      id,
      severity,
      status,
      source: 'AI' as const,
      message: '',
      evidenceIds: [],
    });
    const sorted = sortFindings([
      finding(1, 'INFO', 'OPEN'),
      finding(2, 'HIGH', 'RESOLVED'),
      finding(3, 'HIGH', 'OPEN'),
      finding(4, 'WARNING', 'OPEN'),
    ]);
    expect(sorted.map((f) => f.id)).toEqual([3, 4, 1, 2]);
  });

  it('explains why AI did not check and when a reason is required', () => {
    expect(aiStatusText('SUCCEEDED')).toBe('');
    expect(aiStatusText('NOT_CONFIGURED')).toContain('放行');
    expect(needsReason('FALSE_POSITIVE')).toBe(true);
    expect(needsReason('IGNORED')).toBe(true);
    expect(needsReason('RESOLVED')).toBe(false);
  });
});

describe('attachmentSummary', () => {
  it('sums up read files and lists the ones not fully read with reasons', () => {
    const summary = attachmentSummary([
      { name: '报价.xlsx', status: 'READ' },
      { name: '合同.docx', status: 'READ' },
      { name: '扫描.pdf', note: '图片太多，有 2 张没看', status: 'PARTIAL' },
      { name: '大表.xlsx', note: '文件超过 60MB，没有读取', status: 'SKIPPED' },
    ]);
    expect(summary.read).toBe('已读附件 2 个：报价.xlsx、合同.docx');
    expect(summary.others).toEqual([
      '只读了部分：扫描.pdf（图片太多，有 2 张没看）',
      '没读：大表.xlsx（文件超过 60MB，没有读取）',
    ]);
  });

  it('shows nothing when the document has no attachments', () => {
    expect(attachmentSummary(undefined)).toEqual({ others: [], read: '' });
    expect(attachmentSummary([])).toEqual({ others: [], read: '' });
  });
});
