import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';

import { describe, expect, it } from 'vitest';

import {
  adaptDemandPlanRules,
  completeDemandPlanFieldMetas,
} from './generation-adapter';

function generationJob(): FdmWaimaoDemandPlanApi.GenerationJob {
  return {
    fieldMetas: [
      {
        editable: true,
        fieldPath: '$.lines[0].allocations[INTERNAL_FACTORY].quantity',
        origin: 'WAREHOUSE_FACTORY_ATP',
        reason: '可在 WAREHOUSE ATP 上限 12 内人工核实',
        status: 'EVIDENCE_AVAILABLE',
      },
      {
        editable: true,
        fieldPath: '$.lines[0].allocations[STOCK].quantity',
        origin: 'MISSING',
        reason: '缺少权威供给数量，等待人工核实',
        status: 'UNKNOWN',
      },
    ],
    generationType: 'CONTRACT_TO_FULFILLMENT_PLAN',
    id: '9007199254740993',
    missingData: [],
    modelId: 'model-1',
    proposal: {
      lines: [
        {
          allocations: [
            { quantity: null, type: 'STOCK' },
            { quantity: '12', type: 'INTERNAL_FACTORY' },
            { quantity: null, type: 'EXTERNAL_PURCHASE' },
          ],
          sourceContractOrderItemId: '9223372036854775806',
        },
      ],
    },
    proposalVersion: 2,
    rules: [],
    sourceId: '9223372036854775807',
    sourceSnapshotHash: 'a'.repeat(64),
    sourceType: 'CONTRACT_ORDER',
    sourceVersion: '8',
    status: 'READY',
    version: '5',
    warnings: [],
  };
}

describe('demand-plan generation adapter', () => {
  it('maps server index paths to stable contract item IDs', () => {
    const fields = completeDemandPlanFieldMetas(generationJob(), {
      id: '9223372036854775807',
      items: [
        {
          id: '9223372036854775806',
          mappingStatus: 'MAPPED',
          name: '产品 A',
          quantity: '12',
        },
      ],
      orderNo: 'DD-001',
      status: 'CONFIRMED',
      subject: '测试合同',
      version: 8,
    });

    const authoritative = fields.find(
      (field) =>
        field.fieldKey ===
        'lines.9223372036854775806.allocations.INTERNAL_FACTORY.quantity',
    );
    expect(authoritative).toMatchObject({
      confidence: 'HIGH',
      origin: 'MASTER_DATA',
      proposedValue: '12',
    });
    expect(authoritative?.evidence?.[0]?.detail).toContain('WAREHOUSE ATP');

    const unknown = fields.find(
      (field) =>
        field.fieldKey ===
        'lines.9223372036854775806.allocations.STOCK.quantity',
    );
    expect(unknown).toMatchObject({
      confidence: 'LOW',
      origin: 'MISSING',
      proposedValue: null,
    });
    expect(fields.some((field) => field.fieldKey.startsWith('$.lines['))).toBe(
      false,
    );
  });

  it('maps server validation locations to editable field IDs', () => {
    expect(
      adaptDemandPlanRules(
        [
          {
            fieldPath: 'lines[0].requiredDate',
            message: '日期缺失',
            passed: false,
            ruleCode: 'REQUIRED_DATE_PRESENT',
            severity: 'BLOCKER',
          },
        ],
        [{ sourceContractOrderItemId: '9223372036854775806' }],
      )[0]?.fieldKey,
    ).toBe('lines.9223372036854775806.requiredDate');
  });
});
