import { describe, expect, it } from 'vitest';

import { extractReport } from './report';

describe('real employee report extraction', () => {
  it('curates reusable fields and keeps unselected original text on the client', async () => {
    const input =
      '标题：退款口径\n场景：跨店复盘\n做法：核对退款周期\n例外：单独列示\n不用于共享的原始备注';
    const a = await extractReport('2026-11-22', input);
    const b = await extractReport('2026-11-22', input);
    expect(a).toEqual(b);
    expect(a.sourceKey).toMatch(/^report:[a-f\d]{64}$/);
    expect(a.fields).toEqual({
      title: '退款口径',
      scenario: '跨店复盘',
      method: '核对退款周期',
      exception: '单独列示',
      source: '2026-11-22 工作日报',
    });
    expect(JSON.stringify(a)).not.toContain('不用于共享');
    const nextDay = await extractReport('2026-11-23', input);
    expect(nextDay.sourceKey).not.toBe(a.sourceKey);
  });
  it('rejects blank reports and does not invent a method', async () => {
    await expect(extractReport('2026-11-22', '  ')).rejects.toThrow(
      '请选择日期并填写本人日报片段。',
    );
    const unstructured = await extractReport('2026-11-22', '今天发现库存差异');
    expect(unstructured.fields.method).toBe('');
  });
});
