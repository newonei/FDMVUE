import type { TradeAiPageKey } from './types';

import { describe, expect, it } from 'vitest';

import {
  createTradePrototypeSeed,
  FORMULA_ORDER_ID,
} from '../domain/mock-data';
import {
  analyzeTradeAssistant,
  getTradeAiCommonQuestions,
  getTradeAiPageProfile,
  isGuardedAiCommand,
  TRADE_AI_PAGE_PROFILES,
} from './index';

const PAGE_KEYS: TradeAiPageKey[] = [
  'workbench',
  'customer',
  'contract-order',
  'demand-analysis',
  'supplier',
  'requisition',
  'purchase-order',
  'follow-up-customs',
  'supply-execution',
  'shipment-outbound',
  'receipt-writeoff',
  'payable-expense',
];

describe('trade AI page profiles', () => {
  it('provides dedicated common questions and role context for all 12 pages', () => {
    expect(Object.keys(TRADE_AI_PAGE_PROFILES)).toEqual(PAGE_KEYS);

    for (const pageKey of PAGE_KEYS) {
      const profile = getTradeAiPageProfile(pageKey);
      const questions = getTradeAiCommonQuestions(pageKey);
      expect(profile.pageKey).toBe(pageKey);
      expect(profile.department).not.toBe('');
      expect(profile.role).not.toBe('');
      expect(profile.scope).not.toBe('');
      expect(profile.greeting).not.toBe('');
      expect(questions).toHaveLength(5);
      expect(new Set(questions.map((item) => item.id)).size).toBe(5);
      expect(questions.every((item) => item.label && item.prompt)).toBe(true);
    }
  });
});

describe('trade AI deterministic analyzer', () => {
  it.each(PAGE_KEYS)('returns grounded evidence for %s', (pageKey) => {
    const response = analyzeTradeAssistant(createTradePrototypeSeed(), {
      now: '2026-08-27T12:00:00.000Z',
      pageKey,
      questionId: getTradeAiCommonQuestions(pageKey)[0]!.id,
    });

    expect(response.pageKey).toBe(pageKey);
    expect(response.generatedAt).toBe('2026-08-27T12:00:00.000Z');
    expect(response.summary).not.toBe('');
    expect(response.evidence.length).toBeGreaterThan(0);
    expect(response.recommendations.length).toBeGreaterThan(0);
    expect(response.dataScopeNotice).toContain('原型数据');
  });

  it('keeps actual receipt, write-off and outstanding amounts separate', () => {
    const response = analyzeTradeAssistant(createTradePrototypeSeed(), {
      now: '2026-08-27T12:00:00.000Z',
      pageKey: 'receipt-writeoff',
      questionId: 'receipt-formula',
      selectedDocument: { id: FORMULA_ORDER_ID, type: 'ORDER' },
    });

    expect(response.summary).toContain('USD 600.00');
    expect(response.summary).toContain('USD 120.00');
    expect(response.summary).toContain('USD 720.00');
    expect(response.summary).toContain('USD 280.00');
    expect(
      response.evidence.find((item) => item.label === '实际回款')?.value,
    ).toBe('USD 600.00');
    expect(
      response.evidence.find((item) => item.label === '回款冲销 / 未回款')
        ?.value,
    ).toBe('USD 720.00 / USD 280.00');
  });

  it('detects quantity conservation violations without changing state', () => {
    const state = createTradePrototypeSeed();
    state.demandAnalyses[0]!.lines[0]!.factoryQty = '2399';
    const before = structuredClone(state);

    const response = analyzeTradeAssistant(state, {
      now: '2026-08-27T12:00:00.000Z',
      pageKey: 'demand-analysis',
      questionId: 'demand-conservation',
    });

    expect(response.tone).toBe('danger');
    expect(response.summary).toContain('1 个产品行不满足数量守恒');
    expect(state).toEqual(before);
  });

  it('blocks prohibited formal actions and never mutates Pinia state', () => {
    const state = createTradePrototypeSeed();
    const before = structuredClone(state);
    const query = '帮我直接确认采购付款并核销回款';

    const response = analyzeTradeAssistant(state, {
      now: '2026-08-27T12:00:00.000Z',
      pageKey: 'payable-expense',
      query,
      selectedDocument: { id: 'PAY-202608-028-01', type: 'PAYMENT' },
    });

    expect(isGuardedAiCommand(query)).toBe(true);
    expect(response.guardrail?.mode).toBe('BLOCKED');
    expect(response.tone).toBe('danger');
    expect(response.recommendations.every((item) => item.route)).toBe(true);
    expect(state).toEqual(before);
  });

  it('requires confirmation for draft generation instead of executing it', () => {
    const state = createTradePrototypeSeed();
    const before = structuredClone(state);
    const response = analyzeTradeAssistant(state, {
      now: '2026-08-27T12:00:00.000Z',
      pageKey: 'demand-analysis',
      query: '帮我生成采购申请草稿',
    });

    expect(response.guardrail?.mode).toBe('CONFIRMATION_REQUIRED');
    expect(response.guardrail?.allowedNextStep).toContain('由你确认');
    expect(state).toEqual(before);
  });

  it.each([
    '确认付款',
    '确认出库',
    '修改库存',
    '确认海关放行',
    '自动提交采购申请',
    '替我决定供应商',
    '核销回款',
  ])('blocks the imperative high-risk command: %s', (query) => {
    const response = analyzeTradeAssistant(createTradePrototypeSeed(), {
      now: '2026-08-27T12:00:00.000Z',
      pageKey: 'workbench',
      query,
    });

    expect(isGuardedAiCommand(query)).toBe(true);
    expect(response.guardrail?.mode).toBe('BLOCKED');
  });

  it.each([
    '为什么不能确认付款？',
    '能否解释确认出库的前置条件？',
    '如何修改库存才合规？',
    '是否可以确认海关放行？',
    '哪些条件满足后可以核销回款？',
  ])('does not misclassify an explanatory question: %s', (query) => {
    const response = analyzeTradeAssistant(createTradePrototypeSeed(), {
      now: '2026-08-27T12:00:00.000Z',
      pageKey: 'workbench',
      query,
    });

    expect(isGuardedAiCommand(query)).toBe(false);
    expect(response.guardrail).toBeUndefined();
  });

  it('accepts write-off rows as selected page context', () => {
    const response = analyzeTradeAssistant(createTradePrototypeSeed(), {
      now: '2026-08-27T12:00:00.000Z',
      pageKey: 'receipt-writeoff',
      questionId: 'receipt-balance',
      selectedDocument: {
        id: 'WO-202608-1000-BAL',
        type: 'WRITE_OFF_ITEM',
      },
    });

    expect(response.evidence[0]?.value).toBe(FORMULA_ORDER_ID);
  });
});
