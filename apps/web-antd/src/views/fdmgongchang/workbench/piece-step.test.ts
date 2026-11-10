import type { FdmgongchangWorkbenchApi } from '#/api/fdmgongchang/workbench';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PieceStep from './modules/piece-step.vue';
import { createJob, provideJob } from './use-job';

const mocks = vi.hoisted(() => ({ matches: vi.fn(), mates: vi.fn() }));
vi.mock('#/api/fdmgongchang/workbench', () => ({
  matchWorkbenchWage: mocks.matches,
  getWorkbenchMates: mocks.mates,
}));
vi.mock('#/components/upload/image-upload.vue', () => ({ default: { render: () => null } }));

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
  }
};
function click(text: string) {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes(text));
  if (!button) throw new Error(`missing button ${text}`);
  button.click();
}

describe('slice wage confirmation', () => {
  let unmount: (() => void) | undefined;
  let job: ReturnType<typeof createJob>;
  const submit = vi.fn();
  beforeEach(() => {
    job = createJob();
    job.my = { userId: 7, userName: '王五' } as FdmgongchangWorkbenchApi.My;
    job.process = { code: 'SLICE', label: '开片', outputStage: 'SHEET', outputLabel: '已开片板材', outputUnit: '片', sources: ['BOARD'] };
    job.outputs = [
      { key: 'out-1', batchNo: '', attrs: { length: 198, width: 190, thickness: 4.5 }, goodQuantity: 2, defectQuantity: 10 },
      { key: 'out-2', batchNo: '', attrs: { length: 190, width: 132, thickness: 4.5 }, goodQuantity: 1, defectQuantity: 0 },
    ];
    mocks.matches.mockResolvedValue([{ itemId: 1, matched: true, name: '开片', price: 27, score: 0, unit: 'm³' }]);
    mocks.mates.mockResolvedValue([{ userId: 2, nickname: '张三' }, { userId: 5, nickname: '李四' }]);
  });
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });
  const mount = async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(defineComponent({
      setup() {
        provideJob(job);
        return () => h(PieceStep, { submitting: false, onSubmit: submit });
      },
    }));
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
  };

  it('shares a single volume wage among workers and recalculates shares on removal', async () => {
    await mount();
    expect(document.body.textContent).toContain('良品 0.45144 m³ × ¥27/m³');
    expect(document.body.textContent).toContain('¥12.19');
    expect(document.querySelector('[id^="piece-item-"]')).toBeNull();
    click('还有人跟我一起做');
    await flush();
    click('提交');
    await flush();
    expect(submit).not.toHaveBeenCalled();
    job.pieces[1]!.userId = 2;
    click('还有人跟我一起做');
    await flush();
    job.pieces[2]!.userId = 5;
    await flush();
    expect(document.body.textContent).toContain('由 3 人平分');
    expect(document.body.textContent).toContain('¥4.07');
    expect(document.body.textContent).toContain('¥4.06');
    expect(document.querySelector('footer')?.textContent).toContain('计件 ¥12.19');
    expect(job.pieces.map((line) => line.quantity)).toEqual(['0.45144', '0.45144', '0.45144']);
    click('去掉');
    await flush();
    expect(document.body.textContent).toContain('由 2 人平分');
    expect(document.body.textContent).toContain('¥6.10');
    expect(document.body.textContent).toContain('¥6.09');
    expect(document.querySelector('footer')?.textContent).toContain('计件 ¥12.19');
    click('提交');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('blocks repeated participants and old per-piece wage configuration', async () => {
    await mount();
    click('还有人跟我一起做');
    await flush();
    job.pieces[1]!.userId = 7;
    await flush();
    click('提交');
    expect(submit).not.toHaveBeenCalled();
    unmount?.();
    mocks.matches.mockResolvedValue([{ itemId: 1, matched: true, name: '开片1700以上', price: 24, score: 0, unit: '待定' }]);
    await mount();
    expect(document.body.textContent).toContain('开片计价未配置');
    click('提交');
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps role-based full-quantity wages for other processes', async () => {
    job.process = { ...job.process!, code: 'EMBOSS', label: '压花' };
    mocks.matches.mockResolvedValue([
      { itemId: 1, matched: true, name: '压花', role: '送片', price: 0.27, score: 0, unit: '片' },
      { itemId: 2, matched: true, name: '压花', role: '接片', price: 0.3, score: 0, unit: '片' },
    ]);
    await mount();
    click('还有人跟我一起做');
    await flush();
    expect(job.pieces.map((line) => ({ itemId: line.itemId, quantity: line.quantity }))).toEqual([
      { itemId: 1, quantity: 3 }, { itemId: 2, quantity: 3 },
    ]);
    expect(document.querySelectorAll('[id^="piece-item-"]')).toHaveLength(2);
    expect(document.querySelector('footer')?.textContent).toContain('计件 ¥1.71');
  });
});
