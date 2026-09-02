import type { FdmProcurementSourcingApi } from '#/api/fdmprocurement/sourcing';

import { describe, expect, it } from 'vitest';

import {
  eligibilityPresentation,
  evidenceCompleteness,
  isCandidateSelectable,
  reasonText,
  scoreDimensions,
  scorePercent,
} from './candidate-presentation';

function candidate(
  overrides: Partial<FdmProcurementSourcingApi.Candidate> = {},
) {
  return {
    eligibilityStatus: 'ELIGIBLE',
    eliminationCodes: [],
    id: '90071992547409931',
    requisitionItemId: '90071992547409932',
    supplierId: '90071992547409933',
    supplierProductId: '90071992547409934',
    ...overrides,
  } as FdmProcurementSourcingApi.Candidate;
}

describe('sourcing candidate presentation', () => {
  it('never converts an absent score into zero', () => {
    expect(scorePercent(null)).toBeUndefined();
    expect(scorePercent(undefined)).toBeUndefined();
    expect(scorePercent('not-a-score')).toBeUndefined();
    expect(scorePercent('-0.01')).toBeUndefined();
    expect(scorePercent('100.01')).toBeUndefined();
    expect(scorePercent('0')).toBe(0);
    expect(scorePercent('100')).toBe(100);
    expect(scoreDimensions(candidate({ totalScore: null }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '成本', value: undefined }),
      ]),
    );
  });

  it('distinguishes all four statuses and treats future unknown values safely', () => {
    expect(eligibilityPresentation('ELIGIBLE').label).toBe('可直接选择');
    expect(eligibilityPresentation('NEEDS_CONFIRMATION').label).toBe(
      '需人工确认',
    );
    expect(eligibilityPresentation('UNKNOWN').label).toBe('证据未知');
    expect(eligibilityPresentation('INELIGIBLE').label).toBe('不合格');
    expect(eligibilityPresentation('FUTURE_STATUS')).toMatchObject({
      status: 'UNKNOWN',
    });
    expect(isCandidateSelectable('ELIGIBLE')).toBe(true);
    expect(isCandidateSelectable('NEEDS_CONFIRMATION')).toBe(true);
    expect(isCandidateSelectable('UNKNOWN')).toBe(false);
    expect(isCandidateSelectable('INELIGIBLE')).toBe(false);
    expect(isCandidateSelectable('FUTURE_STATUS')).toBe(false);
  });

  it('shows honest evidence completeness and controlled reason text', () => {
    expect(
      evidenceCompleteness(
        candidate({
          eligibilityStatus: 'NEEDS_CONFIRMATION',
          totalScore: null,
        }),
      ),
    ).toMatchObject({ label: '证据待确认' });
    expect(
      evidenceCompleteness(
        candidate({ eligibilityStatus: 'UNKNOWN', totalScore: null }),
      ),
    ).toMatchObject({ label: '证据未知' });
    expect(reasonText('EXCHANGE_RATE_MISSING')).toContain('汇率');
    expect(reasonText('UNRECOGNIZED_CODE')).toContain('受控原因');
  });
});
