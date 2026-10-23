import { describe, expect, it } from 'vitest';

import { stageTaskPlan } from './schedule';

describe('stageTaskPlan', () => {
  const choice = {
    boards: 12,
    boardSpec: '板材 210×136×4.8cm · TPE · 配方 REC-001',
    name: '单色TPE瑜伽垫',
    remaining: 180,
    sheets: 96,
    sheetSpec: '片材 210×136×0.6cm · TPE',
    spec: '183*61*0.6cm · TPE',
  };

  it('mixing makes boards and slicing makes sheets, not the finished product', () => {
    expect(stageTaskPlan('MIX', choice)).toEqual({
      hint: '订单还要做 180 条成品，按用料逆推要 12 张板',
      kind: 'board',
      spec: '板材 210×136×4.8cm · TPE · 配方 REC-001',
      suggested: 12,
    });
    expect(stageTaskPlan('SLICE', choice)).toMatchObject({ kind: 'sheet', spec: '片材 210×136×0.6cm · TPE', suggested: 96 });
    expect(stageTaskPlan('CUT', choice)).toMatchObject({ hint: '', kind: undefined, spec: '183*61*0.6cm · TPE', suggested: 180 });
  });

  it('says it is a board for the product when the board cannot be worked out', () => {
    const plan = stageTaskPlan('MIX', { name: '单色TPE瑜伽垫', spec: '183*61*0.6cm · TPE' });
    expect(plan.spec).toBe('板材（成品 183*61*0.6cm · TPE）');
    expect(plan.suggested).toBeNull();
    expect(plan.hint).toContain('密炼做的是板材，不是成品');
  });
});
