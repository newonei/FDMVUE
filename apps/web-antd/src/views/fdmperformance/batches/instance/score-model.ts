import type { JixiaoApi } from '#/api/fdmperformance';

export interface ScoreRow {
  indicator: JixiaoApi.InstanceIndicator;
  managerComment?: string;
  managerScore?: null | number;
  selfComment?: string;
  selfScore?: null | number;
  supervisorComment?: string;
  supervisorScore?: null | number;
}
const SCORE_STAGES = {
  JIXIAO_SELF_SCORE: {
    action: 'SELF_SCORE',
    score: 'selfScore',
    comment: 'selfComment',
  },
  JIXIAO_SUPERVISOR_SCORE: {
    action: 'SUPERVISOR_SCORE',
    score: 'supervisorScore',
    comment: 'supervisorComment',
  },
  JIXIAO_MANAGER_SCORE: {
    action: 'MANAGER_SCORE',
    score: 'managerScore',
    comment: 'managerComment',
  },
} as const;

export function activeScoreStage(instance?: JixiaoApi.Instance) {
  if (
    !instance?.currentTaskId ||
    !instance.currentTaskKey ||
    instance.status !== 1
  )
    return;
  const stage =
    SCORE_STAGES[instance.currentTaskKey as keyof typeof SCORE_STAGES];
  return stage && instance.allowedActions?.includes(stage.action)
    ? stage
    : undefined;
}

export function scoreDraftPayload(
  instance: JixiaoApi.Instance,
  rows: ScoreRow[],
  reason = '',
): JixiaoApi.ScoreDraft | undefined {
  const stage = activeScoreStage(instance);
  if (!stage || !instance.id || !instance.currentTaskId) return;
  return {
    instanceId: instance.id,
    taskId: instance.currentTaskId,
    items: rows
      .filter((row) => row.indicator.id !== undefined)
      .map((row) => ({
        instanceIndicatorId: row.indicator.id!,
        score: row[stage.score] ?? undefined,
        comment: row[stage.comment],
      })),
    reason: reason || undefined,
  };
}

/** A draft can hydrate only its own current task and only the currently editable stage. */
export function applyScoreDraft(
  instance: JixiaoApi.Instance,
  rows: ScoreRow[],
  draft?: JixiaoApi.ScoreDraft | null,
) {
  const stage = activeScoreStage(instance);
  if (
    !stage ||
    !draft ||
    draft.instanceId !== instance.id ||
    draft.taskId !== instance.currentTaskId
  )
    return false;
  for (const item of draft.items) {
    const row = rows.find(
      (value) => value.indicator.id === item.instanceIndicatorId,
    );
    if (!row) continue;
    row[stage.score] = item.score;
    row[stage.comment] = item.comment;
  }
  return true;
}

export function scoreRowsFromInstance(
  instance: JixiaoApi.Instance,
): ScoreRow[] {
  return (instance.indicators || []).map((indicator) => {
    const score = (type: string) =>
      instance.scores?.find(
        (item) =>
          item.instanceIndicatorId === indicator.id && item.scoreType === type,
      );
    return {
      indicator,
      selfScore: score('SELF')?.score,
      selfComment: score('SELF')?.comment,
      supervisorScore: score('SUPERVISOR')?.score,
      supervisorComment: score('SUPERVISOR')?.comment,
      managerScore: score('MANAGER')?.score,
      managerComment: score('MANAGER')?.comment,
    };
  });
}
