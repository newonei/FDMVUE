import { describe, expect, it } from 'vitest';

import {
  applyGroup,
  draftFrom,
  draftProblem,
  groupItems,
  manyFalsePositives,
  newItem,
  normalizeDraft,
  versionLabel,
} from './model';

describe('aI 单据检查配置', () => {
  it('copies the prompt so editing does not touch the source', () => {
    const prompt = {
      promptId: 3,
      versionNo: 2,
      items: [
        {
          code: 'A_B',
          name: '条款',
          severity: 'WARNING' as const,
          enabled: true,
        },
      ],
      departmentNotes: { TRADE: '信用证' },
      notes: '样品单零价',
    };
    const draft = draftFrom(prompt);
    draft.items[0]!.name = '改了';
    draft.departmentNotes.TRADE = '改了';
    expect(prompt.items[0]!.name).toBe('条款');
    expect(prompt.departmentNotes.TRADE).toBe('信用证');
    expect(draftFrom(undefined)).toEqual({
      items: [],
      departmentNotes: {},
      notes: '',
    });
  });

  it('finds the first problem before saving', () => {
    const item = (name = '名称') => ({
      name,
      severity: 'INFO' as const,
      enabled: true,
    });
    expect(draftProblem({ items: [item()], departmentNotes: {} })).toBe('');
    expect(
      draftProblem({ items: [item('a'), item(' ')], departmentNotes: {} }),
    ).toContain('第 2 个');
    expect(
      draftProblem({
        items: [item('同名'), item(' 同名 ')],
        departmentNotes: {},
      }),
    ).toContain('重名');
  });

  it('trims fields and leaves new codes for the server', () => {
    expect(
      normalizeDraft({
        items: [
          {
            code: ' price_high ',
            name: ' 单价 ',
            severity: 'HIGH',
            description: ' ',
            enabled: false,
            failWhen: ' 高 20% ',
            warnWhen: '',
            group: ' 价格 ',
          },
          newItem('附件'),
        ],
        departmentNotes: { TRADE: '  ', FINANCE: ' 发票 ' },
        notes: '  ',
      }),
    ).toEqual({
      items: [
        {
          code: 'PRICE_HIGH',
          name: '单价',
          severity: 'HIGH',
          description: undefined,
          enabled: false,
          failWhen: '高 20%',
          warnWhen: undefined,
          group: '价格',
        },
        {
          code: undefined,
          name: '',
          severity: 'WARNING',
          description: undefined,
          enabled: true,
          failWhen: undefined,
          warnWhen: undefined,
          group: '附件',
        },
      ],
      departmentNotes: { FINANCE: '发票' },
      notes: undefined,
    });
  });

  it('groups items and keeps ungrouped last', () => {
    const item = (name: string, group?: string) => ({
      name,
      group,
      severity: 'INFO' as const,
      enabled: true,
    });
    const groups = groupItems([
      item('a'),
      item('b', '价格'),
      item('c', '附件'),
      item('d', '价格'),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['价格', '附件', '未分组']);
    expect(groups[0]!.rows.map((r) => r.index)).toEqual([1, 3]);
  });

  it('flags items with many false positives', () => {
    const stats = (fail: number, warn: number, falsePositive: number) => ({
      total: 10,
      pass: 0,
      fail,
      warn,
      notApplicable: 0,
      unknown: 0,
      falsePositive,
    });
    expect(manyFalsePositives(stats(4, 2, 3))).toBe(true);
    expect(manyFalsePositives(stats(10, 0, 2))).toBe(false);
    expect(manyFalsePositives(stats(0, 0, 1))).toBe(false);
    expect(manyFalsePositives(undefined)).toBe(false);
  });

  it('labels versions', () => {
    expect(versionLabel({ promptId: 0, items: [], departmentNotes: {} })).toBe(
      '出厂默认',
    );
    expect(
      versionLabel({
        promptId: 5,
        versionNo: 4,
        items: [],
        departmentNotes: {},
      }),
    ).toBe('第 4 版');
  });
});

describe('applyGroup', () => {
  const make = () =>
    ['单价', '数量', '附件', '交期'].map((name, i) => ({
      ...newItem(i === 3 ? '交期' : undefined),
      name,
    }));

  it('moves selected items into a new group', () => {
    const items = make();
    expect(applyGroup(items, null, ' 价格 ', new Set([0, 1]))).toBe('');
    expect(items.map((i) => i.group)).toEqual(['价格', '价格', '', '交期']);
  });

  it('renames a group and returns unselected members to ungrouped', () => {
    const items = make();
    applyGroup(items, null, '价格', new Set([0, 1]));
    expect(applyGroup(items, '价格', '金额', new Set([0]))).toBe('');
    expect(items.map((i) => i.group)).toEqual(['金额', '', '', '交期']);
  });

  it('rejects empty or reserved names', () => {
    expect(applyGroup(make(), null, ' ', new Set([0]))).not.toBe('');
    expect(applyGroup(make(), null, '未分组', new Set([0]))).not.toBe('');
  });
});
