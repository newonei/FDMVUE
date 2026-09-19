import { describe, expect, it } from 'vitest';
import { validateRelations } from './model';

describe('performance management relation editor', () => {
  it('rejects missing, duplicate and self-supervising assignments before replacing configuration', () => {
    expect(validateRelations([{ userIds: [2] }])).toContain('请选择发起人');
    expect(
      validateRelations([
        { supervisorUserId: 1, userIds: [2] },
        { supervisorUserId: 1, userIds: [3] },
      ]),
    ).toContain('重复');
    expect(
      validateRelations([{ supervisorUserId: 1, managerUserId: 1 }]),
    ).toContain('不能相同');
    expect(
      validateRelations([{ supervisorUserId: 1, userIds: [1] }]),
    ).toContain('本人');
  });
  it('supports separate launch authority for managers and unassigned supervisors', () => {
    expect(
      validateRelations([
        { supervisorUserId: 10, managerUserId: 20, userIds: [30] },
        { supervisorUserId: 20, userIds: [10, 30] },
      ]),
    ).toBe('');
    expect(validateRelations([])).toBe('');
  });
});
