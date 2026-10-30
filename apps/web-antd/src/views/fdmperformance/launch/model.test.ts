import { describe, expect, it } from 'vitest';
import {
  createLaunchAttempt,
  defaultPeriodKey,
  personIssue,
  validateLaunchFields,
  validateSelection,
} from './model';

const item = {
  templateId: 1,
  templateName: '运营月度',
  name: '月度考核',
  periodKey: '2026-09',
};
const fields = { startDate: '2026-09-01', items: [item] };
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
  it('只校验开始日期，不再要求截止日期', () => {
    expect(validateLaunchFields(fields)).toEqual([]);
    expect(validateLaunchFields({ ...fields, startDate: '' })).toEqual([
      '请选择有效的开始日期',
    ]);
    expect(
      validateLaunchFields({ ...fields, startDate: '2026-02-30' }),
    ).toHaveLength(1);
  });
  it('多张考评表逐张校验周期和名称并标明考评表', () => {
    expect(validateLaunchFields({ ...fields, items: [] })).toEqual([
      '请先选择考评表',
    ]);
    expect(
      validateLaunchFields({
        ...fields,
        items: [
          item,
          { ...item, templateId: 2, templateName: '财务季度', periodKey: '' },
        ],
      }),
    ).toEqual(['「财务季度」请选择考核周期']);
  });
  it('相同请求网络重试复用各表的键，只为改动的考评表生成新键', () => {
    let id = 0;
    const attempt = createLaunchAttempt(() => `attempt-${++id}`);
    const other = { templateId: 2, name: '财务季度', periodKey: '2026-Q3' };
    const request = (userIds: number[], remark = '') =>
      attempt.request({
        startDate: fields.startDate,
        remark,
        items: [
          { ...item, userIds },
          { ...other, userIds: [8] },
        ],
      }).items;
    const [first, second] = request([4, 3]);
    expect(first!.userIds).toEqual([3, 4]);
    expect(request([3, 4]).map((row) => row.idempotencyKey)).toEqual([
      first!.idempotencyKey,
      second!.idempotencyKey,
    ]);
    expect(request([4]).map((row) => row.idempotencyKey)).toEqual([
      'attempt-3',
      second!.idempotencyKey,
    ]);
    expect(request([4], '补充说明').map((row) => row.idempotencyKey)).toEqual([
      'attempt-4',
      'attempt-5',
    ]);
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
