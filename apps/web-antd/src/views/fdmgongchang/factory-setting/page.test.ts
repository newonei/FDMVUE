import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import FactorySettingPage from './index.vue';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  myFactories: vi.fn().mockResolvedValue({
    canSeeAll: false,
    defaultFactoryId: 1,
    factories: [{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }],
  }),
  save: vi.fn(),
  setFactory: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getFactorySetting: mocks.get,
  getMyFactories: mocks.myFactories,
  saveFactorySetting: mocks.save,
  setCurrentFactoryId: mocks.setFactory,
}));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => true }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));

const processes = [
  ['MIX', '密炼挤出发泡', '板材'],
  ['SLICE', '开片', '片材'],
  ['ENGRAVE', '雕刻', '已雕刻成品'],
  ['PACK', '包装', '已包装成品'],
].map(([code, label, stage]) => ({
  code: code!,
  enabled: true,
  label: label!,
  outputStage: code!,
  outputStageLabel: stage!,
}));

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

describe('factory setting page', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('saves the processes this factory actually has', async () => {
    mocks.get.mockResolvedValue({ processes });
    mocks.save.mockResolvedValue(true);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(FactorySettingPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    expect(mocks.setFactory).toHaveBeenCalledWith(1);
    expect(document.body.textContent).toContain('黄石工厂');
    expect(document.body.textContent).toContain('产出已雕刻成品');
    const engrave = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].find((c) => c.value === 'ENGRAVE');
    engrave!.click();
    await flush();
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.replaceAll(/\s/g, '') === '保存设置')!
      .click();
    await flush();
    expect(mocks.save).toHaveBeenCalledWith({
      dailyCapacities: { ENGRAVE: null, MIX: null, PACK: null, SLICE: null },
      enabledProcesses: ['MIX', 'SLICE', 'PACK'],
      scheduleModelId: null,
    });
  });
});
