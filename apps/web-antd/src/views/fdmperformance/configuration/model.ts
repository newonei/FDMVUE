import type { JixiaoApi } from '#/api/fdmperformance';

export function validateRelations(
  rows: Partial<JixiaoApi.ManagementRelation>[],
) {
  const seen = new Set<number>();
  for (const [index, row] of rows.entries()) {
    if (!row.supervisorUserId) return `第 ${index + 1} 行请选择发起人`;
    if (seen.has(row.supervisorUserId))
      return `第 ${index + 1} 行的发起人重复，请合并人员范围`;
    if (row.supervisorUserId === row.managerUserId)
      return `第 ${index + 1} 行的发起人和分管经理不能相同`;
    if (row.userIds?.includes(row.supervisorUserId))
      return `第 ${index + 1} 行不能将发起人本人加入考核范围`;
    seen.add(row.supervisorUserId);
  }
  return '';
}
