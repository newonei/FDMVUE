import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';

import { describe, expect, it } from 'vitest';

import {
  authoritativeSelectedAssessmentRef,
  canBindUnmappedProductSku,
  canUseRequisitionAction,
  hasAllActionPermissions,
  hasValidSelectedAssessmentRef,
} from './policy';

function record(
  status: FdmProcurementRequisitionApi.RequisitionStatus,
  validationStatus: string,
) {
  return {
    status,
    validationStatus,
  } as FdmProcurementRequisitionApi.Requisition;
}

describe('procurement requisition action policy', () => {
  const allowAll = () => true;
  const denyAll = () => false;

  it('fails closed when any permission is missing', () => {
    expect(
      canUseRequisitionAction(record('READY', 'PASSED'), 'SUBMIT', denyAll),
    ).toBe(false);
    expect(
      canUseRequisitionAction(
        record('SUBMITTED', 'PASSED'),
        'WITHDRAW',
        denyAll,
      ),
    ).toBe(false);
    expect(
      canUseRequisitionAction(record('READY', 'PASSED'), 'SOURCING', (code) =>
        code.endsWith(':query'),
      ),
    ).toBe(false);
    expect(
      canUseRequisitionAction(
        record('READY', 'PASSED'),
        'AI_SOURCING',
        (code) => code !== 'fdmprocurement:sourcing:ai-generate',
      ),
    ).toBe(false);
  });

  it('only exposes product binding for unmapped draft-like lines with all permissions', () => {
    const item = {
      productMappingStatus: 'PRODUCT_UNMAPPED',
    } as FdmProcurementRequisitionApi.RequisitionItem;
    expect(
      canBindUnmappedProductSku(record('DRAFT', 'BLOCKED'), item, allowAll),
    ).toBe(true);
    expect(
      canBindUnmappedProductSku(
        record('DATA_INCOMPLETE', 'BLOCKED'),
        item,
        allowAll,
      ),
    ).toBe(true);
    expect(
      canBindUnmappedProductSku(record('READY', 'PASSED'), item, allowAll),
    ).toBe(false);
    expect(
      canBindUnmappedProductSku(
        record('DRAFT', 'BLOCKED'),
        { ...item, productMappingStatus: 'MAPPED' },
        allowAll,
      ),
    ).toBe(false);
    for (const denied of [
      'fdmprocurement:requisition:query',
      'fdmprocurement:requisition:update',
      'fdmproduct:selection:query',
    ]) {
      expect(
        canBindUnmappedProductSku(
          record('DRAFT', 'BLOCKED'),
          item,
          (code) => code !== denied,
        ),
      ).toBe(false);
    }
  });

  it('requires document-flow query, create, and retry for AI sourcing', () => {
    for (const denied of [
      'fdmdocflow:generation:query',
      'fdmdocflow:generation:create',
      'fdmdocflow:generation:retry',
    ]) {
      expect(
        hasAllActionPermissions('AI_SOURCING', (code) => code !== denied),
      ).toBe(false);
    }
  });

  it('keeps rule sourcing available while AI sourcing also rejects validation blockers', () => {
    expect(
      canUseRequisitionAction(record('READY', 'BLOCKED'), 'SOURCING', allowAll),
    ).toBe(true);
    expect(
      canUseRequisitionAction(
        record('READY', 'BLOCKED'),
        'AI_SOURCING',
        allowAll,
      ),
    ).toBe(false);
    expect(
      canUseRequisitionAction(
        record('DRAFT', 'NOT_CHECKED'),
        'AI_SOURCING',
        allowAll,
      ),
    ).toBe(true);
  });

  it('requires READY and PASSED before submit', () => {
    expect(
      canUseRequisitionAction(record('DRAFT', 'PASSED'), 'SUBMIT', allowAll),
    ).toBe(false);
    expect(
      canUseRequisitionAction(record('READY', 'BLOCKED'), 'SUBMIT', allowAll),
    ).toBe(false);
    expect(
      canUseRequisitionAction(record('READY', 'PASSED'), 'SUBMIT', allowAll),
    ).toBe(true);
  });

  it('never enables fake edit while the audited update command is absent', () => {
    expect(
      canUseRequisitionAction(record('DRAFT', 'NOT_CHECKED'), 'EDIT', allowAll),
    ).toBe(false);
  });

  it('opens BPM approval only with a real process instance', () => {
    const source = record('SUBMITTED', 'PASSED');
    expect(
      canUseRequisitionAction(source, 'APPROVAL_WORKSPACE', allowAll),
    ).toBe(false);
    expect(
      canUseRequisitionAction(source, 'APPROVAL_WORKSPACE', allowAll, {
        audits: [],
        processInstanceId: 'process-1',
        requisitionId: '1',
        status: 'SUBMITTED',
        version: 8,
      }),
    ).toBe(true);
  });

  it('requires both process-instance and task query permissions for BPM workspace', () => {
    expect(
      hasAllActionPermissions(
        'APPROVAL_WORKSPACE',
        (code) => code === 'bpm:task:query',
      ),
    ).toBe(false);
    expect(
      hasAllActionPermissions(
        'APPROVAL_WORKSPACE',
        (code) => code === 'bpm:process-instance:query',
      ),
    ).toBe(false);
    expect(
      hasAllActionPermissions('APPROVAL_WORKSPACE', (code) =>
        ['bpm:process-instance:query', 'bpm:task:query'].includes(code),
      ),
    ).toBe(true);
  });

  it('only lets the actual submitter withdraw', () => {
    const source = record('SUBMITTED', 'PASSED');
    const state = {
      audits: [],
      requisitionId: '1',
      status: 'SUBMITTED',
      submittedBy: '164',
      version: 8,
    } as FdmProcurementRequisitionApi.ApprovalState;

    expect(
      canUseRequisitionAction(source, 'WITHDRAW', allowAll, state, '164'),
    ).toBe(true);
    expect(
      canUseRequisitionAction(source, 'WITHDRAW', allowAll, state, '165'),
    ).toBe(false);
  });

  it('restores a READY selection only from authoritative approval state', () => {
    const source = record('READY', 'PASSED');
    const state = {
      audits: [],
      currentSelectedSourcingAssessmentId: '301',
      currentSelectedSourcingInputHash: 'a'.repeat(64),
      requisitionId: '1',
      status: 'READY',
      submittedSourcingAssessmentId: 'old-201',
      submittedSourcingInputHash: 'b'.repeat(64),
      version: 8,
    } as FdmProcurementRequisitionApi.ApprovalState;

    expect(authoritativeSelectedAssessmentRef(source, state)).toEqual({
      assessmentId: '301',
      inputHash: 'a'.repeat(64),
    });
    expect(authoritativeSelectedAssessmentRef(source, undefined)).toEqual({
      assessmentId: '',
      inputHash: '',
    });
    expect(
      authoritativeSelectedAssessmentRef(record('SUBMITTED', 'PASSED'), state),
    ).toEqual({ assessmentId: '', inputHash: '' });
  });

  it('requires an integer assessment id and exact 64-character input hash', () => {
    expect(hasValidSelectedAssessmentRef('201', 'a'.repeat(64))).toBe(true);
    expect(hasValidSelectedAssessmentRef('', 'a'.repeat(64))).toBe(false);
    expect(hasValidSelectedAssessmentRef('201', 'a'.repeat(63))).toBe(false);
    expect(
      hasValidSelectedAssessmentRef('assessment-201', 'a'.repeat(64)),
    ).toBe(false);
  });
});
