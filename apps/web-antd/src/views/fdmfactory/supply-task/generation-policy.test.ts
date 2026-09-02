import type { FdmFactorySupplyTaskApi } from '#/api/fdmfactory/supply-task';
import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';

import { describe, expect, it } from 'vitest';

import {
  canGenerateSupplyTask,
  parseSupplyTaskProposal,
  proposalDraft,
  SUPPLY_TASK_AI_PERMISSION_CODES,
  validateSupplyTaskProposalDraft,
} from './generation-policy';

const authorityHash = 'a'.repeat(64);

function plan(
  status: FdmWaimaoDemandPlanApi.DemandPlanStatus = 'CONFIRMED',
  quantity: null | string = '10',
) {
  return {
    lines: [
      {
        allocations: [{ quantity, type: 'INTERNAL_FACTORY' }],
      },
    ],
    status,
  } as FdmWaimaoDemandPlanApi.Detail;
}

function normalizedJson(factoryToken = 'FACTORY-001') {
  return JSON.stringify({
    authorityHash,
    confirmedPlanSnapshotHash: 'b'.repeat(64),
    lineSelections: [
      {
        confidence: 'HIGH',
        factoryToken,
        lineToken: 'LINE-001',
        reason: 'ATP 充足',
        riskCodes: ['DELIVERY_WINDOW'],
      },
    ],
    sourcePlanId: '101',
    sourcePlanVersion: 4,
    summary: '建议工厂一',
  });
}

function detail(): FdmFactorySupplyTaskApi.GenerationDetail {
  return {
    attempts: [],
    companyId: '1',
    currentAttemptNo: 1,
    generationType: 'DEMAND_TO_SUPPLY_TASK',
    modelId: '2',
    proposal: {
      evidence: {
        authorityHash,
        candidateLines: [
          {
            candidates: [
              {
                atpAvailableQuantity: '20',
                atpStatus: 'AVAILABLE',
                factoryId: '301',
                factoryName: '内部工厂一',
                factoryToken: 'FACTORY-001',
                factoryVersion: 2,
                selectable: true,
              },
              {
                atpStatus: 'UNKNOWN',
                factoryId: '302',
                factoryName: '内部工厂二',
                factoryToken: 'FACTORY-002',
                factoryVersion: 1,
                selectable: false,
              },
            ],
            lineToken: 'LINE-001',
            productId: '301',
            productName: '产品 A',
            productVersionToken: 'PRODUCT-V3',
            quantity: '10',
            requiredDate: '2026-09-10',
            sourcePlanLineId: '501',
            skuId: '401',
            unit: 'PCS',
          },
        ],
      },
      hash: 'c'.repeat(64),
      id: '601',
      missingData: [],
      normalizedJson: normalizedJson(),
      schemaVersion: '1.0',
      source: 'AI',
      version: 1,
      warnings: [],
    },
    requestedBy: '7',
    rules: [],
    runId: '8',
    source: { id: '101', type: 'FULFILLMENT_PLAN', version: '4' },
    sourceSnapshotHash: 'd'.repeat(64),
    status: 'READY',
    targetDocumentType: 'SUPPLY_TASK_BATCH',
    version: 3,
  };
}

