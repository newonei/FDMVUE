import type { JixiaoApi } from '#/api/fdmperformance';

/** 与后端 JixiaoScoreWeights.MAX_MANAGER_LEVELS 保持一致。 */
export const MAX_MANAGER_LEVELS = 5;

/** 未配置比重的考评表沿用的默认值：自评 50、主管 40、一级上级 10。 */
export function defaultScoreWeights(): JixiaoApi.ScoreWeights {
  return { managerWeights: [10], selfWeight: 50, supervisorWeight: 40 };
}

export function scoreWeightsTotal(weights: JixiaoApi.ScoreWeights) {
  return [
    weights.selfWeight,
    weights.supervisorWeight,
    ...weights.managerWeights,
  ].reduce((sum, weight) => sum + Number(weight || 0), 0);
}

export function scoreWeightsError(weights: JixiaoApi.ScoreWeights) {
  const all = [
    weights.selfWeight,
    weights.supervisorWeight,
    ...weights.managerWeights,
  ];
  if (all.some((weight) => weight === null || weight === undefined)) {
    return '请填写每个评分人的比重';
  }
  if (all.some((weight) => Number(weight) < 0)) {
    return '比重不能为负数';
  }
  // 比重最多两位小数，按分比较避免浮点误差。
  if (Math.round(scoreWeightsTotal(weights) * 100) !== 10_000) {
    return `比重合计须为 100%，当前为 ${formatWeight(scoreWeightsTotal(weights))}%`;
  }
  return undefined;
}

/** 被考核人只有 managerCount 级上级时实际采用的比重：缺少层级的比重并入主管。 */
export function effectiveScoreWeights(
  weights: JixiaoApi.ScoreWeights,
  managerCount: number,
): JixiaoApi.ScoreWeights {
  const levels = Math.min(
    Math.max(managerCount, 0),
    weights.managerWeights.length,
  );
  const moved = weights.managerWeights
    .slice(levels)
    .reduce((sum, weight) => sum + Number(weight || 0), 0);
  return {
    managerWeights: weights.managerWeights.slice(0, levels),
    selfWeight: weights.selfWeight,
    supervisorWeight: Number(weights.supervisorWeight || 0) + moved,
  };
}

export function formatWeight(weight?: number) {
  const value = Number(weight || 0);
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

export function managerLevelLabel(level: number) {
  return `第${level}级上级`;
}

export function scoreWeightsText(weights?: JixiaoApi.ScoreWeights) {
  const value = weights ?? defaultScoreWeights();
  return [
    `自评 ${formatWeight(value.selfWeight)}%`,
    `主管 ${formatWeight(value.supervisorWeight)}%`,
    ...value.managerWeights.map(
      (weight, index) => `${managerLevelLabel(index + 1)} ${formatWeight(weight)}%`,
    ),
  ].join(' · ');
}

/** 各级上级，兼容只返回单个上级的旧数据。 */
export function personManagerUserIds(person: {
  managerUserIds?: number[];
  superiorSupervisorUserId?: number;
}) {
  if (person.managerUserIds?.length) return person.managerUserIds;
  return person.superiorSupervisorUserId ? [person.superiorSupervisorUserId] : [];
}

export function personManagerNames(person: {
  managerUserNames?: string[];
  superiorSupervisorUserName?: string;
}) {
  if (person.managerUserNames?.length) return person.managerUserNames;
  return person.superiorSupervisorUserName ? [person.superiorSupervisorUserName] : [];
}
