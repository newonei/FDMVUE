import type { AiFieldStateMap } from '#/views/fdm-trade-shared/ai-document-generation';

import { describe, expect, it } from 'vitest';

import {
  buildDemandPlanMaterializeReq,
  buildDemandPlanUpdateReq,
  clientValidateDemandPlan,
  demandPlanAllocatedQuantity,
  mergeProposalIntoForm,
  proposalToForm,
} from './form-model';

function generatedForm() {
  return proposalToForm(
    {
      lines: [
        {
          allocations: [
            { quantity: '9007199254740993.1', type: 'STOCK' },
            { quantity: '0.2', type: 'INTERNAL_FACTORY' },
            { quantity: null, type: 'EXTERNAL_PURCHASE' },
          ],
          decisionNote: 'AI 拆分',
          requiredDate: '2026-09-01',
          sourceContractOrderItemId: '9223372036854775806',
        },
      ],
      remark: 'AI 备注',
    },
    {
      id: '9223372036854775807',
      items: [
        {
          id: '9223372036854775806',
          mappingStatus: 'MAPPED',
          name: '精确数量产品',
          quantity: '9007199254740993.3',
        },
      ],
      orderNo: 'DD-001',
      status: 'CONFIRMED',
      subject: '合同',
      version: 9,
    },
    {
      id: '9223372036854775805',
      proposalVersion: 3,
      sourceSnapshotHash: 'a'.repeat(64),
      sourceVersion: '9',
      version: '4',
    },
  );
}

