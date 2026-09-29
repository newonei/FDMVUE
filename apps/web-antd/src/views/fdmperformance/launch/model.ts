import type { JixiaoApi } from '#/api/fdmperformance';

export function buildPeriodOptions(periodType?: string, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (periodType === 'YEAR')
    return Array.from({ length: 6 }, (_, index) => {
      const value = String(year + index - 1);
      return { label: `${value} 年度`, value };
    });
  const unit =
    periodType === 'QUARTER' ? 3 : periodType === 'HALF_YEAR' ? 6 : 1;
  if (
    !['MONTH', 'QUARTER', 'HALF_YEAR', 'PROBATION'].includes(periodType || '')
  )
    return [];
  return Array.from({ length: 15 }, (_, index) => {
    const date = new Date(
      year,
      Math.floor(month / unit) * unit + (index - 2) * unit,
      1,
    );
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const value =
      periodType === 'QUARTER'
        ? `${y}-Q${Math.ceil(m / 3)}`
        : periodType === 'HALF_YEAR'
          ? `${y}-H${Math.ceil(m / 6)}`
          : `${y}-${String(m).padStart(2, '0')}${periodType === 'PROBATION' ? '-PROBATION' : ''}`;
    return { label: value, value };
  });
}
export function defaultPeriodKey(periodType?: string, now = new Date()) {
  return (
    buildPeriodOptions(periodType, now)[periodType === 'YEAR' ? 1 : 2]?.value ||
    ''
  );
}
function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function validateLaunchFields(form: {
  items: Array<Partial<JixiaoApi.LaunchBatchItem> & { templateName?: string }>;
  startDate?: string;
}) {
  const errors: string[] = [];
  if (!form.items.length) errors.push('请先选择考评表');
  for (const item of form.items) {
    const prefix = form.items.length > 1 ? `「${item.templateName}」` : '';
    if (!item.periodKey?.trim()) errors.push(`${prefix}请选择考核周期`);
    if (!item.name?.trim()) errors.push(`${prefix}请填写考核名称`);
  }
  if (!validDate(form.startDate)) errors.push('请选择有效的开始日期');
  return errors;
}
export function personIssue(person: JixiaoApi.TemplatePerson) {
  if (!person.userId || person.userId <= 0) return '缺少被考核人';
  if (!person.supervisorUserId || person.supervisorUserId <= 0)
    return '缺少主管评分人';
  if (person.supervisorUserId === person.userId) return '不能给本人主管评分';
  if (
    person.superiorSupervisorUserId &&
    [person.userId, person.supervisorUserId].includes(
      person.superiorSupervisorUserId,
    )
  )
    return '上级评分人与其他角色重复';
  return '';
}
export function validateSelection(
  persons: JixiaoApi.TemplatePerson[],
  userIds: number[],
) {
  if (!userIds.length) return ['请至少选择一名被考核人'];
  if (new Set(userIds).size !== userIds.length)
    return ['选择的考核人员存在重复'];
  const errors: string[] = [];
  for (const id of userIds) {
    const person = persons.find((item) => item.userId === id);
    if (!person) errors.push('所选人员已不在授权范围内，请返回重新选择');
    else if (personIssue(person))
      errors.push(`${person.userName || '所选人员'}：${personIssue(person)}`);
  }
  return errors;
}
/**
 * Retry an uncertain request with each template's original key; editing a
 * template's launch (or the shared fields) gives that template a new attempt.
 */
export function createLaunchAttempt(
  createKey: () => string = () =>
    globalThis.crypto?.randomUUID?.() ||
    `jixiao-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
) {
  const attempts = new Map<number, { fingerprint: string; key: string }>();
  return {
    request(payload: JixiaoApi.LaunchBatchReq): JixiaoApi.LaunchBatchReq {
      const { items, ...shared } = payload;
      return {
        ...shared,
        items: items.map((item) => {
          const normalized = {
            ...item,
            userIds: [...(item.userIds || [])].sort((a, b) => a - b),
          };
          const fingerprint = JSON.stringify({ ...shared, ...normalized });
          let attempt = attempts.get(item.templateId);
          if (attempt?.fingerprint !== fingerprint) {
            attempt = { fingerprint, key: createKey() };
            attempts.set(item.templateId, attempt);
          }
          return { ...normalized, idempotencyKey: attempt.key };
        }),
      };
    },
  };
}
