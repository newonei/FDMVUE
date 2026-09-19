import { describe, expect, it } from 'vitest';
import {
  activeScoreStage,
  applyScoreDraft,
  scoreDraftPayload,
  scoreRowsFromInstance,
} from './score-model';
import type { JixiaoApi } from '#/api/fdmperformance';

const instance: JixiaoApi.Instance = {
  id: 1,
  status: 1,
  currentTaskId: 'current',
  currentTaskKey: 'JIXIAO_MANAGER_SCORE',
  allowedActions: ['MANAGER_SCORE', 'SAVE_SCORE_DRAFT'],
  indicators: [{ id: 11, name: '交付' }],
  scores: [{ instanceIndicatorId: 11, scoreType: 'SELF', score: 80 }],
};
describe('评分草稿隔离', () => {
  it('缺动作、已结束或缺任务时不返回编辑阶段', () => {
    expect(
      activeScoreStage({ ...instance, allowedActions: [] }),
    ).toBeUndefined();
    expect(activeScoreStage({ ...instance, status: 2 })).toBeUndefined();
    expect(
      activeScoreStage({ ...instance, currentTaskId: undefined }),
    ).toBeUndefined();
  });
  it('旧任务或其他实例草稿不能覆盖当前评分', () => {
    const rows = scoreRowsFromInstance(instance);
    for (const data of [
      { instanceId: 1, taskId: 'old' },
      { instanceId: 2, taskId: 'current' },
    ]) {
      expect(
        applyScoreDraft(instance, rows, {
          ...data,
          items: [{ instanceIndicatorId: 11, score: 99 }],
        }),
      ).toBe(false);
    }
    expect(rows[0]!.managerScore).toBeUndefined();
  });
  it('只恢复当前评分字段，不修改自评分，不接纳其他指标', () => {
    const rows = scoreRowsFromInstance(instance);
    applyScoreDraft(instance, rows, {
      instanceId: 1,
      taskId: 'current',
      items: [
        { instanceIndicatorId: 11, score: 0 },
        { instanceIndicatorId: 99, score: 100 },
      ],
    });
    expect(rows[0]!.selfScore).toBe(80);
    expect(rows[0]!.managerScore).toBe(0);
    expect(scoreDraftPayload(instance, rows)!.items).toEqual([
      { instanceIndicatorId: 11, score: 0, comment: undefined },
    ]);
  });
});
