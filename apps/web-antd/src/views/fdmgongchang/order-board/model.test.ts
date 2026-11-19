import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { describe, expect, it } from 'vitest';

import { currentStage, deliveryProgress, dueHint, orderStages, stageDetails } from './model';

function step(overrides: Partial<Api.Step> = {}): Api.Step {
  return { defectQuantity: 0, goodQuantity: 0, inProgressCount: 0, label: '发泡', orderCount: 0, outputStage: 'BOARD', planned: true, process: 'MIX', state: 'NOT_STARTED', unit: '张', ...overrides };
}

function item(overrides: Partial<Api.Item> = {}): Api.Item {
  return { completedQuantity: 0, id: 11, processes: ['MIX', 'SLICE', 'PUNCH'], productId: 'SKU1', productName: 'TPE瑜伽垫', quantity: 100, unit: '条', ...overrides };
}

function order(items: Api.Item[], overrides: Partial<Api.Order> = {}): Api.Order {
  return { completedQuantity: 0, factoryId: 1, id: 1, items, orderNo: 'GD-1', requesterUserId: 1, status: 'ACCEPTED', statusLabel: '生产中', totalQuantity: 100, ...overrides };
}

describe('order board progress', () => {
  it('does not infer completion from a positive good quantity', () => {
    const stages = orderStages(order([item({ steps: [step({ goodQuantity: 1, orderCount: 1, state: 'PARTIAL' })] })]));
    expect(stages.find((s) => s.code === 'MIX')?.state).toBe('partial');
  });

  it('requires every applicable item to reach the task target', () => {
    const stages = orderStages(order([item({ steps: [step({ state: 'COMPLETED' })] }), item({ id: 12 })]));
    expect(stages.find((s) => s.code === 'MIX')?.state).toBe('partial');
  });

  it('includes shared foam tasks even when the original product route starts downstream', () => {
    const row = order([item({ processes: ['SLICE', 'PUNCH'], steps: [step({ state: 'IN_PROGRESS', sharedTaskCount: 1, taskCount: 1, claimedTaskCount: 1 })] })]);
    const foam = orderStages(row).find((s) => s.code === 'MIX');
    expect(foam?.state).toBe('running');
    expect(foam?.detail).toContain('产量不重复分摊');
    expect(currentStage(row)).toBe('发泡生产中');
  });

  it('labels manual reports without task targets as reported rather than completed', () => {
    const stages = orderStages(order([item({ steps: [step({ state: 'REPORTED', orderCount: 1, completedOrderCount: 1 })] })]));
    expect(stages.find((s) => s.code === 'MIX')?.text).toBe('已报工');
  });

  it('shows unlinked operations explicitly and retains custom operations', () => {
    const stages = orderStages(order([item({ processes: ['PUNCH'], steps: [step({ process: 'CUSTOM:QC', label: '质检', state: 'WAITING', taskCount: 1 })] })]));
    expect(stages.find((s) => s.code === 'MIX')?.text).toBe('未关联');
    expect(stages.find((s) => s.code === 'CUSTOM:QC')?.text).toBe('待生产');
  });

  it('checks stock-in and outbound per item so overshipment on one SKU cannot cover another', () => {
    const row = order([item({ completedQuantity: 110, shippedQuantity: 110 }), item({ id: 12, completedQuantity: 90, shippedQuantity: 90 })]);
    expect(orderStages(row).find((s) => s.code === 'STOCK_IN')?.state).toBe('partial');
    expect(orderStages(row).find((s) => s.code === 'OUTBOUND')?.state).toBe('partial');
    const done = order([item({ completedQuantity: 100, shippedQuantity: 100 })]);
    expect(currentStage(done)).toBe('已全部出库');
  });

  it('keeps ended order status separate from actual outbound progress', () => {
    expect(currentStage(order([item({ completedQuantity: 100 })], { status: 'COMPLETED' }))).toBe('生产订单已结束 · 待出库');
    expect(currentStage(order([item()], { status: 'CANCELLED' }))).toBe('需求已撤回');
  });

  it('calculates due warnings in factory dates and suppresses them after delivery', () => {
    expect(dueHint(order([item()], { promisedDate: '2026-11-16' }), '2026-11-17')).toBe('逾期 1 天');
    expect(dueHint(order([item()], { promisedDate: '2026-11-17' }), '2026-11-17')).toBe('今天交货');
    expect(dueHint(order([item({ completedQuantity: 100 })], { promisedDate: '2026-11-16' }), '2026-11-17')).toBe('');
  });
});

describe('order board stage details', () => {
  it('keeps each product’s own quantities and includes linked steps outside the original route', () => {
    const row = order([
      item({ id: 11, processes: ['SLICE'], steps: [step({ goodQuantity: 2, sharedTaskCount: 1, state: 'PARTIAL' })] }),
      item({ id: 12, steps: [step({ goodQuantity: 6, state: 'COMPLETED', unit: '片' })] }),
      item({ id: 13 }),
      item({ id: 14, processes: ['SLICE'] }),
      item({ id: 15, quantity: 0, steps: [step({ state: 'WAITING' })] }),
    ]);
    const foam = orderStages(row).find((stage) => stage.code === 'MIX')!;
    const details = stageDetails(row, foam);

    expect(details.stage.text).toBe('部分完成');
    expect(details.rows.map(({ item, stage, step }) => [item.id, stage.text, step?.goodQuantity, step?.unit])).toEqual([
      [11, '部分完成', 2, '张'],
      [12, '已达标', 6, '片'],
      [13, '未下发', undefined, undefined],
    ]);
    expect(stageDetails(row, foam, 12).rows.map(({ item }) => item.id)).toEqual([12]);
    expect(stageDetails(row, foam, 14)).toMatchObject({ rows: [], stage: { text: '未关联' } });
    expect(stageDetails(row, foam, 99).itemMissing).toBe(true);
  });

  it('scopes delivery records to the selected product and keeps voided records visible', () => {
    const first = item({ completedQuantity: 11, quantity: 10, shippedQuantity: 8 });
    const second = item({ id: 12, completedQuantity: 3, quantity: 4, shippedQuantity: 0, unit: '箱' });
    const delivery: NonNullable<Api.Order['deliveries']>[number] = {
      deliveredDate: '2026-11-19', deliveryNo: 'JH-1', id: 1, lines: [],
      productionOrderItemId: first.id, quantity: 11, status: 'DELIVERED',
    };
    const voided = { ...delivery, id: 2, productionOrderItemId: second.id, status: 'VOIDED' as const };
    const row = order([first, second], { deliveries: [delivery, voided] });
    const stages = orderStages(row);
    const stockIn = stages.find((stage) => stage.code === 'STOCK_IN')!;
    const outbound = stages.find((stage) => stage.code === 'OUTBOUND')!;

    expect(stageDetails(row, stockIn, second.id).deliveries).toEqual([voided]);
    expect(stageDetails(row, outbound).deliveries).toEqual([]);
    expect(deliveryProgress(first, false)).toEqual({ actual: 11, remaining: 0, target: 10 });
    expect(deliveryProgress(first, true)).toEqual({ actual: 8, remaining: 2, target: 10 });
    expect(deliveryProgress(second, false)).toEqual({ actual: 3, remaining: 1, target: 4 });
  });
});
