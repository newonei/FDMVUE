import { describe, expect, it } from 'vitest';

import {
  fdmAiConversationIdentityKey,
  fdmAiPendingQuestionKey,
  isSameFdmAiConversationIdentity,
} from './types';

const identity = {
  businessId: '1001',
  companyId: '20',
  domainKey: 'fdmwaimao' as const,
  modelId: '8',
  pageKey: 'customer',
  storageKey: 'conversation:customer:20:1001',
  viewKey: 'detail:/fdmwaimao/customer/detail/1001',
};

describe('fDM AI conversation identity', () => {
  it('binds a pending question to page, object, company, model and storage key', () => {
    const key = fdmAiPendingQuestionKey(identity, '当前客户有什么风险？');

    expect(key).toContain('customer');
    expect(key).toContain('1001');
    expect(key).toContain('20');
    expect(key).toContain('8');
    expect(key).toContain('当前客户有什么风险？');
  });

  it.each([
    { businessId: '1002' },
    { companyId: '21' },
    { modelId: '9' },
    { pageKey: 'shipment' },
    { storageKey: 'conversation:shipment:20:1001' },
    { viewKey: 'form:/fdmwaimao/customer/edit/1001' },
  ])('rejects a response after identity changes: %o', (change) => {
    expect(
      isSameFdmAiConversationIdentity(identity, { ...identity, ...change }),
    ).toBe(false);
  });

  it('is stable for the exact same pending question retry', () => {
    expect(fdmAiConversationIdentityKey({ ...identity })).toBe(
      fdmAiConversationIdentityKey(identity),
    );
    expect(fdmAiPendingQuestionKey({ ...identity }, 'retry')).toBe(
      fdmAiPendingQuestionKey(identity, 'retry'),
    );
  });
});
