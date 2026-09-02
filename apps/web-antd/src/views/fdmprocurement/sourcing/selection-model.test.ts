import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type { FdmProcurementSourcingApi } from '#/api/fdmprocurement/sourcing';

import { describe, expect, it } from 'vitest';

import {
  buildSourcingSelection,
  initialSelectionQuantities,
  sourcingLineQuantitySummary,
} from './selection-model';

const requisition = {
  items: [
    { id: 'item-1', lineNo: 1, requestedQty: '10', unitConversionFactor: '2' },
    { id: 'item-2', lineNo: 2, requestedQty: '3', unitConversionFactor: '1' },
  ],
} as FdmProcurementRequisitionApi.Requisition;

const assessment = {
  allocations: [
    {
      allocatedQty: '5.25',
      candidateId: 'candidate-1',
      id: 'allocation-1',
      requisitionItemId: 'item-1',
    },
  ],
  candidates: [
    {
      eligibilityStatus: 'ELIGIBLE',
      eliminationCodes: [],
      id: 'candidate-1',
      maxAllocatableQty: '6',
      minOrderQty: '1',
      packageMultiple: '0.25',
      purchaseUnit: 'PCS',
      requisitionItemId: 'item-1',
      supplierId: 'supplier-1',
      unitConversionFactor: '1',
    },
    {
      eligibilityStatus: 'ELIGIBLE',
      eliminationCodes: [],
      id: 'candidate-2',
      maxAllocatableQty: '8',
      minOrderQty: '1',
      packageMultiple: '0.25',
      purchaseUnit: 'BOX',
      requisitionItemId: 'item-1',
      supplierId: 'supplier-2',
      unitConversionFactor: '3',
    },
    {
      eligibilityStatus: 'ELIGIBLE',
      eliminationCodes: [],
      id: 'candidate-3',
      maxAllocatableQty: '3',
      minOrderQty: '1',
      packageMultiple: '1',
      purchaseUnit: 'PCS',
      requisitionItemId: 'item-2',
      supplierId: 'supplier-3',
      unitConversionFactor: '1',
    },
    {
      eligibilityStatus: 'UNKNOWN',
      eliminationCodes: ['CAPACITY_UNKNOWN'],
      id: 'candidate-4',
      requisitionItemId: 'item-2',
      supplierId: 'supplier-4',
      unitConversionFactor: '1',
    },
    {
      eligibilityStatus: 'NEEDS_CONFIRMATION',
      eliminationCodes: ['CAPACITY_STALE'],
      id: 'candidate-5',
      maxAllocatableQty: '3',
      minOrderQty: '1',
      packageMultiple: '1',
      purchaseUnit: 'PCS',
      requisitionItemId: 'item-2',
      supplierId: 'supplier-5',
      totalScore: null,
      unitConversionFactor: '1',
    },
  ],
  id: 'assessment-1',
} as FdmProcurementSourcingApi.Assessment;

