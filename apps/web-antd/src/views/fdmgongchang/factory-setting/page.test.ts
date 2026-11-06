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
  ['MIX', '发泡', '板材'],
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
      capacities: { ENGRAVE: null, MIX: null, PACK: null, SLICE: null },
      enabledProcesses: ['MIX', 'SLICE', 'PACK'],
      mixBoard: { boardsPerBatch: null, length: null, thickness: null, width: null },
      scheduleModelId: null,
    });
  });

  it('shows machines x per-machine range and saves capacities', async () => {
    const capacityOf: Record<string, object> = {
      MIX: { capacityMax: 400, capacityUnit: '张', crewMax: 3, crewMin: 2, dailyCapacity: 800, machines: 2 },
      PACK: { capacityMax: 3500, capacityMin: 1000, capacityUnit: '件', dailyCapacity: 7000, machines: 2 },
      SLICE: { capacityMax: 400, capacityUnit: '张', dailyCapacity: 400 },
    };
    mocks.get.mockResolvedValue({
      processes: processes.map((p) => ({ ...p, ...capacityOf[p.code] })),
    });
    mocks.save.mockResolvedValue(true);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(FactorySettingPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    expect(document.body.textContent).toContain('合计 2000~7000件/天');
    expect(document.querySelector<HTMLInputElement>('#capacity-crew-min-MIX')!.value).toBe('2');
    expect(document.body.textContent).toContain('合计 800张/天，一台 2~3 人');
    expect(document.querySelector('#capacity-crew-min-SLICE')).toBeNull();
    expect(document.body.textContent).toContain('张板材/天');
    const engrave = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].find((c) => c.value === 'ENGRAVE');
    engrave!.click();
    await flush();
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.replaceAll(/\s/g, '') === '保存设置')!
      .click();
    await flush();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        capacities: {
          ENGRAVE: null,
          // 发泡 2 台、每台 400 张、一台 2~3 人
          MIX: { crewMax: 3, crewMin: 2, machines: 2, max: 400, min: null },
          PACK: { crewMax: null, crewMin: null, machines: 2, max: 3500, min: 1000 },
          SLICE: { crewMax: null, crewMin: null, machines: null, max: 400, min: null },
        },
      }),
    );
  });
});
