import { describe, expect, it } from 'vitest';

import {
  draftFrom,
  draftProblem,
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
    const item = (code: string, name = '名称') => ({
      code,
      name,
      severity: 'INFO' as const,
      enabled: true,
    });
    expect(draftProblem({ items: [item('OK_1')], departmentNotes: {} })).toBe(
      '',
    );
    expect(
      draftProblem({ items: [item('1X')], departmentNotes: {} }),
    ).toContain('大写字母开头');
    expect(
      draftProblem({ items: [item('dup'), item('DUP')], departmentNotes: {} }),
    ).toContain('重复');
    expect(
      draftProblem({ items: [item('NO_NAME', ' ')], departmentNotes: {} }),
    ).toContain('名称');
  });

  it('normalizes codes and drops blank notes', () => {
    expect(
      normalizeDraft({
        items: [
          {
            code: ' price_high ',
            name: ' 单价 ',
            severity: 'HIGH',
            description: ' ',
            enabled: false,
          },
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
        },
      ],
      departmentNotes: { FINANCE: '发票' },
      notes: undefined,
    });
  });

  it('picks an unused code for a new item', () => {
    expect(
      newItem([{ code: 'CUSTOM_2', name: '', severity: 'INFO', enabled: true }])
        .code,
    ).toBe('CUSTOM_3');
    expect(newItem([]).code).toBe('CUSTOM_1');
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