describe('sourcing human selection model', () => {
  it('keeps server recommended decimals as strings', () => {
    expect(initialSelectionQuantities(assessment)).toEqual({
      'candidate-1': '5.25',
    });
  });

  it('shows the final human selection instead of mixing it with recommendations', () => {
    expect(
      initialSelectionQuantities({
        ...assessment,
        allocations: [
          ...assessment.allocations,
          {
            allocatedQty: '3',
            allocationRole: 'HUMAN_SELECTED',
            candidateId: 'candidate-3',
            id: 'allocation-selected',
            requisitionItemId: 'item-2',
            selected: true,
          },
        ],
      }),
    ).toEqual({ 'candidate-3': '3' });
  });

  it('reports base-unit quantity conservation without rounding or fake values', () => {
    expect(
      sourcingLineQuantitySummary(assessment, requisition.items[0]!, {
        'candidate-1': '5',
        'candidate-2': '5',
      }),
    ).toEqual({
      allocatedBase: '20',
      balanced: true,
      complete: true,
      requiredBase: '20',
    });

    const missingFactor = {
      ...assessment,
      candidates: assessment.candidates.map((value) =>
        value.id === 'candidate-1'
          ? { ...value, unitConversionFactor: null }
          : value,
      ),
    };
    expect(
      sourcingLineQuantitySummary(missingFactor, requisition.items[0]!, {
        'candidate-1': '5',
      }),
    ).toMatchObject({ allocatedBase: undefined, complete: false });
  });

  it('accepts real safe-range numeric Long ids after JSON deserialization', () => {
    const numericAssessment = {
      ...assessment,
      allocations: [
        {
          ...assessment.allocations[0],
          candidateId: 101,
          id: 201,
          requisitionItemId: 301,
        },
      ],
      candidates: [
        {
          ...assessment.candidates[0],
          id: 101,
          maxAllocatableQty: '10',
          requisitionItemId: 301,
          unitConversionFactor: '2',
        },
      ],
      id: 401,
    } as unknown as FdmProcurementSourcingApi.Assessment;
    const numericRequisition = {
      ...requisition,
      items: [
        {
          ...requisition.items[0],
          id: 301,
          requestedQty: '5',
          unitConversionFactor: '2',
        },
      ],
    } as unknown as FdmProcurementRequisitionApi.Requisition;

    expect(initialSelectionQuantities(numericAssessment)).toEqual({
      101: '5.25',
    });
    expect(
      buildSourcingSelection(
        numericAssessment,
        numericRequisition,
        { 101: '5' },
        '数字 Long 身份也必须准确匹配',
      ),
    ).toMatchObject({
      issues: [],
      request: {
        allocations: [{ candidateId: '101', quantity: '5' }],
        assessmentId: '401',
      },
    });
  });

  it('builds an exact quantity-conserving human selection', () => {
    const result = buildSourcingSelection(
      assessment,
      requisition,
      {
        'candidate-1': '5',
        'candidate-2': '5',
        'candidate-3': '3',
      },
      '分拆后满足两条申请行的数量和交期',
    );

    expect(result.issues).toEqual([]);
    expect(result.request).toEqual({
      allocations: [
        { candidateId: 'candidate-1', quantity: '5' },
        { candidateId: 'candidate-2', quantity: '5' },
        { candidateId: 'candidate-3', quantity: '3' },
      ],
      assessmentId: 'assessment-1',
      reason: '分拆后满足两条申请行的数量和交期',
    });
  });

  it('allows an eligible-only selection without inventing a reason', () => {
    const result = buildSourcingSelection(
      assessment,
      requisition,
      {
        'candidate-1': '5',
        'candidate-2': '5',
        'candidate-3': '3',
      },
      '',
    );

    expect(result).toMatchObject({
      issues: [],
      request: { reason: null },
    });
  });

  it('requires an explicit override reason for NEEDS_CONFIRMATION', () => {
    const missingReason = buildSourcingSelection(
      assessment,
      requisition,
      {
        'candidate-1': '5',
        'candidate-2': '5',
        'candidate-5': '3',
      },
      '   ',
    );
    expect(missingReason.request).toBeUndefined();
    expect(missingReason.issues.join('|')).toContain('例外确认理由');

    const confirmed = buildSourcingSelection(
      assessment,
      requisition,
      {
        'candidate-1': '5',
        'candidate-2': '5',
        'candidate-5': '3',
      },
      '容量快照刚过期，已电话向供应商确认本周可交付并由采购经理复核',
    );
    expect(confirmed).toMatchObject({
      issues: [],
      request: {
        allocations: expect.arrayContaining([
          { candidateId: 'candidate-5', quantity: '3' },
        ]),
        reason: '容量快照刚过期，已电话向供应商确认本周可交付并由采购经理复核',
      },
    });
  });

  it('honors the frozen override policy when the backend supplies it', () => {
    const frozenPolicyAssessment = {
      ...assessment,
      needsConfirmationSelectionAllowed: true,
      overrideReasonMinLength: 12,
    };
    const tooShort = buildSourcingSelection(
      frozenPolicyAssessment,
      requisition,
      {
        'candidate-1': '5',
        'candidate-2': '5',
        'candidate-5': '3',
      },
      '已线下确认',
    );
    expect(tooShort.issues.join('|')).toContain('至少需要 12 个字符');

    const forbidden = buildSourcingSelection(
      { ...frozenPolicyAssessment, needsConfirmationSelectionAllowed: false },
      requisition,
      {
        'candidate-1': '5',
        'candidate-2': '5',
        'candidate-5': '3',
      },
      '已线下确认供应容量并由采购经理批准例外',
    );
    expect(forbidden.request).toBeUndefined();
    expect(forbidden.issues.join('|')).toContain('冻结策略不允许');
  });

  it('prechecks frozen supplier count and concentration without guessing defaults', () => {
    const quantities = {
      'candidate-1': '5',
      'candidate-2': '5',
      'candidate-3': '3',
    };
    expect(
      buildSourcingSelection(assessment, requisition, quantities, ''),
    ).toMatchObject({ issues: [], request: expect.any(Object) });

    const result = buildSourcingSelection(
      {
        ...assessment,
        maximumSupplierConcentration: '0.60',
        maximumSupplierCount: 1,
      },
      requisition,
      quantities,
      '',
    );
    expect(result.request).toBeUndefined();
    expect(result.issues.join('|')).toContain('超过冻结策略上限 1 家');
    expect(result.issues.join('|')).toContain('超过冻结策略上限 60.00%');
  });

  it('blocks unknown candidates, over-capacity and quantity imbalance', () => {
    const result = buildSourcingSelection(
      assessment,
      requisition,
      {
        'candidate-1': '7',
        'candidate-4': '3',
      },
      '',
    );

    expect(result.request).toBeUndefined();
    expect(result.issues.join('|')).toContain('超过最大可分配数量');
    expect(result.issues.join('|')).toContain('证据未知');
    expect(result.issues.join('|')).toContain('必须等于申请基础数量');
  });
});
