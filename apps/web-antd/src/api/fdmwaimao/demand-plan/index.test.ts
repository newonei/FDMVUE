import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelDemandPlanGeneration,
  confirmDemandPlan,
  createDemandPlan,
  createDemandPlanDirect,
  getDemandPlan,
  getDemandPlanGenerationJob,
  getDemandPlanGenerationOptions,
  getDemandPlanPage,
  getDemandPlanSummaryByOrder,
  regenerateDemandPlanGeneration,
  retryDemandPlanGeneration,
  startDemandPlanGeneration,
  updateDemandPlan,
  validateDemandPlanCreate,
  validateDemandPlanUpdate,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmwaimao demand-plan API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses only the demand-plan domain facade endpoints', async () => {
    await getDemandPlanPage({ pageNo: 1, pageSize: 20 });
    await getDemandPlan('9223372036854775801');
    await getDemandPlanSummaryByOrder('9223372036854775802');
    await getDemandPlanGenerationOptions('9223372036854775803');
    await getDemandPlanGenerationJob('9223372036854775804');

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/demand-plan/page',
      { params: { pageNo: 1, pageSize: 20 } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/demand-plan/get',
      { params: { id: '9223372036854775801' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      3,
      '/fdmwaimao/demand-plan/summary-by-order',
      { params: { orderId: '9223372036854775802' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      4,
      '/fdmwaimao/demand-plan/generation-options',
      { params: { orderId: '9223372036854775803' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      5,
      '/fdmwaimao/demand-plan/generation/job',
      { params: { id: '9223372036854775804' } },
    );
  });

  it('starts generation with identifiers and constrained instruction only', async () => {
    const request = {
      expectedOrderVersion: 7,
      idempotencyKey: 'demand-plan:test-001',
      instruction: '优先核实已有库存，但不得绕过数量守恒规则',
      modelId: '9007199254740993',
      orderId: '9223372036854775806',
    };
    await startDemandPlanGeneration(request);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/demand-plan/generation/start',
      request,
    );
  });

  it('materializes allocations without sending client contract quantities', async () => {
    const request = {
      attachmentIds: ['9223372036854775800'],
      expectedRunVersion: '8',
      expectedSourceSnapshotHash: 'a'.repeat(64),
      expectedSourceVersion: 7,
      generationRunId: '9223372036854775805',
      lines: [
        {
          allocations: [
            { quantity: '1.1', type: 'STOCK' as const },
            { quantity: null, type: 'INTERNAL_FACTORY' as const },
            { quantity: '2.2', type: 'EXTERNAL_PURCHASE' as const },
          ],
          sourceContractOrderItemId: '9223372036854775804',
        },
      ],
      proposalVersion: 3,
    };
    await validateDemandPlanCreate(request);
    await createDemandPlan(request);

    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/demand-plan/validate',
      { create: request, mode: 'CREATE' },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/demand-plan/create',
      request,
    );
    expect(JSON.stringify(request)).not.toContain('contractQuantity');
  });

  it('uses optimistic versions for update and confirm', async () => {
    const update = {
      expectedVersion: 11,
      id: '9223372036854775803',
      lines: [
        {
          allocations: [
            { quantity: '3', type: 'STOCK' as const },
            { quantity: '0', type: 'INTERNAL_FACTORY' as const },
            { quantity: '0', type: 'EXTERNAL_PURCHASE' as const },
          ],
          sourceContractOrderItemId: '9223372036854775802',
        },
      ],
    };
    await validateDemandPlanUpdate(update);
    await updateDemandPlan(update);
    await confirmDemandPlan({ expectedVersion: 12, id: update.id });

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/demand-plan/validate',
      { mode: 'UPDATE', update },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/demand-plan/update',
      update,
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/demand-plan/confirm',
      { expectedVersion: 12, id: update.id },
    );
    expect(update).not.toHaveProperty('attachmentIds');
  });

  it('creates a server-authoritative rule or manual draft without a fake model run', async () => {
    const request = {
      attachmentIds: ['9223372036854775801'],
      creationMode: 'RULE' as const,
      expectedOrderVersion: 7,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      orderId: '9223372036854775806',
      remark: '仅使用确定性合同规则建立草稿',
    };
    await createDemandPlanDirect(request);
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/demand-plan/create-direct',
      request,
    );
    expect(request).not.toHaveProperty('modelId');
    expect(request).not.toHaveProperty('generationRunId');
  });

  it('uses explicit retry and cancel transitions with run versions', async () => {
    await retryDemandPlanGeneration({ expectedVersion: '4', id: '9001' });
    await cancelDemandPlanGeneration({ expectedVersion: '5', id: '9001' });

    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/demand-plan/generation/retry',
      { expectedVersion: '4', id: '9001' },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/demand-plan/generation/cancel',
      { expectedVersion: '5', id: '9001' },
    );
  });

  it('regenerates an existing DRAFT on the same run', async () => {
    const request = {
      expectedVersion: '8',
      id: '9001',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      instruction: '采用最新核实证据',
      modelId: '7001',
    };
    await regenerateDemandPlanGeneration(request);
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/demand-plan/generation/regenerate',
      request,
    );
  });
});
