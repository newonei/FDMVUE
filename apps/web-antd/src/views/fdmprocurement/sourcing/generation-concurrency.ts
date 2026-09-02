import type { FdmProcurementSourcingGenerationApi } from '#/api/fdmprocurement/sourcing/generation';

export type GenerationDraftOrigin =
  | 'AI_PROPOSAL'
  | 'HUMAN_EDIT'
  | 'SERVER_PLAN';

export interface SourcingGenerationSelectionDraft {
  bindingKey: string;
  origin: GenerationDraftOrigin;
  quantities: Record<string, string>;
  reason: string;
  selectedPlanToken?: string;
  selectionMode: FdmProcurementSourcingGenerationApi.SelectionMode;
}

export function sourcingGenerationDraftBinding(
  runId: string,
  proposalVersion: number,
) {
  return `${runId}:${proposalVersion}`;
}

export function proposalSelectionDraft(
  runId: string,
  proposalVersion: number,
  proposal: FdmProcurementSourcingGenerationApi.Proposal,
): SourcingGenerationSelectionDraft {
  return {
    bindingKey: sourcingGenerationDraftBinding(runId, proposalVersion),
    origin: 'AI_PROPOSAL',
    quantities: {},
    reason: '',
    selectedPlanToken: proposal.recommendedPlanToken,
    selectionMode: 'AI_PLAN',
  };
}

/**
 * Polling may refresh the same proposal and regenerate may create a new one.
 * Neither is allowed to silently replace a user's explicit selection edits.
 */
export function mergeSourcingGenerationDraft(
  current: SourcingGenerationSelectionDraft | undefined,
  incoming: SourcingGenerationSelectionDraft,
) {
  if (!current || current.origin !== 'HUMAN_EDIT') return incoming;
  return { ...current, bindingKey: incoming.bindingKey };
}

export function editSourcingGenerationDraft(
  current: SourcingGenerationSelectionDraft,
  patch: Partial<
    Omit<SourcingGenerationSelectionDraft, 'bindingKey' | 'origin'>
  >,
): SourcingGenerationSelectionDraft {
  return { ...current, ...patch, origin: 'HUMAN_EDIT' };
}
