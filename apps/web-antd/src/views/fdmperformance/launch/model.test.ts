import { describe, expect, it } from 'vitest';
import {
  createLaunchAttempt,
  defaultPeriodKey,
  personIssue,
  validateLaunchFields,
  validateSelection,
} from './model';

const fields = {
  templateId: 1,
  name: '月度考核',
  periodKey: '2026-09',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
};
const persons = [
  {
    userId: 3,
    supervisorUserId: 9,
    superiorSupervisorUserId: 12,
    userName: '员工甲',
  },
  { userId: 4, supervisorUserId: 9, userName: '员工乙' },
];

describe('发起校验与重试', () => {
  it('拒绝空人员和授权范围外人员，允许授权子集', () => {
    expect(validateSelection(persons, [])).toHaveLength(1);
    expect(validateSelection(persons, [99])).toHaveLength(1);
    expect(validateSelection(persons, [3, 3])).toHaveLength(1);
    expect(validateSelection(persons, [4])).toEqual([]);
  });
  it('缺主管及重复评分人被阻断，上级未启用合法', () => {
    expect(personIssue({ userId: 3 })).toBe('缺少主管评分人');
    expect(personIssue({ userId: 3, supervisorUserId: 3 })).not.toBe('');
    expect(
      personIssue({
        userId: 3,
        supervisorUserId: 9,
        superiorSupervisorUserId: 9,
      }),
    ).not.toBe('');
    expect(personIssue(persons[1]!)).toBe('');
  });
  it('校验日期真实存在且截止不早于开始', () => {
    expect(validateLaunchFields(fields)).toEqual([]);
    expect(validateLaunchFields({ ...fields, endDate: '' })).toHaveLength(1);
    expect(
      validateLaunchFields({ ...fields, startDate: '2026-02-30' }),
    ).toHaveLength(1);
    expect(validateLaunchFields({ ...fields, endDate: '2026-08-31' })).toEqual([
      '截止日期不能早于开始日期',
    ]);
  });
  it('相同请求网络重试复用键，改变人员或周期生成新键', () => {
    let id = 0;
    const attempt = createLaunchAttempt(() => `attempt-${++id}`);
    const first = attempt.request({ ...fields, userIds: [4, 3] });
    expect(attempt.request({ ...fields, userIds: [3, 4] }).idempotencyKey).toBe(
      first.idempotencyKey,
    );
    expect(
      attempt.request({ ...fields, userIds: [4] }).idempotencyKey,
    ).not.toBe(first.idempotencyKey);
    expect(
      attempt.request({ ...fields, periodKey: '2026-10', userIds: [4] })
        .idempotencyKey,
    ).toBe('attempt-3');
  });
  it('周期默认值沿用月、季、半年、年和试用期格式', () => {
    const now = new Date(2026, 8, 18);
    expect(
      ['MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR', 'PROBATION'].map((type) =>
        defaultPeriodKey(type, now),
      ),
    ).toEqual(['2026-09', '2026-Q3', '2026-H2', '2026', '2026-09-PROBATION']);
  });
});
