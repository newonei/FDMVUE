import { createApp, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ExceptionLedger from './exception-ledger.vue';

const mocks = vi.hoisted(() => ({ list: vi.fn(), view: vi.fn() }));
vi.mock('#/api/fdmgongchang/quality', () => ({
  closeException: vi.fn(),
  createException: vi.fn(),
  getExceptions: mocks.list,
  viewException: mocks.view,
}));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: () => true }) }));

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

describe('exception ledger', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('lists open exceptions with risk and records a view without closing', async () => {
    mocks.list.mockResolvedValue([
      {
        detail: '已过交期 2 天还没做完，还差 300件（交期 2026-11-02）',
        id: 1,
        orderNo: 'GD20261101-001',
        risk: 'HIGH',
        status: 'OPEN',
        title: 'GD20261101-001 粉色瑜伽垫 交期风险',
        type: 'DUE_RISK',
        typeLabel: '交期风险',
      },
      {
        closedBy: '张三',
        id: 2,
        resolution: '已再派任务补齐',
        risk: 'LOW',
        status: 'CLOSED',
        title: '冲裁 2026-11-03 粉色瑜伽垫 报工少 20件',
        type: 'SHORTAGE',
        typeLabel: '报工短产',
      },
    ]);
    mocks.view.mockResolvedValue(true);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({ render: () => h(ExceptionLedger, { factoryId: 1 }) });
    app.mount(host);
    await flush();
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN' }));
    const text = document.body.textContent?.replaceAll(/\s+/g, '') ?? '';
    expect(text).toContain('高风险');
    expect(text).toContain('已过交期2天');
    expect(text).toContain('已再派任务补齐');
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('已查看'))!.click();
    await flush();
    expect(mocks.view).toHaveBeenCalledWith(1);
    app.unmount();
  });
});