describe('factory task generation policy', () => {
  it('requires confirmed positive internal-factory demand and every permission', () => {
    expect(canGenerateSupplyTask(plan(), () => true)).toBe(true);
    expect(canGenerateSupplyTask(plan('DRAFT'), () => true)).toBe(false);
    expect(canGenerateSupplyTask(plan('CONFIRMED', '0.000'), () => true)).toBe(
      false,
    );
    expect(canGenerateSupplyTask(plan('CONFIRMED', null), () => true)).toBe(
      false,
    );
    for (const denied of SUPPLY_TASK_AI_PERMISSION_CODES) {
      expect(canGenerateSupplyTask(plan(), (code) => code !== denied)).toBe(
        false,
      );
    }
  });

  it('parses the normalized READY proposal and rejects malformed tokens', () => {
    expect(parseSupplyTaskProposal(normalizedJson())).toMatchObject({
      lineSelections: [
        expect.objectContaining({
          factoryToken: 'FACTORY-001',
          lineToken: 'LINE-001',
        }),
      ],
      sourcePlanId: '101',
      sourcePlanVersion: 4,
    });
    expect(
      parseSupplyTaskProposal(normalizedJson('factory-1')),
    ).toBeUndefined();
    expect(parseSupplyTaskProposal('{broken')).toBeUndefined();
  });

  it('accepts human-edited selection only from selectable server tokens', () => {
    const run = detail();
    const parsed = parseSupplyTaskProposal(run.proposal?.normalizedJson);
    expect(parsed).toBeDefined();
    const draft = proposalDraft(parsed!);
    draft.selections[0]!.reason = '人工确认当前 ATP 和交期证据';
    const result = validateSupplyTaskProposalDraft({
      detail: run,
      draft,
      overrideReason: '人工核对了客户交期要求',
      sourcePlanId: '101',
      sourcePlanVersion: 4,
    });
    expect(result.issues).toEqual([]);
    expect(result.hasHumanOverrides).toBe(true);
    expect(result.overrideReason).toBe('人工核对了客户交期要求');
    expect(result.selections[0]).toEqual({
      confidence: 'HIGH',
      factoryToken: 'FACTORY-001',
      lineToken: 'LINE-001',
      reason: '人工确认当前 ATP 和交期证据',
      riskCodes: ['DELIVERY_WINDOW'],
    });
  });

  it('requires an audit reason only when the user changes the AI proposal', () => {
    const run = detail();
    const original = proposalDraft(
      parseSupplyTaskProposal(run.proposal?.normalizedJson)!,
    );
    const unchanged = validateSupplyTaskProposalDraft({
      detail: run,
      draft: original,
      sourcePlanId: '101',
      sourcePlanVersion: 4,
    });
    expect(unchanged.hasHumanOverrides).toBe(false);
    expect(unchanged.overrideReason).toBeUndefined();
    expect(unchanged.issues).toEqual([]);

    original.selections[0]!.confidence = 'MEDIUM';
    const changedWithoutReason = validateSupplyTaskProposalDraft({
      detail: run,
      draft: original,
      sourcePlanId: '101',
      sourcePlanVersion: 4,
    });
    expect(changedWithoutReason.hasHumanOverrides).toBe(true);
    expect(changedWithoutReason.issues).toContain(
      '已调整 AI 原提案，请填写人工调整原因',
    );
  });

  it('fails closed for a non-selectable token, missing evidence, or stale source', () => {
    const nonSelectable = detail();
    const draft = proposalDraft(
      parseSupplyTaskProposal(nonSelectable.proposal?.normalizedJson)!,
    );
    draft.selections[0]!.factoryToken = 'FACTORY-002';
    expect(
      validateSupplyTaskProposalDraft({
        detail: nonSelectable,
        draft,
        sourcePlanId: '101',
        sourcePlanVersion: 4,
      }).issues,
    ).toContain('需求行 LINE-001 请选择服务端标记为可用的工厂');

    const noEvidence = detail();
    noEvidence.proposal!.evidence.candidateLines = undefined;
    expect(
      validateSupplyTaskProposalDraft({
        detail: noEvidence,
        draft,
        sourcePlanId: '101',
        sourcePlanVersion: 4,
      }).issues,
    ).toContain('服务端未返回可编辑的工厂候选证据');

    const stale = detail();
    stale.source.version = '5';
    expect(
      validateSupplyTaskProposalDraft({
        detail: stale,
        draft,
        sourcePlanId: '101',
        sourcePlanVersion: 4,
      }).issues,
    ).toContain('生成任务来源与当前履约计划版本不一致');
  });

  it('never posts authority quantities, factory item ids, factory ids, or hashes as editable intent', () => {
    const run = detail();
    const draft = proposalDraft(
      parseSupplyTaskProposal(run.proposal?.normalizedJson)!,
    );
    const result = validateSupplyTaskProposalDraft({
      detail: run,
      draft,
      sourcePlanId: '101',
      sourcePlanVersion: 4,
    });
    expect(result.selections[0]).not.toHaveProperty('quantity');
    expect(result.selections[0]).not.toHaveProperty('factoryId');
    expect(result).not.toHaveProperty('authorityHash');
  });
});
