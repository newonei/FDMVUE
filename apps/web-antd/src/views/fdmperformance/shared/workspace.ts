import type { JixiaoApi } from '#/api/fdmperformance';

export const ROLE_LABELS: Record<JixiaoApi.Role, string> = {
  ADMIN: '管理员',
  EMPLOYEE: '员工',
  MANAGER: '经理',
  SUPERVISOR: '主管',
};
export const SCOPE_LABELS: Record<JixiaoApi.Scope, string> = {
  ALL: '全部考核',
  INITIATED: '我发起的',
  MANAGED: '分管主管发起',
  SELF: '本人考核',
  VISIBLE: '当前可见范围',
};
const TASK_ACTIONS: [JixiaoApi.AllowedAction, string][] = [
  ['INDICATOR_CONFIRM', '确认指标'],
  ['SELF_SCORE', '填写自评'],
  ['SUPERVISOR_SCORE', '去评分'],
  ['MANAGER_SCORE', '去评分'],
  ['EMPLOYEE_CONFIRM', '确认结果'],
  ['HR_REVIEW', '审核考核'],
];

export function actionLabel(
  instance: Pick<JixiaoApi.Instance, 'allowedActions'>,
) {
  return (
    TASK_ACTIONS.find(([action]) =>
      instance.allowedActions?.includes(action),
    )?.[1] || '查看'
  );
}

export function managementScopes(access?: JixiaoApi.Access) {
  return (access?.availableScopes || []).filter((scope) =>
    ['ALL', 'INITIATED', 'MANAGED'].includes(scope),
  );
}

export function defaultManagementScope(
  access: JixiaoApi.Access,
): JixiaoApi.Scope {
  const scopes = managementScopes(access);
  return scopes.includes('INITIATED') ? 'INITIATED' : scopes[0] || 'SELF';
}

export function deadlineMeta(endDate?: string, now = new Date()) {
  if (!endDate)
    return { color: 'default', text: '未设截止日期', overdue: false };
  const date = new Date(`${endDate.slice(0, 10)}T23:59:59`);
  if (Number.isNaN(date.getTime()))
    return { color: 'default', text: endDate, overdue: false };
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  return {
    color: days <= 0 ? 'red' : days <= 3 ? 'orange' : 'default',
    text:
      days <= 0
        ? `已逾期 · ${endDate.slice(0, 10)}`
        : days <= 3
          ? `${days} 天内截止 · ${endDate.slice(0, 10)}`
          : endDate.slice(0, 10),
    overdue: days <= 0,
  };
}

export function hasAction(
  instance: JixiaoApi.Instance,
  action: JixiaoApi.AllowedAction,
) {
  return instance.allowedActions?.includes(action) === true;
}

export function canAcknowledgeAdjustment(result: JixiaoApi.Result) {
  return (
    !!result.id &&
    result.publicStatus === 1 &&
    result.employeeConfirmed === false
  );
}

export function visibilityLabel(reason?: string) {
  return reason ? SCOPE_LABELS[reason as JixiaoApi.Scope] || '已授权查看' : '';
}

export function canHandleReview(
  review: JixiaoApi.Review,
  action: 'SUBMIT' | 'CONFIRM' | 'REMIND' | 'DELETE',
) {
  return review.allowedActions?.includes(action) === true;
}
