import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';

import { describe, expect, it } from 'vitest';

import { requisitionLineFieldKey } from './form-model';
import {
  adaptRequisitionRules,
  completeRequisitionFieldMetas,
} from './generation-adapter';

const source: FdmProcurementRequisitionApi.GenerationSource = {
  fulfillmentPlanId: '9223372036854775802',
  lines: [
    {
      externalPurchaseQuantity: '10',
      productName: '产品 A',
      sourcePlanLineId: '9223372036854775806',
      unit: 'PCS',
    },
  ],
  sourceSnapshotHash: 'a'.repeat(64),
  status: 'CONFIRMED',
  version: 2,
};

function job(): FdmProcurementRequisitionApi.GenerationJob {
  return {
    fieldMetas: [
      {
        fieldPath: '$.lineSuggestions[0].note',
        origin: 'AI_INFERRED',
        proposedValue: '核对交期',
      },
    ],
    generationType: 'FULFILLMENT_TO_REQUISITION',
    id: '9223372036854775808',
    missingData: [],
    modelId: '9',
    proposal: {
      lineSuggestions: [
        {
          note: '核对交期',
          riskCodes: ['DELIVERY_RISK'],
          sourcePlanLineId: '9223372036854775806',
        },
      ],
      summary: '摘要',
    },
    proposalVersion: 1,
    rules: [],
    sourceId: '9223372036854775802',
    sourceSnapshotHash: 'a'.repeat(64),
    sourceType: 'FULFILLMENT_PLAN',
    sourceVersion: 2,
    status: 'READY',
    version: 3,
    warnings: [],
  };
}

describe('requisition generation adapter', () => {
  it('builds trustworthy fallback metadata when the backend returns null fieldMetas', () => {
    const raw = job();
    raw.fieldMetas = null;
    const fields = completeRequisitionFieldMetas(raw, source);

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: requisitionLineFieldKey(
            '9223372036854775806',
            'requestedQty',
          ),
          origin: 'SOURCE_DOCUMENT',
          proposedValue: '10',
        }),
        expect.objectContaining({
          fieldKey: requisitionLineFieldKey(
            '9223372036854775806',
            'unitConversionFactor',
          ),
          origin: 'RULE_DEFAULT',
          proposedValue: '1',
        }),
      ]),
    );
  });

  it('does not mistake line binding control data for editable field metadata', () => {
    const raw = job();
    raw.fieldMetas = {
      lineBindings: {
        opaqueLineRef: 'opaque-only-reference',
        sourcePlanLineId: '9223372036854775806',
      },
    } as unknown as FdmProcurementRequisitionApi.GenerationJob['fieldMetas'];

    const fields = completeRequisitionFieldMetas(raw, source);

    expect(fields.some((field) => field.fieldKey === 'lineBindings')).toBe(
      false,
    );
    expect(
      fields.find(
        (field) =>
          field.fieldKey ===
          requisitionLineFieldKey('9223372036854775806', 'procurementNote'),
      ),
    ).toMatchObject({ proposedValue: '核对交期' });
  });

  it('maps proposal index paths to stable source plan line IDs', () => {
    const fieldKey = requisitionLineFieldKey(
      '9223372036854775806',
      'procurementNote',
    );
    const fields = completeRequisitionFieldMetas(job(), source);
    expect(fields.find((field) => field.fieldKey === fieldKey)).toMatchObject({
      origin: 'AI_INFERRED',
      proposedValue: '核对交期',
    });
  });

  it('keeps failed hard rules as blockers with stable field keys', () => {
    const issues = adaptRequisitionRules(
      [
        {
          fieldPath: '$.lineSuggestions[0].note',
          message: '说明缺失',
          passed: false,
          ruleCode: 'NOTE_REQUIRED',
          severity: 'BLOCKER',
        },
      ],
      job().proposal,
    );
    expect(issues[0]).toEqual({
      code: 'NOTE_REQUIRED',
      fieldKey: requisitionLineFieldKey(
        '9223372036854775806',
        'procurementNote',
      ),
      message: '说明缺失',
      severity: 'BLOCKER',
    });
  });
});
