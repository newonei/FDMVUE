import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chatWithFdmWaimaoAi,
  getFdmWaimaoAiCompanies,
  getFdmWaimaoAiModels,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: requestMocks,
}));

describe('fdmwaimao AI API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMocks.get.mockResolvedValue([]);
    requestMocks.post.mockResolvedValue({ answer: '', modelId: '1' });
  });

  it('先按服务端页面和对象读取可选择公司', async () => {
    const identity = { businessId: '1001', pageKey: 'customer' };
    await getFdmWaimaoAiCompanies(identity);

    expect(requestMocks.get).toHaveBeenCalledWith('/fdmwaimao/ai/companies', {
      params: identity,
    });
  });

  it('按同一页面、对象和公司策略读取模型', async () => {
    const identity = {
      businessId: '1001',
      companyId: '20',
      pageKey: 'customer',
    };
    await getFdmWaimaoAiModels(identity);

    expect(requestMocks.get).toHaveBeenCalledWith('/fdmwaimao/ai/models', {
      params: identity,
    });
  });

  it('聊天只提交身份与问题，不上传浏览器页面事实或策略字段', async () => {
    const payload = {
      businessId: '1001',
      companyId: '20',
      history: [{ content: '先看整体风险', role: 'user' as const }],
      idempotencyKey: 'request-1',
      modelId: '8',
      pageKey: 'customer',
      question: '这个客户当前有哪些需要关注的问题？',
    };

    await chatWithFdmWaimaoAi(payload);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/ai/chat',
      payload,
      { timeout: 75_000 },
    );
    expect(payload).not.toHaveProperty('context');
    expect(payload).not.toHaveProperty('pageTitle');
    expect(payload).not.toHaveProperty('routeKey');
    expect(payload).not.toHaveProperty('generationType');
    expect(payload).not.toHaveProperty('sensitivityLevel');
  });
});
