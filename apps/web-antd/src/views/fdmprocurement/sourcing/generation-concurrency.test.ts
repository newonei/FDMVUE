import { describe, expect, it } from 'vitest';

import {
  editSourcingGenerationDraft,
  mergeSourcingGenerationDraft,
  proposalSelectionDraft,
  sourcingGenerationDraftBinding,
} from './generation-concurrency';

const proposal = {
  alternativePlanTokens: ['PLAN-002'],
  lineExplanations: [],
  planReason: 'reason',
  recommendedPlanToken: 'PLAN-001',
  summary: 'summary',
};

describe('sourcing generation human edit concurrency', () => {
  it('binds selection drafts to run ID and proposal version', () => {
    expect(sourcingGenerationDraftBinding('701', 3)).toBe('701:3');
    expect(proposalSelectionDraft('701', 3, proposal)).toMatchObject({
      bindingKey: '701:3',
      origin: 'AI_PROPOSAL',
      selectedPlanToken: 'PLAN-001',
      selectionMode: 'AI_PLAN',
    });
  });

  it('lets polling replace untouched AI defaults', () => {
    const current = proposalSelectionDraft('701', 2, proposal);
    const incoming = proposalSelectionDraft('701', 3, {
      ...proposal,
      recommendedPlanToken: 'PLAN-002',
    });
    expect(mergeSourcingGenerationDraft(current, incoming)).toEqual(incoming);
  });

  it('never overwrites HUMAN_EDIT during polling or regeneration', () => {
    const edited = editSourcingGenerationDraft(
      proposalSelectionDraft('701', 2, proposal),
      {
        quantities: { 'CANDIDATE-001-002': '10' },
        reason: '人工选择了证据更完整的候选',
        selectedPlanToken: undefined,
        selectionMode: 'CUSTOM',
      },
    );
    const merged = mergeSourcingGenerationDraft(
      edited,
      proposalSelectionDraft('701', 3, proposal),
    );
    expect(merged).toMatchObject({
      bindingKey: '701:3',
      origin: 'HUMAN_EDIT',
      quantities: { 'CANDIDATE-001-002': '10' },
      reason: '人工选择了证据更完整的候选',
      selectionMode: 'CUSTOM',
    });
  });
});