describe('demand-plan form model', () => {
  it('keeps Long IDs and decimal quantities as strings', () => {
    const form = generatedForm();
    expect(form.generationRunId).toBe('9223372036854775805');
    expect(form.lines[0]?.sourceContractOrderItemId).toBe(
      '9223372036854775806',
    );
    expect(form.lines[0]?.contractQuantity).toBe('9007199254740993.3');
  });

  it('preserves UNKNOWN as null and never sends contractQuantity', () => {
    const request = buildDemandPlanMaterializeReq(generatedForm());
    expect(request.lines[0]?.allocations[2]?.quantity).toBeNull();
    expect(JSON.stringify(request)).not.toContain('contractQuantity');
  });

  it('uses BigNumber for formal allocation totals', () => {
    const form = generatedForm();
    form.lines[0]!.allocations[2]!.quantity = '0';
    expect(demandPlanAllocatedQuantity(form.lines[0]!)).toBe(
      '9007199254740993.3',
    );
  });

  it('allows UNKNOWN warnings in DRAFT but blocks CONFIRM', () => {
    const draft = clientValidateDemandPlan(generatedForm(), 'DRAFT');
    const confirm = clientValidateDemandPlan(generatedForm(), 'CONFIRM');
    expect(
      draft.find((item) => item.code === 'ALLOCATION_UNKNOWN')?.severity,
    ).toBe('WARNING');
    expect(
      confirm.find((item) => item.code === 'ALLOCATION_UNKNOWN')?.severity,
    ).toBe('BLOCKER');
  });

  it('never silently converts invalid input into UNKNOWN', () => {
    const form = generatedForm();
    form.lines[0]!.allocations[2]!.quantity = 'not-a-number';
    expect(
      clientValidateDemandPlan(form, 'DRAFT').find(
        (item) => item.code === 'ALLOCATION_FORMAT_INVALID',
      )?.severity,
    ).toBe('BLOCKER');
  });

  it('merges regeneration without replacing human edits', () => {
    const current = generatedForm();
    current.id = 'plan-1';
    current.version = 6;
    current.lines[0]!.id = 'plan-line-1';
    current.lines[0]!.allocations[0]!.id = 'allocation-1';
    current.lines[0]!.allocations[0]!.quantity = '88';
    const incoming = generatedForm();
    incoming.expectedRunVersion = '9';
    incoming.proposalVersion = 4;
    incoming.sourceSnapshotHash = 'b'.repeat(64);
    incoming.lines[0]!.allocations[0]!.quantity = '99';
    incoming.remark = '新 AI 备注';
    const key = 'lines.9223372036854775806.allocations.STOCK.quantity';
    const fields: AiFieldStateMap = {
      [key]: {
        currentValue: '88',
        fieldKey: key,
        label: '库存数量',
        origin: 'HUMAN_EDIT',
        originalOrigin: 'AI_INFERRED',
        proposedValue: '99',
      },
    };

    const merged = mergeProposalIntoForm(current, incoming, fields);
    expect(merged.lines[0]?.allocations[0]?.quantity).toBe('88');
    expect(merged.lines[0]?.id).toBe('plan-line-1');
    expect(merged.lines[0]?.allocations[0]?.id).toBe('allocation-1');
    expect(merged.remark).toBe('新 AI 备注');
    expect(merged.id).toBe('plan-1');
    expect(merged.version).toBe(6);
    expect(merged.expectedRunVersion).toBe('9');
    expect(merged.proposalVersion).toBe(4);
    expect(merged.sourceSnapshotHash).toBe('b'.repeat(64));
  });

  it('sends regenerated proposal context atomically on update', () => {
    const form = generatedForm();
    form.id = '9223372036854775804';
    form.version = 6;

    const adopted = buildDemandPlanUpdateReq(form);
    expect(adopted).toMatchObject({
      expectedRunVersion: '4',
      expectedSourceSnapshotHash: 'a'.repeat(64),
      generationRunId: '9223372036854775805',
      proposalVersion: 3,
    });

    form.expectedRunVersion = undefined;
    const ordinary = buildDemandPlanUpdateReq(form);
    expect(ordinary).not.toHaveProperty('generationRunId');
    expect(ordinary).not.toHaveProperty('proposalVersion');
    expect(ordinary).not.toHaveProperty('expectedSourceSnapshotHash');
  });

  it('requires evidence when a quantity is manually changed', () => {
    const form = generatedForm();
    const key = 'lines.9223372036854775806.allocations.STOCK.quantity';
    const fields: AiFieldStateMap = {
      [key]: {
        currentValue: '12',
        fieldKey: key,
        label: '库存数量',
        origin: 'HUMAN_EDIT',
        originalOrigin: 'AI_INFERRED',
      },
    };
    expect(
      clientValidateDemandPlan(form, 'DRAFT', fields).some(
        (issue) => issue.code === 'MANUAL_EVIDENCE_REQUIRED',
      ),
    ).toBe(true);
    form.lines[0]!.allocations[0]!.evidenceNote = '仓库 2026-08-29 盘点记录';
    expect(
      clientValidateDemandPlan(form, 'DRAFT', fields).some(
        (issue) => issue.code === 'MANUAL_EVIDENCE_REQUIRED',
      ),
    ).toBe(false);
    expect(
      clientValidateDemandPlan(form, 'DRAFT', fields).some(
        (issue) =>
          issue.code === 'MANUAL_EVIDENCE_METADATA_REQUIRED' &&
          issue.severity === 'WARNING',
      ),
    ).toBe(true);
    form.lines[0]!.allocations[0]!.evidenceSourceSystem =
      'WAREHOUSE_CONFIRMATION';
    form.lines[0]!.allocations[0]!.evidenceSourceVersion =
      '2026-08-29T14:30:00';
    form.lines[0]!.allocations[0]!.evidenceValidUntil = '2099-08-29T18:00:00';
    expect(
      clientValidateDemandPlan(form, 'CONFIRM', fields).some((issue) =>
        issue.code.startsWith('MANUAL_EVIDENCE_'),
      ),
    ).toBe(false);

    const request = buildDemandPlanMaterializeReq(form);
    expect(request.lines[0]?.allocations[0]).toMatchObject({
      evidenceNote: '仓库 2026-08-29 盘点记录',
      evidenceSourceSystem: 'WAREHOUSE_CONFIRMATION',
      evidenceSourceVersion: '2026-08-29T14:30:00',
      evidenceValidUntil: '2099-08-29T18:00:00',
    });
  });
});
