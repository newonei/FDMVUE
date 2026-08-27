import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  executionFailureSummary,
  executionTaskSummary,
  formatNodeTaskConfig,
  nodeFailureDetail,
  nodeTaskSummary,
} from './execution-task-detail';

const failedNode: FdmCreativeApi.NodeRun = {
  errorCode: 'PROVIDER_RATE_LIMITED',
  errorMessage: '模型服务当前限流，请在 30 秒后再次尝试。',
  id: 21,
  inputJson: JSON.stringify({
    logicalModelId: 'image-pro',
    outputCount: 2,
    prompt: '在晨光下展示一只白色运动鞋的电商主图',
    width: 1024,
    height: 1024,
  }),
  nodeId: 'image-1',
  nodeType: 'TEXT_TO_IMAGE',
  status: 'FAILED',
};

describe('execution task detail', () => {
  it('keeps the detailed generated-node configuration available for the drawer', () => {
    expect(nodeTaskSummary(failedNode)).toContain(
      '提示词：在晨光下展示一只白色运动鞋的电商主图',
    );
    expect(nodeTaskSummary(failedNode)).toContain('模型：image-pro');
    expect(nodeTaskSummary(failedNode)).toContain('尺寸：1024 × 1024');
    expect(formatNodeTaskConfig(failedNode.inputJson)).toContain(
      '"outputCount": 2',
    );
  });

  it('preserves the code and full reason of every failed node', () => {
    expect(nodeFailureDetail(failedNode)).toEqual({
      code: 'PROVIDER_RATE_LIMITED',
      message: '模型服务当前限流，请在 30 秒后再次尝试。',
    });
    expect(
      executionFailureSummary({
        id: 8,
        nodeRuns: [failedNode],
        projectId: 3,
        status: 'FAILED',
      }),
    ).toContain('TEXT_TO_IMAGE · 模型服务当前限流，请在 30 秒后再次尝试。');
  });

  it('gives useful fallback text for malformed task JSON and absent diagnostics', () => {
    expect(formatNodeTaskConfig('{broken')).toBe('该节点没有额外执行参数。');
    expect(
      nodeFailureDetail({
        ...failedNode,
        errorCode: undefined,
        errorMessage: undefined,
      }),
    ).toEqual({
      code: 'NODE_EXECUTION_FAILED',
      message: '系统未返回详细失败原因。请核对任务参数和上游节点结果后重试。',
    });
  });

  it('summarizes the selected task scope and nodes in the list', () => {
    expect(
      executionTaskSummary({
        id: 8,
        nodeRuns: [failedNode],
        projectId: 3,
        scope: 'DOWNSTREAM',
        startNodeId: 'image-1',
        status: 'FAILED',
        totalNodeCount: 2,
      }),
    ).toBe(
      '从当前节点向下运行，起点：image-1；共 2 个节点；节点：TEXT_TO_IMAGE',
    );
  });
});
