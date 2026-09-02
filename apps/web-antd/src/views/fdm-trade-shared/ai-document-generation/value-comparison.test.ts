import { describe, expect, it } from 'vitest';

import {
  aiFieldValueEquals,
  displayAiFieldValue,
  isAiFieldDraftChanged,
} from './value-comparison';

describe('aI 字段三方差异', () => {
  it('区分 AI 原建议与当前人工草稿', () => {
    expect(
      isAiFieldDraftChanged({
        currentValue: '人工交期',
        fieldKey: 'requiredDate',
        label: '要求交期',
        origin: 'HUMAN_EDIT',
        originalOrigin: 'AI_INFERRED',
        proposedValue: 'AI 交期',
        sourceValue: '合同交期',
      }),
    ).toBe(true);
  });

  it('结构相同的复杂值不被误报为人工修改', () => {
    expect(aiFieldValueEquals({ quantity: '10' }, { quantity: '10' })).toBe(
      true,
    );
  });

  it('空值和复杂值都能得到明确展示文案', () => {
    expect(displayAiFieldValue(undefined)).toBe('未提供');
    expect(displayAiFieldValue({ currency: 'USD' })).toBe('{"currency":"USD"}');
  });
});
