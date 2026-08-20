import type { WorkflowAutosaveStatus } from './use-workflow-autosave';

import { describe, expect, it } from 'vitest';

import { workflowSaveBlockedFeedback } from './workflow-save-feedback';

describe('workflow save feedback', () => {
  it.each([
    ['CONFLICT', undefined, undefined],
    [
      'ERROR',
      'error',
      '画布自动保存失败，暂时无法发布任务。请点击“保存草稿”重试。',
    ],
    [
      'OFFLINE',
      'warning',
      '当前网络不可用，画布自动保存未完成，暂时无法发布任务。请恢复网络后重试。',
    ],
    ['RETRYING', 'warning', '画布正在重试保存，请稍候再发布任务。'],
    ['SAVING', 'warning', '画布正在保存，请稍候再发布任务。'],
    ['DIRTY', 'warning', '画布正在自动保存，请稍候再发布任务。'],
    ['IDLE', undefined, undefined],
    ['SAVED', undefined, undefined],
  ] satisfies Array<
    [
      WorkflowAutosaveStatus,
      'error' | 'warning' | undefined,
      string | undefined,
    ]
  >)(
    'explains how to recover from a %s autosave state',
    (status, level, message) => {
      if (level === undefined || message === undefined) {
        expect(workflowSaveBlockedFeedback(status, '发布任务')).toBeUndefined();
        return;
      }
      expect(workflowSaveBlockedFeedback(status, '发布任务')).toEqual({
        level,
        message,
      });
    },
  );

  it('turns the known hash mismatch into a safe refresh instruction', () => {
    expect(
      workflowSaveBlockedFeedback('ERROR', '发布任务', {
        code: 1_013_000_010,
        msg: '画布定义无效：definitionHash 与规范化后的画布定义不一致',
      }),
    ).toEqual({
      level: 'error',
      message:
        '画布自动保存失败：当前页面的画布格式与服务端不兼容，暂时无法发布任务。请刷新页面以加载最新版本后重试。',
    });
  });

  it('finds the known hash mismatch in an Axios-shaped error envelope', () => {
    expect(
      workflowSaveBlockedFeedback('ERROR', '发布任务', {
        code: 'ERR_BAD_REQUEST',
        message: 'Request failed',
        response: {
          data: {
            code: 1_013_000_010,
            msg: '画布定义无效：definitionHash 与规范化后的画布定义不一致',
          },
        },
      }),
    ).toEqual({
      level: 'error',
      message:
        '画布自动保存失败：当前页面的画布格式与服务端不兼容，暂时无法发布任务。请刷新页面以加载最新版本后重试。',
    });
  });

  it('keeps unrecognized server text out of the user-facing feedback', () => {
    expect(
      workflowSaveBlockedFeedback('ERROR', '发布任务', {
        code: 1_013_000_010,
        msg: '<script>untrusted</script>',
      }),
    ).toEqual({
      level: 'error',
      message:
        '画布自动保存失败：画布定义无效，暂时无法发布任务。请检查节点和连线后重试。',
    });
  });

  it('does not point a manual-save click back to the same button', () => {
    expect(
      workflowSaveBlockedFeedback(
        'ERROR',
        '保存草稿',
        undefined,
        'manual-save',
      ),
    ).toEqual({
      level: 'error',
      message: '保存草稿失败。请检查网络或保存失败原因后重试。',
    });
    expect(
      workflowSaveBlockedFeedback(
        'SAVED',
        '保存草稿',
        undefined,
        'manual-save',
      ),
    ).toBeUndefined();
  });
});
