import type { DocumentApprovalView } from '#/api/fdmplatform/document-approval';

import { describe, expect, it } from 'vitest';

import {
  nodeModeLabel,
  overallLabel,
  progressText,
  recordLabel,
  remarkProblem,
  waitedText,
} from './document-approval';

function view(overrides: Partial<DocumentApprovalView> = {}) {
  return {
    canAction: false,
    nodes: [
      {
        actionType: 'NONE',
        index: 1,
        state: 'AGREE',
        users: [{ name: '张辉', state: 'AGREE', userId: 1 }],
      },
      {
        actionType: 'AND',
        index: 2,
        state: 'RUNNING',
        users: [
          { name: '陈娜', state: 'RUNNING', userId: 2 },
          { name: '张珍珍', state: 'WAITING', userId: 3 },
        ],
      },
    ],
    originator: { name: '张迁', userId: 9 },
    records: [],
    state: 'RUNNING',
    status: 'RUNNING',
    ...overrides,
  } as DocumentApprovalView;
}

describe('document approval panel', () => {
  it('counts passed nodes like 金智 0/3', () => {
    expect(progressText(view())).toBe('1/2');
  });

  it('labels the overall state from FDM record first, then DingTalk', () => {
    expect(overallLabel(view())).toBe('审批中');
    expect(overallLabel(view({ state: 'AGREED', status: 'AGREED' }))).toBe(
      '已通过',
    );
    expect(overallLabel(view({ status: 'CANCELLED' }))).toBe('已撤回');
    expect(
      overallLabel(view({ lastError: '网络错误', status: 'STARTING' })),
    ).toBe('发起失败，系统重试中');
  });

  it('shows 会签 or 或签 only for multi-person nodes', () => {
    const [single, multiple] = view().nodes;
    expect(nodeModeLabel(single!)).toBe('');
    expect(nodeModeLabel(multiple!)).toBe('会签');
    expect(nodeModeLabel({ ...multiple!, actionType: 'OR' })).toBe('或签');
  });

  it('requires a reason only when refusing', () => {
    expect(remarkProblem(true, '')).toBe('');
    expect(remarkProblem(false, '  ')).toBe('拒绝时请填写原因');
    expect(remarkProblem(false, '价格偏高')).toBe('');
  });

  it('formats waiting time and record types', () => {
    expect(waitedText(0, 1000)).toBe('');
    expect(waitedText(0 + 1, 1 + 5 * 60_000)).toBe('已等待 5 分钟');
    expect(waitedText(1, 1 + 26 * 3_600_000)).toBe('已等待 1 天 2 小时');
    expect(recordLabel('EXECUTE_TASK_NORMAL', 'AGREE')).toBe('同意');
    expect(recordLabel('START_PROCESS_INSTANCE', 'NONE')).toBe('发起审批');
  });
});
