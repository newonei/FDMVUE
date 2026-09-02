import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatWithFdmProductAi, getFdmProductAiModels } from './index';

const requestMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmproduct AI API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMocks.get.mockResolvedValue([]);
    requestMocks.post.mockResolvedValue({ answer: '', modelId: '1' });
  });

  it('loads enabled models and gives synchronous chat 75 seconds', async () => {
    await getFdmProductAiModels();
    const payload = {
      businessId: '9007199254740993',
      companyId: '9007199254740001',
      context: { pageData: { skuCount: 3 } },
      idempotencyKey: 'product-ai-1',
      modelId: '8',
      pageKey: 'product',
      pageTitle: '产品详情',
      question: '出口字段是否完整？',
    };
    await chatWithFdmProductAi(payload);

    expect(requestMocks.get).toHaveBeenCalledWith('/fdmproduct/ai/models');
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmproduct/ai/chat',
      payload,
      { timeout: 75_000 },
    );
  });
});
