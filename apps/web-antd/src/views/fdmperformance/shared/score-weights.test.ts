import { describe, expect, it } from 'vitest';

import {
  defaultScoreWeights,
  effectiveScoreWeights,
  formatWeight,
  scoreWeightsError,
} from './score-weights';

describe('评分比重', () => {
  it('默认 50/40/10，无上级时等同 50/50', () => {
    expect(effectiveScoreWeights(defaultScoreWeights(), 0)).toEqual({
      managerWeights: [],
      selfWeight: 50,
      supervisorWeight: 50,
    });
  });

  it('缺少的上级层级比重并入主管', () => {
    const weights = { managerWeights: [20, 10], selfWeight: 40, supervisorWeight: 30 };
    expect(effectiveScoreWeights(weights, 1)).toEqual({
      managerWeights: [20],
      selfWeight: 40,
      supervisorWeight: 40,
    });
    expect(effectiveScoreWeights(weights, 2)).toEqual(weights);
  });

  it('合计须为 100 且不能为负', () => {
    expect(scoreWeightsError(defaultScoreWeights())).toBeUndefined();
    expect(
      scoreWeightsError({ managerWeights: [], selfWeight: 50, supervisorWeight: 40 }),
    ).toContain('90');
    expect(
      scoreWeightsError({ managerWeights: [-10], selfWeight: 60, supervisorWeight: 50 }),
    ).toBe('比重不能为负数');
    expect(
      scoreWeightsError({ managerWeights: [33.33], selfWeight: 33.33, supervisorWeight: 33.34 }),
    ).toBeUndefined();
  });

  it('比重显示去掉多余小数', () => {
    expect(formatWeight(40)).toBe('40');
    expect(formatWeight(33.5)).toBe('33.5');
    expect(formatWeight(33.33)).toBe('33.33');
  });
});
